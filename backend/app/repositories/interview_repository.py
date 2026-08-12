import secrets
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, joinedload

from app.core.logger import init_logger
from app.interview.constants import INTERVIEW_INVITE_TTL_DAYS
from app.models.evaluation_run import EvaluationRunItem
from app.models.interview import (
    Interview,
    InterviewStatus,
    InterviewTurn,
    TurnRole,
)

logger = init_logger(__name__)


def generate_access_token() -> str:
    """Unguessable invite token, same shape as EvaluationRun.access_token."""
    return secrets.token_urlsafe(32)


def default_expires_at() -> datetime:
    """Invite expiry. Naive datetime to match the DB columns and the
    datetime.now() convention used by the other repositories."""
    return datetime.now() + timedelta(days=INTERVIEW_INVITE_TTL_DAYS)


# The states an overdue invite can expire *from*. Read by both halves of lazy
# expiry -- the row-at-a-time interview.service.apply_lazy_expiry and the bulk
# expire_overdue_for_run below -- so a listing and a detail view can't disagree
# about which invites are stale. The `expires_at < now` half can't be shared
# (one side is Python, the other SQL), but the state set is the part that moves.
OVERDUE_STATUSES = (InterviewStatus.CREATED.value, InterviewStatus.IN_PROGRESS.value)


class InterviewRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        evaluation_id: UUID,
        question_script: dict[str, Any],
        grounding: dict[str, Any],
        model_name: str,
        answer_mode: str,
        voice_mode: str,
    ) -> Interview:
        """Create an interview invite with a fresh token and expiry."""
        interview = Interview(
            evaluation_id=evaluation_id,
            access_token=generate_access_token(),
            status=InterviewStatus.CREATED.value,
            question_script=question_script,
            grounding=grounding,
            model_name=model_name,
            answer_mode=answer_mode,
            voice_mode=voice_mode,
            expires_at=default_expires_at(),
        )
        self.db.add(interview)
        self.db.commit()
        self.db.refresh(interview)
        logger.info(
            f"Created interview: id={interview.id} evaluation_id={evaluation_id}"
        )
        return interview

    def get_by_id(
        self, interview_id: UUID, with_turns: bool = False
    ) -> Interview | None:
        stmt = select(Interview).where(Interview.id == interview_id)
        if with_turns:
            stmt = stmt.options(joinedload(Interview.turns))
        return self.db.scalars(stmt).unique().first()

    def get_by_token(self, token: str, with_turns: bool = False) -> Interview | None:
        stmt = select(Interview).where(Interview.access_token == token)
        if with_turns:
            stmt = stmt.options(joinedload(Interview.turns))
        return self.db.scalars(stmt).unique().first()

    def get_by_token_for_update(self, token: str) -> Interview | None:
        """Fetch by token with a row-level lock (SELECT FOR UPDATE).

        Used by the answer path to make the after_seq check and the turn
        append atomic. The lock releases on the next db.commit().
        """
        stmt = (
            select(Interview).where(Interview.access_token == token).with_for_update()
        )
        return self.db.scalars(stmt).first()

    def get_by_evaluation_id(
        self, evaluation_id: UUID, with_turns: bool = False
    ) -> Interview | None:
        stmt = select(Interview).where(Interview.evaluation_id == evaluation_id)
        if with_turns:
            stmt = stmt.options(joinedload(Interview.turns))
        return self.db.scalars(stmt).unique().first()

    def get_turns(self, interview_id: UUID) -> list[InterviewTurn]:
        stmt = (
            select(InterviewTurn)
            .where(InterviewTurn.interview_id == interview_id)
            .order_by(InterviewTurn.seq)
        )
        return list(self.db.scalars(stmt).all())

    def rotate_token(self, interview: Interview) -> Interview:
        """Issue a new token and expiry, returning the interview to `created`.

        Callers must check the state guard first (only `created`, or `expired`
        with no answers) — the repository does not enforce policy.
        """
        interview.access_token = generate_access_token()
        interview.expires_at = default_expires_at()
        interview.status = InterviewStatus.CREATED.value
        interview.started_at = None
        self.db.commit()
        self.db.refresh(interview)
        logger.info(f"Reissued interview token: id={interview.id}")
        return interview

    def append_turns_and_advance(
        self,
        interview: Interview,
        turns: list[dict[str, Any]],
        current_question_index: int | None = None,
        followup_asked: bool | None = None,
        mark_started: bool = False,
        mark_completed: bool = False,
    ) -> list[InterviewTurn]:
        """Append turns and update progress cursors in a single commit.

        This is the only write path for turns. Keeping the inserts and the
        cursor updates in one transaction is what makes last_seq /
        current_question_index / followup_asked unable to drift from the
        transcript (see the data-model invariant in the plan).

        mark_started / mark_completed fold the status transition into the same
        commit: the turns that begin or end an interview must land atomically
        with its status, and a separate mark_* call would release the caller's
        FOR UPDATE lock between the two commits.

        Each dict in `turns` carries role, kind, content, and optional
        question_index; seq is assigned here from interview.last_seq.
        """
        created: list[InterviewTurn] = []
        seq = interview.last_seq

        for spec in turns:
            seq += 1
            turn = InterviewTurn(
                interview_id=interview.id,
                seq=seq,
                role=spec["role"],
                kind=spec["kind"],
                question_index=spec.get("question_index"),
                content=spec["content"],
            )
            self.db.add(turn)
            created.append(turn)

        interview.last_seq = seq
        if current_question_index is not None:
            interview.current_question_index = current_question_index
        if followup_asked is not None:
            interview.followup_asked = followup_asked
        if mark_started:
            interview.status = InterviewStatus.IN_PROGRESS.value
            interview.started_at = datetime.now()
        if mark_completed:
            interview.status = InterviewStatus.COMPLETED.value
            interview.completed_at = datetime.now()
            logger.info(f"Interview completed: id={interview.id}")

        self.db.commit()
        for turn in created:
            self.db.refresh(turn)
        self.db.refresh(interview)
        return created

    def get_turn_by_seq(self, interview_id: UUID, seq: int) -> InterviewTurn | None:
        """One turn by its position. Both audio call sites -- attaching the
        recording and serving it back -- need exactly this row, so neither
        loads the whole transcript to find it."""
        return self.db.scalars(
            select(InterviewTurn).where(
                InterviewTurn.interview_id == interview_id,
                InterviewTurn.seq == seq,
            )
        ).first()

    def attach_answer_audio(
        self,
        interview_id: UUID,
        seq: int,
        audio_path: str,
        audio_mime_type: str,
    ) -> bool:
        """Set-once audio metadata on an already-committed candidate turn.

        The only mutation this table allows, and deliberately not part of
        append_turns_and_advance: where the recording lives is a transport
        concern, and the engine that creates the turn must not learn about
        storage. Called after the answer stream has drained.

        Never raises. A missing turn, a non-candidate turn, or a turn that
        already has audio means the recruiter loses playback for one answer;
        blocking a committed interview on playback metadata would invert the
        priorities.
        """
        turn = self.get_turn_by_seq(interview_id, seq)

        if turn is None:
            logger.warning(
                f"Cannot attach audio: no turn seq={seq} "
                f"for interview_id={interview_id}"
            )
            return False
        if turn.role != TurnRole.CANDIDATE.value:
            logger.warning(
                f"Cannot attach audio: turn seq={seq} is a {turn.role} turn "
                f"(interview_id={interview_id})"
            )
            return False
        if turn.audio_path is not None:
            logger.warning(
                f"Cannot attach audio: turn seq={seq} already has audio "
                f"(interview_id={interview_id})"
            )
            return False

        turn.audio_path = audio_path
        turn.audio_mime_type = audio_mime_type
        self.db.commit()
        return True

    def store_assessment(
        self, interview: Interview, assessment: dict[str, Any]
    ) -> Interview:
        interview.assessment = assessment
        interview.assessment_error = None
        interview.assessed_at = datetime.now()
        interview.status = InterviewStatus.ASSESSED.value
        self.db.commit()
        self.db.refresh(interview)
        logger.info(f"Stored interview assessment: id={interview.id}")
        return interview

    def store_assessment_error(self, interview: Interview, error: str) -> Interview:
        """Record a failed assessment, leaving status at `completed` for retry."""
        interview.assessment_error = error
        self.db.commit()
        self.db.refresh(interview)
        return interview

    def mark_expired(self, interview: Interview) -> Interview:
        interview.status = InterviewStatus.EXPIRED.value
        self.db.commit()
        self.db.refresh(interview)
        logger.info(f"Interview expired: id={interview.id}")
        return interview

    def get_id_for_evaluation(self, evaluation_id: UUID) -> UUID | None:
        """The interview id for one evaluation, or None.

        Single-row twin of get_ids_for_run, for deleting one candidate out of a
        run. Returns at most one id because interviews.evaluation_id is unique.
        """
        stmt = select(Interview.id).where(Interview.evaluation_id == evaluation_id)
        return self.db.scalars(stmt).first()

    def get_ids_for_run(self, run_id: UUID) -> list[UUID]:
        """Every interview id reachable from a run, via its scored items.

        Used when a run is deleted: the interview rows cascade away with the
        evaluations, but their stored recordings have to be removed explicitly,
        and after the cascade there is nothing left to find them by.
        """
        member_evaluation_ids = (
            select(EvaluationRunItem.evaluation_id)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.evaluation_id.is_not(None))
        )
        stmt = select(Interview.id).where(
            Interview.evaluation_id.in_(member_evaluation_ids)
        )
        return list(self.db.scalars(stmt).all())

    def expire_overdue_for_run(self, run_id: UUID) -> int:
        """Bulk twin of interview.service.apply_lazy_expiry, for a whole run.

        Same rule -- there is no scheduler, so whichever request observes an
        overdue invite is the one that persists `expired` -- but folded into a
        single UPDATE. A run listing can't call mark_expired in a loop: that
        commits and refreshes per row, so N stale invites would mean N
        transactions on a GET. Both halves read OVERDUE_STATUSES.

        Usually matches zero rows.
        """
        member_evaluation_ids = (
            select(EvaluationRunItem.evaluation_id)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.evaluation_id.is_not(None))
        )
        stmt = (
            update(Interview)
            .where(Interview.evaluation_id.in_(member_evaluation_ids))
            .where(Interview.status.in_(OVERDUE_STATUSES))
            .where(Interview.expires_at < datetime.now())
            .values(status=InterviewStatus.EXPIRED.value)
        )
        result = cast(CursorResult[Any], self.db.execute(stmt))
        expired = result.rowcount or 0
        if expired:
            self.db.commit()
            logger.info(f"Expired {expired} overdue interview(s) for run {run_id}")
        return expired
