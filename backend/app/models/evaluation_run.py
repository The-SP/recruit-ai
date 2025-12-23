from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.evaluation import CandidateEvaluation
    from app.models.job import Job


class RunStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ItemStatus(str, Enum):
    UPLOADED = "uploaded"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))

    folder_path: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(20), default=RunStatus.DRAFT.value)

    # Counts
    total_count: Mapped[int] = mapped_column(default=0)
    processed_count: Mapped[int] = mapped_column(default=0)
    failed_count: Mapped[int] = mapped_column(default=0)

    # Time tracking
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    processing_time_seconds: Mapped[float | None] = mapped_column(default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    job: Mapped["Job"] = relationship()
    items: Mapped[list["EvaluationRunItem"]] = relationship(
        back_populates="evaluation_run", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<EvaluationRun(id={self.id}, job_id={self.job_id}, status={self.status})>"
        )


class EvaluationRunItem(Base):
    __tablename__ = "evaluation_run_items"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    evaluation_run_id: Mapped[UUID] = mapped_column(
        ForeignKey("evaluation_runs.id", ondelete="CASCADE")
    )

    # File info
    pdf_filename: Mapped[str] = mapped_column(String(255))
    file_size: Mapped[int | None] = mapped_column(default=None)  # Size in KB

    # Status tracking
    status: Mapped[str] = mapped_column(String(20), default=ItemStatus.UPLOADED.value)
    error_message: Mapped[str | None] = mapped_column(Text, default=None)

    # Links to created records (set on successful completion)
    candidate_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("candidates.id", ondelete="SET NULL"), default=None
    )
    evaluation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("candidate_evaluations.id", ondelete="SET NULL"), default=None
    )

    # Time tracking
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    processing_time_seconds: Mapped[float | None] = mapped_column(default=None)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationships
    evaluation_run: Mapped["EvaluationRun"] = relationship(back_populates="items")
    evaluation: Mapped["CandidateEvaluation | None"] = relationship()

    def __repr__(self) -> str:
        return f"<EvaluationRunItem(id={self.id}, filename={self.pdf_filename}, status={self.status})>"
