from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.job_description import JobRequirementsSchema


class JobCreateRequest(BaseModel):
    """Request body for creating a job."""

    text: str = Field(..., min_length=1, description="Raw job description text")


class JobResponse(BaseModel):
    """Response for a single job."""

    id: UUID
    job_title: str | None = None
    company_name: str | None = None
    summary: str | None = None
    requirements: JobRequirementsSchema | None = None
    is_valid_jd: bool | None = None
    document_type: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    """Paginated list of jobs."""

    items: list[JobResponse]
    total: int
    limit: int
    offset: int
