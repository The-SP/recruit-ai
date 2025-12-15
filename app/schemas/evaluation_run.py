from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.evaluation_run import RunStatus


class EvaluationRunItemResult(BaseModel):
    """Result summary for a single item in the run"""

    id: UUID
    pdf_filename: str
    status: RunStatus
    error_message: str | None = None
    candidate_id: UUID | None = None
    evaluation_id: UUID | None = None
    final_score: float | None = None
    hire_signal: str | None = None
    processing_time_seconds: float | None = None


class EvaluationRunResult(BaseModel):
    """Complete result of an evaluation run"""

    id: UUID
    job_id: UUID
    job_title: str | None = None
    folder_path: str
    status: RunStatus

    total_count: int
    processed_count: int
    failed_count: int

    started_at: datetime | None = None
    completed_at: datetime | None = None
    processing_time_seconds: float | None = None

    items: list[EvaluationRunItemResult] = Field(default_factory=list)


class EvaluationRunSummary(BaseModel):
    """Brief summary without item details"""

    id: UUID
    job_id: UUID
    status: RunStatus
    total_count: int
    processed_count: int
    failed_count: int
    processing_time_seconds: float | None = None
