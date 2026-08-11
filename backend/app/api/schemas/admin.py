from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AdminStatsResponse(BaseModel):
    """Deployment-wide counters for the admin overview.

    Everything here comes from Postgres. LLM budget and circuit-breaker state
    live in Redis and stay on the Makefile (`make budget-status`,
    `make circuit-status`) -- see the note in api/routes/admin.py.
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
