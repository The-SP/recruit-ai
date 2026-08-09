import secrets
from datetime import datetime
from typing import Any, NamedTuple, cast
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, joinedload

from app.core.file_storage import (
    delete_batch_folder,
    delete_interview_audio,
    ensure_folder,
    get_batch_folder,
)
from app.core.logger import init_logger
from app.models.evaluation import CandidateEvaluation
from app.models.evaluation_run import (
    EvaluationRun,
    EvaluationRunItem,
    ItemStatus,
    RunStatus,
)
from app.models.interview import (
    Interview,
    InterviewStatus,
    InterviewTurn,
    TurnRole,
)
from app.repositories.interview_repository import InterviewRepository

logger = init_logger(__name__)


class InterviewRow(NamedTuple):
    """Flat interview state for one run item, as read by
    get_interview_rows_for_run. Named so the row stays typed under mypy
    strict, and so callers don't index into a raw SQLAlchemy Row."""

    status: str
    recommendation: str | None
    answered: bool
    has_assessment_error: bool
    access_token: str
    expires_at: datetime
    completed_at: datetime | None
    assessed_at: datetime | None


class EvaluationRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def _create_draft_internal(
        self, job_id: UUID, user_id: UUID | None = None
    ) -> EvaluationRun:
        run = EvaluationRun(
            job_id=job_id,
            folder_path="",
            status=RunStatus.DRAFT.value,
            total_count=0,
            user_id=user_id,
        )
        self.db.add(run)
        self.db.flush()
        run.folder_path = str(get_batch_folder(run.id))
        self.db.commit()
        self.db.refresh(run)
        ensure_folder(run.folder_path)
        return run

    def create_draft(self, job_id: UUID) -> EvaluationRun:
        """Create a draft evaluation run for file uploads."""
        run = self._create_draft_internal(job_id)
        logger.info(f"Created draft evaluation run: id={run.id}")
        return run

    def create_for_user(self, job_id: UUID, user_id: UUID) -> EvaluationRun:
        """Create a draft evaluation run tied to an authenticated user."""
        run = self._create_draft_internal(job_id, user_id=user_id)
        logger.info(f"Created evaluation run for user={user_id}: id={run.id}")
        return run

    def create_with_token(self, job_id: UUID, email: str) -> tuple[EvaluationRun, str]:
        """
        Create an evaluation run with access token for public API.

        Args:
            job_id: UUID of the job to evaluate against
            email: Email address for notifications

        Returns:
            Tuple of (EvaluationRun, access_token)
        """
        token = secrets.token_urlsafe(32)

        run = EvaluationRun(
            job_id=job_id,
            folder_path="",
            status=RunStatus.DRAFT.value,
            total_count=0,
            access_token=token,
            email=email,
        )
        self.db.add(run)
        self.db.flush()

        run.folder_path = str(get_batch_folder(run.id))
        self.db.commit()
        self.db.refresh(run)

        ensure_folder(run.folder_path)

        logger.info(f"Created evaluation run with token: id={run.id}")
        return run, token

    def get_by_id(self, run_id: UUID, with_items: bool = False) -> EvaluationRun | None:
        stmt = select(EvaluationRun).where(EvaluationRun.id == run_id)
        if with_items:
            stmt = stmt.options(joinedload(EvaluationRun.items))
        return self.db.scalars(stmt).first()

    def get_by_token(
        self,
        token: str,
        with_items: bool = False,
        with_job: bool = False,
    ) -> EvaluationRun | None:
        """
        Retrieve an evaluation run by its access token.

        Args:
            token: The access token
            with_items: Whether to eagerly load items
            with_job: Whether to eagerly load job details

        Returns:
            EvaluationRun or None if not found
        """
        stmt = select(EvaluationRun).where(EvaluationRun.access_token == token)

        if with_items:
            stmt = stmt.options(
                joinedload(EvaluationRun.items).joinedload(EvaluationRunItem.evaluation)
            )
        if with_job:
            stmt = stmt.options(joinedload(EvaluationRun.job))

        return self.db.scalars(stmt).first()

    def get_by_token_for_update(self, token: str) -> EvaluationRun | None:
        """Fetch run by token with a row-level lock (SELECT FOR UPDATE).

        Use when you need to check-then-modify status atomically. The lock
        is released on the next db.commit() or when the session closes.
        """
        stmt = (
            select(EvaluationRun)
            .where(EvaluationRun.access_token == token)
            .with_for_update()
        )
        return self.db.scalars(stmt).first()

    def adjust_total_count(self, run_id: UUID, delta: int = 1) -> None:
        """Adjust total_count by delta (positive to add, negative to remove)."""
        run = self.get_by_id(run_id)
        if run:
            run.total_count += delta
            self.db.commit()

    def mark_pending(self, run_id: UUID) -> None:
        """Transition from draft to pending (ready to start)."""
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.PENDING.value
            self.db.commit()

    def mark_reopened(self, run_id: UUID) -> None:
        """Transition a completed/failed run back to pending for adding new candidates."""
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.PENDING.value
            run.completed_at = None  # cleared so mark_completed can compute wave delta
            run.started_at = None  # cleared so wave duration is measured from new start
            run.failed_count = 0
            self.db.commit()
            logger.info(f"Reopened evaluation run: id={run_id}")

    def mark_started(self, run_id: UUID) -> None:
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.PROCESSING.value
            run.started_at = datetime.now()
            self.db.commit()

    def mark_completed(self, run_id: UUID) -> None:
        run = self.get_by_id(run_id)
        if run:
            item_repo = EvaluationRunItemRepository(self.db)
            run.processed_count = item_repo.count_by_status(
                run_id, ItemStatus.COMPLETED
            )
            run.failed_count = item_repo.count_by_status(run_id, ItemStatus.FAILED)
            run.status = RunStatus.COMPLETED.value
            run.completed_at = datetime.now()
            if run.started_at:
                current_wave = (run.completed_at - run.started_at).total_seconds()
                run.processing_time_seconds = (
                    run.processing_time_seconds or 0
                ) + current_wave
            self.db.commit()
            logger.info(f"Completed evaluation run: id={run_id}")

    def mark_failed(self, run_id: UUID, error: str) -> None:
        run = self.get_by_id(run_id)
        if run:
            item_repo = EvaluationRunItemRepository(self.db)
            run.processed_count = item_repo.count_by_status(
                run_id, ItemStatus.COMPLETED
            )
            run.failed_count = item_repo.count_by_status(run_id, ItemStatus.FAILED)
            run.status = RunStatus.FAILED.value
            run.completed_at = datetime.now()
            self.db.commit()
            logger.error(f"Failed evaluation run: id={run_id}, error={error}")

    def get_all(self, limit: int = 50, offset: int = 0) -> list[EvaluationRun]:
        """List all non-draft evaluation runs, newest first, with job eagerly loaded."""
        stmt = (
            select(EvaluationRun)
            .where(EvaluationRun.status != RunStatus.DRAFT.value)
            .options(joinedload(EvaluationRun.job))
            .order_by(EvaluationRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique().all())

    def get_by_user(
        self,
        user_id: UUID,
        limit: int = 50,
        offset: int = 0,
        with_job: bool = True,
    ) -> list[EvaluationRun]:
        """List non-draft runs for a user, newest first."""
        stmt = (
            select(EvaluationRun)
            .where(EvaluationRun.user_id == user_id)
            .where(EvaluationRun.status != RunStatus.DRAFT.value)
            .order_by(EvaluationRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if with_job:
            stmt = stmt.options(joinedload(EvaluationRun.job))
        return list(self.db.scalars(stmt).unique().all())

    def get_by_id_for_user(
        self,
        run_id: UUID,
        user_id: UUID,
        with_items: bool = False,
        with_job: bool = False,
    ) -> EvaluationRun | None:
        """Get a run by ID, enforcing ownership by user_id."""
        stmt = (
            select(EvaluationRun)
            .where(EvaluationRun.id == run_id)
            .where(EvaluationRun.user_id == user_id)
        )
        if with_items:
            stmt = stmt.options(
                joinedload(EvaluationRun.items).joinedload(EvaluationRunItem.evaluation)
            )
        if with_job:
            stmt = stmt.options(joinedload(EvaluationRun.job))
        return self.db.scalars(stmt).unique().first()

    def get_interview_rows_for_run(self, run_id: UUID) -> dict[UUID, InterviewRow]:
        """Interview state for every item in a run, keyed by run item id.

        Joins interviews straight onto run items via evaluation_id (unique and
        indexed on interviews), so candidate_evaluations isn't needed. Scalar
        columns only: question_script and grounding are the largest columns on
        the row and nothing here displays them. `recommendation` is pulled out
        of the assessment JSONB in SQL, which is why surfacing it needs no
        migration, and `answered` is an EXISTS so the transcript stays unread.

        Items with no interview are simply absent from the map.
        """
        answered = (
            select(1)
            .where(InterviewTurn.interview_id == Interview.id)
            .where(InterviewTurn.role == TurnRole.CANDIDATE.value)
            .exists()
        )
        stmt = (
            select(
                EvaluationRunItem.id.label("item_id"),
                Interview.status.label("status"),
                Interview.assessment["recommendation"].astext.label("recommendation"),
                answered.label("answered"),
                Interview.assessment_error.is_not(None).label("has_assessment_error"),
                Interview.access_token.label("access_token"),
                Interview.expires_at.label("expires_at"),
                Interview.completed_at.label("completed_at"),
                Interview.assessed_at.label("assessed_at"),
            )
            .join(Interview, Interview.evaluation_id == EvaluationRunItem.evaluation_id)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
        )
        return {
            row.item_id: InterviewRow(
                status=row.status,
                recommendation=row.recommendation,
                answered=row.answered,
                has_assessment_error=row.has_assessment_error,
                access_token=row.access_token,
                expires_at=row.expires_at,
                completed_at=row.completed_at,
                assessed_at=row.assessed_at,
            )
            for row in self.db.execute(stmt)
        }

    def get_by_id_for_user_for_update(
        self, run_id: UUID, user_id: UUID
    ) -> EvaluationRun | None:
        """Get a run with a row-level lock, enforcing ownership."""
        stmt = (
            select(EvaluationRun)
            .where(EvaluationRun.id == run_id)
            .where(EvaluationRun.user_id == user_id)
            .with_for_update()
        )
        return self.db.scalars(stmt).first()

    def count_by_user(self, user_id: UUID) -> int:
        """Count non-draft runs for a user."""
        stmt = (
            select(func.count())
            .select_from(EvaluationRun)
            .where(EvaluationRun.user_id == user_id)
            .where(EvaluationRun.status != RunStatus.DRAFT.value)
        )
        return self.db.scalar(stmt) or 0

    def sum_candidates_by_user(self, user_id: UUID) -> int:
        """Sum total_count across all non-draft runs for a user."""
        stmt = (
            select(func.coalesce(func.sum(EvaluationRun.total_count), 0))
            .where(EvaluationRun.user_id == user_id)
            .where(EvaluationRun.status != RunStatus.DRAFT.value)
        )
        return self.db.scalar(stmt) or 0

    def count_completed_interviews_by_user(self, user_id: UUID) -> int:
        """Interviews the candidate finished, across a user's non-draft runs.

        Counts `assessed` as well as `completed`: assessment is an automatic
        follow-on, so counting only `completed` would show a number that
        silently drops as the worker catches up.
        """
        stmt = (
            select(func.count())
            .select_from(Interview)
            .join(
                EvaluationRunItem,
                EvaluationRunItem.evaluation_id == Interview.evaluation_id,
            )
            .join(
                EvaluationRun,
                EvaluationRun.id == EvaluationRunItem.evaluation_run_id,
            )
            .where(EvaluationRun.user_id == user_id)
            .where(EvaluationRun.status != RunStatus.DRAFT.value)
            .where(
                Interview.status.in_(
                    (
                        InterviewStatus.COMPLETED.value,
                        InterviewStatus.ASSESSED.value,
                    )
                )
            )
        )
        return self.db.scalar(stmt) or 0

    def last_active_by_user(self, user_id: UUID) -> datetime | None:
        """Return created_at of the most recent completed run for a user."""
        stmt = (
            select(EvaluationRun.created_at)
            .where(EvaluationRun.user_id == user_id)
            .where(EvaluationRun.status == RunStatus.COMPLETED.value)
            .order_by(EvaluationRun.created_at.desc())
            .limit(1)
        )
        return self.db.scalar(stmt)

    def get_by_job(self, job_id: UUID, limit: int = 10) -> list[EvaluationRun]:
        stmt = (
            select(EvaluationRun)
            .where(EvaluationRun.job_id == job_id)
            .order_by(EvaluationRun.created_at.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def delete(self, run_id: UUID) -> bool:
        """Delete evaluation run and its folder."""
        run = self.get_by_id(run_id)
        if not run:
            return False

        # Delete stored files first (before the DB record): the cascade removes
        # interviews and their turns, after which nothing points at the
        # recordings any more.
        for interview_id in InterviewRepository(self.db).get_ids_for_run(run_id):
            delete_interview_audio(interview_id)
        delete_batch_folder(run_id)

        self.db.delete(run)
        self.db.commit()
        logger.info(f"Deleted evaluation run: id={run_id}")
        return True


class EvaluationRunItemRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_uploaded(
        self, run_id: UUID, filename: str, file_size: int
    ) -> EvaluationRunItem:
        """Create an item for an uploaded file."""
        item = EvaluationRunItem(
            evaluation_run_id=run_id,
            pdf_filename=filename,
            file_size=file_size,
            status=ItemStatus.UPLOADED.value,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        logger.info(f"Created uploaded item: id={item.id}, filename={filename}")
        return item

    def get_by_id(self, item_id: UUID) -> EvaluationRunItem | None:
        stmt = select(EvaluationRunItem).where(EvaluationRunItem.id == item_id)
        return self.db.scalars(stmt).first()

    def get_with_run(self, item_id: UUID) -> EvaluationRunItem | None:
        """Get item with its parent run loaded."""
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.id == item_id)
            .options(joinedload(EvaluationRunItem.evaluation_run))
        )
        return self.db.scalars(stmt).first()

    def get_by_run(self, run_id: UUID) -> list[EvaluationRunItem]:
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .order_by(EvaluationRunItem.created_at)
        )
        return list(self.db.scalars(stmt).all())

    def get_uploaded_items(self, run_id: UUID) -> list[EvaluationRunItem]:
        """Get items with 'uploaded' status for a run."""
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.status == ItemStatus.UPLOADED.value)
            .order_by(EvaluationRunItem.created_at)
        )
        return list(self.db.scalars(stmt).all())

    def mark_uploaded_as_pending(self, run_id: UUID) -> None:
        """Bulk update all 'uploaded' items to 'pending'."""
        stmt = (
            update(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.status == ItemStatus.UPLOADED.value)
            .values(status=ItemStatus.PENDING.value)
        )
        self.db.execute(stmt)
        self.db.commit()

    def delete_item(self, item_id: UUID) -> bool:
        """Delete an item. Returns True if deleted."""
        item = self.get_by_id(item_id)
        if item:
            self.db.delete(item)
            self.db.commit()
            logger.info(f"Deleted item: id={item_id}")
            return True
        return False

    def filename_exists(self, run_id: UUID, filename: str) -> bool:
        """Check if filename already exists in run."""
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.pdf_filename == filename)
        )
        return self.db.scalars(stmt).first() is not None

    def mark_started(self, item_id: UUID) -> None:
        item = self.get_by_id(item_id)
        if item:
            item.status = ItemStatus.PROCESSING.value
            item.started_at = datetime.now()
            self.db.commit()

    def mark_completed(
        self, item_id: UUID, candidate_id: UUID, evaluation_id: UUID
    ) -> None:
        item = self.get_by_id(item_id)
        if item:
            item.status = ItemStatus.COMPLETED.value
            item.candidate_id = candidate_id
            item.evaluation_id = evaluation_id
            item.completed_at = datetime.now()
            if item.started_at:
                item.processing_time_seconds = (
                    item.completed_at - item.started_at
                ).total_seconds()
            self.db.commit()

    def mark_failed(self, item_id: UUID, error_message: str) -> None:
        item = self.get_by_id(item_id)
        if item:
            item.status = ItemStatus.FAILED.value
            item.error_message = error_message
            item.completed_at = datetime.now()
            if item.started_at:
                item.processing_time_seconds = (
                    item.completed_at - item.started_at
                ).total_seconds()
            self.db.commit()

    def get_failed_items(self, run_id: UUID) -> list[EvaluationRunItem]:
        """Get items with 'failed' status for a run."""
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.status == ItemStatus.FAILED.value)
            .order_by(EvaluationRunItem.created_at)
        )
        return list(self.db.scalars(stmt).all())

    def count_by_status(self, run_id: UUID, status: ItemStatus) -> int:
        """Count items in a given status for a run."""
        stmt = (
            select(func.count())
            .select_from(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.status == status.value)
        )
        return self.db.scalar(stmt) or 0

    def mark_pending_items_as_failed(self, run_id: UUID, error_message: str) -> int:
        """Bulk mark all pending items in a run as failed."""
        now = datetime.now()
        stmt = (
            update(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .where(EvaluationRunItem.status == ItemStatus.PENDING.value)
            .values(
                status=ItemStatus.FAILED.value,
                error_message=error_message,
                completed_at=now,
            )
        )
        result = cast(CursorResult[Any], self.db.execute(stmt))
        self.db.commit()
        return result.rowcount

    def mark_items_as_pending(self, item_ids: list[UUID]) -> int:
        """Bulk reset specific items to pending status, clearing error state."""
        stmt = (
            update(EvaluationRunItem)
            .where(EvaluationRunItem.id.in_(item_ids))
            .values(
                status=ItemStatus.PENDING.value,
                error_message=None,
                started_at=None,
                completed_at=None,
                processing_time_seconds=None,
            )
        )
        result = cast(CursorResult[Any], self.db.execute(stmt))
        self.db.commit()
        return result.rowcount
