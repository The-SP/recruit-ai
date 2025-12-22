from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EvaluationCreateRequest(BaseModel):
    """Request body for creating an evaluation."""

    candidate_id: UUID
    job_id: UUID


class EvaluationResponse(BaseModel):
    """Response for a single evaluation."""

    id: UUID
    candidate_id: UUID
    job_id: UUID
    skill_score: float | None = None
    experience_score: float | None = None
    education_score: float | None = None
    final_score: float | None = None
    hire_signal: str | None = None
    summary: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RankingItem(BaseModel):
    """Single item in rankings list."""

    evaluation_id: UUID
    candidate_id: UUID
    candidate_name: str | None = None
    final_score: float | None = None
    hire_signal: str | None = None


class RankingsResponse(BaseModel):
    """Ranked candidates for a job."""

    job_id: UUID
    items: list[RankingItem]
    total: int
    limit: int
