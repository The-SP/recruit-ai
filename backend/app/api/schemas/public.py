from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.experience_evaluation import ExperienceScoreResult
from app.schemas.skill_evaluation import SkillScoreResult


class CreateBatchRequest(BaseModel):
    """Request for creating a batch evaluation."""

    job_text: str = Field(..., min_length=1, description="Job description text")
    email: EmailStr = Field(..., description="Email for notifications")


class CreateBatchResponse(BaseModel):
    """Response after creating a batch."""

    token: str = Field(..., description="Access token for viewing results")
    uploaded: int = Field(..., description="Number of files successfully uploaded")
    failed: int = Field(..., description="Number of files that failed to upload")
    errors: list[str] = Field(
        default_factory=list, description="Error messages for failed uploads"
    )


class JobSummary(BaseModel):
    """Brief job information for status response."""

    title: str | None = None
    company_name: str | None = None


class CandidateResult(BaseModel):
    """Individual candidate result."""

    item_id: UUID
    candidate_id: UUID | None = None
    candidate_name: str | None = None
    filename: str
    final_score: float | None = None
    hire_signal: str | None = None
    status: str


class ProgressInfo(BaseModel):
    """Processing progress information."""

    total: int
    processed: int
    failed: int


class BatchStatusResponse(BaseModel):
    """Response for batch status endpoint."""

    run_id: UUID
    status: str
    progress: ProgressInfo
    job: JobSummary | None = None
    results: list[CandidateResult] = Field(default_factory=list)
    processing_time_seconds: float | None = None
    created_at: datetime


class HistoryItem(BaseModel):
    """Single evaluation run entry for the history page."""

    token: str
    job_title: str | None = None
    company_name: str | None = None
    candidate_count: int
    status: str
    created_at: datetime


class HistoryListResponse(BaseModel):
    """Response for the history listing endpoint."""

    items: list[HistoryItem]
    total: int


class AddCandidatesResponse(BaseModel):
    """Response after adding candidates to an existing batch."""

    uploaded: int = Field(..., description="Number of files successfully uploaded")
    failed: int = Field(..., description="Number of files that failed to upload")
    errors: list[str] = Field(
        default_factory=list, description="Error messages for failed uploads"
    )
    run_status: str = Field(..., description="New run status after adding candidates")


class RetryFailedResponse(BaseModel):
    """Response after retrying failed items in a batch."""

    retried: int = Field(..., description="Number of items queued for retry")
    run_status: str = Field(..., description="New run status after retry")


class CandidateBreakdownResponse(BaseModel):
    """Full evaluation breakdown for a single candidate."""

    candidate_id: UUID
    candidate_name: str | None = None
    filename: str
    final_score: float | None = None
    hire_signal: str | None = None
    skill_score: float | None = None
    experience_score: float | None = None
    education_score: float | None = None
    summary: str | None = None
    skills: SkillScoreResult | None = None
    experience: ExperienceScoreResult | None = None
    education: EducationScoreResult | None = None
