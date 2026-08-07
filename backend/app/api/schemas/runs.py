from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RunItemInterview(BaseModel):
    """A candidate's interview state, flat enough to render a table row.

    Deliberately not the full InterviewDetailResponse: the transcript, the
    rubric (question_script) and the assessment body stay out, so the run
    detail response doesn't carry a whole interview per candidate. The
    recruiter surface still fetches the detail endpoint when a row is opened.

    `answered` and `has_assessment_error` exist because status alone can't
    drive the row's action: an expired interview with answers is assessable
    while one without is only reissuable, and a failed assessment leaves
    status at `completed` with assessment still NULL.
    """

    status: str
    recommendation: str | None
    answered: bool
    has_assessment_error: bool
    invite_url: str
    expires_at: datetime
    completed_at: datetime | None
    assessed_at: datetime | None


class RunItemSummary(BaseModel):
    item_id: UUID
    candidate_id: UUID | None
    candidate_name: str | None
    filename: str
    final_score: float | None
    hire_signal: str | None
    status: str
    # None means no interview exists for this candidate yet.
    interview: RunItemInterview | None = None

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
