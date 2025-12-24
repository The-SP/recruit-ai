import secrets
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.core.file_storage import delete_batch_folder, ensure_folder, get_batch_folder
from app.core.logger import init_logger
from app.models.evaluation_run import (
    EvaluationRun,
    EvaluationRunItem,
    ItemStatus,
    RunStatus,
)

logger = init_logger(__name__)


class EvaluationRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_draft(self, job_id: UUID) -> EvaluationRun:
        """Create a draft evaluation run for file uploads."""
        run = EvaluationRun(
            job_id=job_id,
            folder_path="",  # Will be set after we have the ID
            status=RunStatus.DRAFT.value,
            total_count=0,
        )
        self.db.add(run)
        self.db.flush()

        # Set folder path using the generated ID
        run.folder_path = str(get_batch_folder(run.id))
        self.db.commit()
        self.db.refresh(run)

        # Create the folder on disk
        ensure_folder(run.folder_path)

        logger.info(f"Created draft evaluation run: id={run.id}")
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

    def increment_total_count(self, run_id: UUID) -> None:
        """Increment total_count when a file is added."""
        run = self.get_by_id(run_id)
        if run:
            run.total_count += 1
            self.db.commit()

    def decrement_total_count(self, run_id: UUID) -> None:
        """Decrement total_count when a file is removed."""
        run = self.get_by_id(run_id)
        if run and run.total_count > 0:
            run.total_count -= 1
            self.db.commit()

    def mark_pending(self, run_id: UUID) -> None:
        """Transition from draft to pending (ready to start)."""
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.PENDING.value
            self.db.commit()

    def mark_started(self, run_id: UUID) -> None:
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.PROCESSING.value
            run.started_at = datetime.now()
            self.db.commit()

    def mark_completed(
        self, run_id: UUID, processed_count: int, failed_count: int
    ) -> None:
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.COMPLETED.value
            run.processed_count = processed_count
            run.failed_count = failed_count
            run.completed_at = datetime.now()
            if run.started_at:
                run.processing_time_seconds = (
                    run.completed_at - run.started_at
                ).total_seconds()
            self.db.commit()
            logger.info(f"Completed evaluation run: id={run_id}")

    def mark_failed(self, run_id: UUID, error: str) -> None:
        run = self.get_by_id(run_id)
        if run:
            run.status = RunStatus.FAILED.value
            run.completed_at = datetime.now()
            self.db.commit()
            logger.error(f"Failed evaluation run: id={run_id}, error={error}")

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

        # Delete folder first (before DB record)
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

    def mark_all_pending(self, run_id: UUID):
        """Bulk update all 'uploaded' items to 'pending'. Returns count updated."""
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
