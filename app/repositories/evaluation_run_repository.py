from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.logger import init_logger
from app.models.evaluation_run import EvaluationRun, EvaluationRunItem, RunStatus

logger = init_logger(__name__)


class EvaluationRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self, job_id: UUID, folder_path: str, filenames: list[str]
    ) -> EvaluationRun:
        """Create an evaluation run with all its items"""
        run = EvaluationRun(
            job_id=job_id,
            folder_path=folder_path,
            status=RunStatus.PENDING.value,
            total_count=len(filenames),
        )
        self.db.add(run)
        self.db.flush()

        items = [
            EvaluationRunItem(
                evaluation_run_id=run.id,
                pdf_filename=filename,
                status=RunStatus.PENDING.value,
            )
            for filename in filenames
        ]
        self.db.add_all(items)
        self.db.commit()
        self.db.refresh(run)

        logger.info(f"Created evaluation run: id={run.id}, items={len(filenames)}")
        return run

    def get_by_id(self, run_id: UUID, with_items: bool = False) -> EvaluationRun | None:
        stmt = select(EvaluationRun).where(EvaluationRun.id == run_id)
        if with_items:
            stmt = stmt.options(joinedload(EvaluationRun.items))
        return self.db.scalars(stmt).first()

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


class EvaluationRunItemRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, item_id: UUID) -> EvaluationRunItem | None:
        stmt = select(EvaluationRunItem).where(EvaluationRunItem.id == item_id)
        return self.db.scalars(stmt).first()

    def get_with_run(self, item_id: UUID) -> EvaluationRunItem | None:
        """Get item with its parent run loaded"""
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.id == item_id)
            .options(joinedload(EvaluationRunItem.evaluation_run))
        )
        return self.db.scalars(stmt).first()

    def mark_started(self, item_id: UUID) -> None:
        item = self.get_by_id(item_id)
        if item:
            item.status = RunStatus.PROCESSING.value
            item.started_at = datetime.now()
            self.db.commit()

    def mark_completed(
        self, item_id: UUID, candidate_id: UUID, evaluation_id: UUID
    ) -> None:
        item = self.get_by_id(item_id)
        if item:
            item.status = RunStatus.COMPLETED.value
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
            item.status = RunStatus.FAILED.value
            item.error_message = error_message
            item.completed_at = datetime.now()
            if item.started_at:
                item.processing_time_seconds = (
                    item.completed_at - item.started_at
                ).total_seconds()
            self.db.commit()

    def get_by_run(self, run_id: UUID) -> list[EvaluationRunItem]:
        stmt = (
            select(EvaluationRunItem)
            .where(EvaluationRunItem.evaluation_run_id == run_id)
            .order_by(EvaluationRunItem.created_at)
        )
        return list(self.db.scalars(stmt).all())
