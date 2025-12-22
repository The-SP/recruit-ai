from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BatchCreateRequest(BaseModel):
    """Request body for starting a batch evaluation."""

    job_id: UUID
    folder_path: str = Field(..., min_length=1, description="Path to folder with PDFs")


class BatchRunResponse(BaseModel):
    """Response for batch run status."""

    id: UUID
    job_id: UUID
    folder_path: str
    status: str
    total_count: int
    processed_count: int
    failed_count: int
    started_at: datetime | None = None
    completed_at: datetime | None = None
    processing_time_seconds: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BatchResultItem(BaseModel):
    """Single result in batch results."""

    candidate_id: UUID | None = None
    candidate_name: str | None = None
    filename: str
    final_score: float | None = None
    hire_signal: str | None = None
    status: str


class BatchResultsResponse(BaseModel):
    """Results from a completed batch run."""

    run_id: UUID
    status: str
    items: list[BatchResultItem]
    total: int
