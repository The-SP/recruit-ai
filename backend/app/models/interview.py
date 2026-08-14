from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, func, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.evaluation import CandidateEvaluation


class InterviewStatus(str, Enum):
    # Generated but not yet approved by a human. Has no access_token, so it is
    # unreachable by a candidate -- see Interview.access_token.
    DRAFT = "draft"
    CREATED = "created"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ASSESSED = "assessed"
    EXPIRED = "expired"


class TurnRole(str, Enum):
    INTERVIEWER = "interviewer"
    CANDIDATE = "candidate"


class TurnKind(str, Enum):
    OPENING = "opening"
    QUESTION = "question"
    FOLLOWUP = "followup"
    ANSWER = "answer"
    CLOSING = "closing"


class InterviewMode(str, Enum):
    """How the candidate gives answers. Deployment-level (Config.INTERVIEW_MODE),
    snapshotted per interview — never a per-invite or per-turn choice."""

    TEXT = "text"
    AUDIO = "audio"


class InterviewVoice(str, Enum):
    """Whether the interviewer's turns are read aloud. Deployment-level
    (Config.INTERVIEW_VOICE), snapshotted per interview for the same reason
    answer_mode is: synthesized audio either exists for an interview or it
    doesn't, and an env flip must not leave a live interview asking for speech
    nobody ever generated."""

    OFF = "off"
    ON = "on"


class Interview(Base):
    """An AI interview for one scored candidate-job pair.

    Self-contained by design: question_script and grounding are snapshotted at
    creation because candidate_evaluations rows are overwritten in place on
    re-evaluation. The engine, follow-ups, and assessment read nothing outside
    this row and its turns.
    """

    __tablename__ = "interviews"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # One interview per evaluation — also the first line of anti-restart defense.
    evaluation_id: Mapped[UUID] = mapped_column(
        ForeignKey("candidate_evaluations.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Public access — the token is the candidate's identity, as in EvaluationRun.
    #
    # NULL until a human approves the script. That is what makes the review gate
    # structural rather than a convention: a draft cannot be looked up by token
    # because it has no token, so no route needs to remember to exclude drafts.
    # Minted by InterviewRepository.approve, rotated by rotate_token.
    access_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, default=None
    )

    status: Mapped[str] = mapped_column(
        String(20), default=InterviewStatus.CREATED.value
    )

    # Frozen at creation: InterviewScript.model_dump()
    question_script: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Snapshot of everything generation and assessment read (job, resume, gaps)
    grounding: Mapped[dict[str, Any]] = mapped_column(JSONB)

    # Audit: which model generated, asks, and assesses
    model_name: Mapped[str] = mapped_column(String(100))

    # InterviewMode, snapshotted from Config.INTERVIEW_MODE at creation.
    answer_mode: Mapped[str] = mapped_column(
        String(10), server_default=InterviewMode.TEXT.value
    )

    # InterviewVoice, snapshotted from Config.INTERVIEW_VOICE at creation.
    # Synthesized speech is addressed by a key derived from the turn, so there
    # is nothing per-turn to record -- this flag is the whole schema cost.
    voice_mode: Mapped[str] = mapped_column(
        String(3), server_default=InterviewVoice.OFF.value
    )

    # Snapshotted from InterviewTemplate at approval, for the same reason
    # answer_mode and voice_mode are: editing the template must never change
    # how an interview already in flight behaves.
    followups_enabled: Mapped[bool] = mapped_column(server_default=true())

    # Progress state. Invariant: only ever updated in the same commit that
    # inserts the corresponding turn row (see InterviewRepository).
    current_question_index: Mapped[int] = mapped_column(default=0)
    followup_asked: Mapped[bool] = mapped_column(default=False)
    last_seq: Mapped[int] = mapped_column(default=0)

    # NULL while draft: expiry bounds an invite, and a draft has none. Set by
    # approve() alongside the token, so the two can't disagree.
    expires_at: Mapped[datetime | None] = mapped_column(default=None)

    # When a human approved the script. The audit record that the review gate
    # was actually passed, not just that the row moved status.
    approved_at: Mapped[datetime | None] = mapped_column(default=None)

    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    assessed_at: Mapped[datetime | None] = mapped_column(default=None)

    # InterviewAssessment.model_dump(); assessment_error set if the task failed
    assessment: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    assessment_error: Mapped[str | None] = mapped_column(Text, default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    evaluation: Mapped["CandidateEvaluation"] = relationship()
    turns: Mapped[list["InterviewTurn"]] = relationship(
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="InterviewTurn.seq",
    )

    @property
    def voice_on(self) -> bool:
        """Whether this interview's turns are spoken.

        One home for the predicate: the column stores InterviewVoice's value,
        and comparing against `.value` by hand at each call site is how one of
        them ends up subtly different from the rest.
        """
        return self.voice_mode == InterviewVoice.ON.value

    def __repr__(self) -> str:
        return (
            f"<Interview(id={self.id}, evaluation_id={self.evaluation_id}, "
            f"status={self.status})>"
        )


class InterviewTurn(Base):
    """One turn of the transcript. Append-only: never updated, never deleted.

    This is also the audit trail the hiring-AI regulatory exposure calls for.
    Content is ALWAYS text — in audio mode it is the verbatim transcript, so
    the transcript stays the primary record and the assessment input. The audio
    columns are set-once evidence attached to that text, written by the same
    request that created the turn; content itself is never rewritten.
    """

    __tablename__ = "interview_turns"

    __table_args__ = (
        UniqueConstraint("interview_id", "seq", name="uq_interview_turn_seq"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    interview_id: Mapped[UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"), index=True
    )

    seq: Mapped[int]  # 1-based, unique within an interview
    role: Mapped[str] = mapped_column(String(12))  # TurnRole
    kind: Mapped[str] = mapped_column(String(20))  # TurnKind
    question_index: Mapped[int | None] = mapped_column(default=None)
    content: Mapped[str] = mapped_column(Text)

    # Set only on candidate answer turns in audio mode; NULL on every
    # interviewer turn, every text-mode answer, and all pre-Phase-2 rows. The
    # MIME type is stored rather than derived from the extension so the serving
    # endpoint cannot drift from what the browser actually recorded.
    audio_path: Mapped[str | None] = mapped_column(Text, default=None)
    audio_mime_type: Mapped[str | None] = mapped_column(String(30), default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    interview: Mapped["Interview"] = relationship(back_populates="turns")

    def __repr__(self) -> str:
        return (
            f"<InterviewTurn(interview_id={self.interview_id}, seq={self.seq}, "
            f"role={self.role}, kind={self.kind})>"
        )
