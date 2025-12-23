from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BatchCreateRequest(BaseModel):
    """Request body for creating a batch run."""

    job_id: UUID


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


class BatchFileResponse(BaseModel):
    """Response for a single uploaded file."""

    id: UUID
    filename: str = Field(alias="pdf_filename")
    file_size: int | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class BatchFileUploadResult(BaseModel):
    """Result for a single file in batch upload."""

    filename: str
    success: bool
    file_id: UUID | None = None
    error: str | None = None


class BatchFilesUploadResponse(BaseModel):
    """Response for batch file upload."""

    uploaded: int
    failed: int
    results: list[BatchFileUploadResult]


class BatchFilesListResponse(BaseModel):
    """Response for listing uploaded files."""

    items: list[BatchFileResponse]
    total: int


class BatchResultItem(BaseModel):
    """Single result item in batch results."""

    candidate_id: UUID | None = None
    candidate_name: str | None = None
    filename: str
    final_score: float | None = None
    hire_signal: str | None = None
    status: str


class BatchResultsResponse(BaseModel):
    """Response for batch results."""

    run_id: UUID
    status: str
    items: list[BatchResultItem]
    total: int
