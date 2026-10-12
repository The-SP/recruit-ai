from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class AdminStatsResponse(BaseModel):
    """Deployment-wide counters for the admin overview.

    Most of this comes from Postgres. budget_units_used/limit and
    circuit_breaker_active are reads of Redis state -- see the note in
    api/routes/admin.py for why reading them here is fine while a reset
    button would not be.
    """

    total_users: int
    new_users_7d: int
    total_runs: int
    runs_24h: int
    runs_7d: int
    runs_by_status: dict[str, int]
    total_candidates: int
    # Runs with no user_id. The demo surface has no account behind it, so this
    # is the only measure of trial usage.
    anonymous_runs: int
    owned_runs: int
    # Today's global LLM budget, read straight from core/rate_limit.py
    budget_units_used: int
    budget_units_limit: int
    # Completed or assessed interviews, across every user's non-draft runs.
    completed_interviews: int
    # None if no non-draft run has ever been created.
    last_run_at: datetime | None
    circuit_breaker_active: bool


class AdminUserRow(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    avatar_url: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime
    run_count: int
    last_run_at: datetime | None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserRow]
    total: int


class AdminRunRow(BaseModel):
    """Run metadata only.

    Deliberately carries no access_token: that token *is* the authorization
    model for the anonymous surface, so listing tokens would hand out
    everything they protect. There is also no link into the run detail --
    get_by_id_for_user filters on user_id in SQL and an admin is not the
    owner. Deep-inspecting someone else's run is a separate decision.
    """

    id: UUID
    created_at: datetime
    status: str
    job_title: str | None
    company_name: str | None
    total_count: int
    processed_count: int
    failed_count: int
    processing_time_seconds: float | None
    # None for anonymous runs; contact_email is the address the anonymous
    # submitter asked to be notified at.
    owner_email: str | None
    contact_email: str | None


class AdminRunListResponse(BaseModel):
    items: list[AdminRunRow]
    total: int


class LlmUsageStats(BaseModel):
    calls: int
    errors: int
    prompt_tokens: int
    completion_tokens: int
    # Sum over priced calls only; None when no call in the slice had a price.
    cost: float | None
    # Calls LangSmith has no model price for, so `cost` undercounts by them.
    unpriced_calls: int
    latency_p50: float | None
    latency_p99: float | None


class LlmUsageDay(BaseModel):
    day: date
    stats: LlmUsageStats


class LlmUsageModel(BaseModel):
    model: str
    stats: LlmUsageStats


class LlmUsageResponse(BaseModel):
    """Provider-call stats read from LangSmith (core/llm_usage.py).

    `configured` false means no LangSmith API key is set; every other field is
    then empty. Prompts and outputs never pass through here, only aggregates.
    """

    configured: bool
    project_name: str | None = None
    project_url: str | None = None
    days: int
    totals: LlmUsageStats | None = None
    daily: list[LlmUsageDay] = []
    by_model: list[LlmUsageModel] = []
    # The scan hit its run cap, so every number is a lower bound.
    truncated: bool = False
    fetched_at: datetime | None = None
