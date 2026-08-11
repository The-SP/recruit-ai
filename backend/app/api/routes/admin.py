"""Read-only cross-tenant views for operators.

Two things this router deliberately does not do:

1. **It never writes.** No user edits, no deactivation, no deleting other
   people's runs. A read-only router makes the privilege boundary trivially
   auditable, which matters in a repo with no test suite.
2. **It does not surface any LLM budget or circuit-breaker *mutation*.**
   Those stay on `make budget-reset` / `circuit-reset` / `rate-limit-clear`,
   and scripts/llm_budget.py says outright that there is deliberately no HTTP
   endpoint for them. Putting a reset button in a browser converts an
   SSH-gated tool into a mutation surface where an admin JWT can un-throttle
   Gemini spend. `AdminStatsResponse.budget_units_used/limit` and
   `circuit_breaker_active` are the exceptions, and both are read-only:
   `get_admin_stats` calls `core.rate_limit.global_usage()` (the same read
   `make budget-status` uses) and `worker.circuit_breaker.is_circuit_breaker_active()`
   (the same read `make circuit-status` uses). Nothing here can reset, raise,
   or otherwise touch either.

The gap this closes is that nothing else in the app can see across users at
all: every other aggregate query is scoped by user_id or run id.

No handler here calls a model, so none of them call enforce_budget.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.schemas.admin import (
    AdminRunListResponse,
    AdminRunRow,
    AdminStatsResponse,
    AdminUserListResponse,
    AdminUserRow,
)
from app.auth.jwt import require_admin
from app.core.rate_limit import global_usage
from app.models.evaluation_run import RunStatus
from app.repositories.evaluation_run_repository import EvaluationRunRepository
from app.repositories.user_repository import UserRepository
from app.worker.circuit_breaker import is_circuit_breaker_active

# The guard sits on the router, not on each handler, so an endpoint added later
# cannot forget it.
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(db: Session = Depends(get_db)) -> AdminStatsResponse:
    """Deployment-wide counters."""
    users = UserRepository(db)
    runs = EvaluationRunRepository(db)

    now = datetime.now()
    total_runs = runs.count_all()
    anonymous_runs = runs.count_anonymous()
    budget_used, budget_limit = global_usage()

    return AdminStatsResponse(
        total_users=users.count(),
        new_users_7d=users.count_since(now - timedelta(days=7)),
        total_runs=total_runs,
        runs_24h=runs.count_since(now - timedelta(days=1)),
        runs_7d=runs.count_since(now - timedelta(days=7)),
        runs_by_status=runs.count_by_status(),
        total_candidates=runs.sum_candidates_all(),
        anonymous_runs=anonymous_runs,
        owned_runs=total_runs - anonymous_runs,
        budget_units_used=budget_used,
        budget_units_limit=budget_limit,
        completed_interviews=runs.count_completed_interviews_all(),
        last_run_at=runs.last_created_at_all(),
        circuit_breaker_active=is_circuit_breaker_active(),
    )


@router.get("/users", response_model=AdminUserListResponse)
def list_all_users(
    limit: int = 50,
    offset: int = 0,
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> AdminUserListResponse:
    """Every user, newest first, with their run activity.

    `search` matches full_name or email (case-insensitive substring).
    """
    user_repo = UserRepository(db)
    rollups = EvaluationRunRepository(db).rollup_by_user()

    items = []
    for user in user_repo.list_all(limit=limit, offset=offset, search=search):
        rollup = rollups.get(user.id)
        items.append(
            AdminUserRow(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                avatar_url=user.avatar_url,
                is_active=user.is_active,
                is_admin=user.is_admin,
                created_at=user.created_at,
                run_count=rollup.run_count if rollup else 0,
                last_run_at=rollup.last_run_at if rollup else None,
            )
        )

    return AdminUserListResponse(items=items, total=user_repo.count(search=search))


@router.get("/runs", response_model=AdminRunListResponse)
def list_all_runs(
    limit: int = 50,
    offset: int = 0,
    status: RunStatus | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> AdminRunListResponse:
    """Every run regardless of owner, newest first.

    Drafts are excluded unless `status=draft` is passed explicitly -- see
    EvaluationRunRepository.list_all. `search` matches job title, owner
    email, or anonymous contact email.
    """
    run_repo = EvaluationRunRepository(db)

    items = [
        AdminRunRow(
            id=run.id,
            created_at=run.created_at,
            status=run.status,
            job_title=run.job.title if run.job else None,
            company_name=run.job.company_name if run.job else None,
            total_count=run.total_count,
            processed_count=run.processed_count,
            failed_count=run.failed_count,
            processing_time_seconds=run.processing_time_seconds,
            owner_email=run.user.email if run.user else None,
            contact_email=run.email,
        )
        for run in run_repo.list_all(
            limit=limit, offset=offset, status=status, search=search
        )
    ]

    return AdminRunListResponse(
        items=items, total=run_repo.count_all(status=status, search=search)
    )
