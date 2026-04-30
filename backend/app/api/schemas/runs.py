from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RunItemSummary(BaseModel):
    item_id: UUID
    candidate_id: UUID | None
    candidate_name: str | None
    filename: str
    final_score: float | None
    hire_signal: str | None
    status: str

    model_config = {"from_attributes": True}


class EvaluationRunSummary(BaseModel):
    id: UUID
    job_id: UUID
    job_title: str | None
    company_name: str | None
    status: str
    total_count: int
    processed_count: int
    failed_count: int
    processing_time_seconds: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EvaluationRunDetail(EvaluationRunSummary):
    items: list[RunItemSummary]


class EvaluationRunListResponse(BaseModel):
    items: list[EvaluationRunSummary]
    total: int


class DashboardStatsResponse(BaseModel):
    total_runs: int
    total_candidates: int
    last_active: datetime | None
