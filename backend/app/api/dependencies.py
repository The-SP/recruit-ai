from app.api.exceptions import RateLimitError
from app.core import rate_limit

# Re-export database dependency
from app.models.database import get_db

__all__ = ["enforce_budget", "enforce_cooldown", "get_db"]


# ---------------------------------------------------------------------------
# LLM budget
# ---------------------------------------------------------------------------

# One budget, one message. There is no per-caller bucket, so there is nothing
# caller-specific to say -- the honest statement is that the deployment is out
# for the day. Rendered verbatim by the frontend.
_BUDGET_MESSAGE = (
    "The service has reached its daily AI capacity. Please try again tomorrow."
)


def enforce_budget(cost: int) -> None:
    """Spend `cost` LLM units, raising RateLimitError if the day's budget is gone.

    Call this at the top of a handler, after cheap validation but before any
    model call or Celery dispatch -- the same placement discipline
    enforce_anonymous_resume_cap uses in core/file_upload.py, so a rejected
    request costs no quota.

    The matching refund lives in core/rate_limit.py: it maps to no HTTP
    behaviour, so unlike this it needs no wrapper here.
    """
    wait = rate_limit.consume(cost)
    if wait:
        raise RateLimitError(_BUDGET_MESSAGE, wait)


def enforce_cooldown(key: str, message: str) -> None:
    """Allow one action per RETRY_COOLDOWN_SECONDS for `key`, else raise 429.

    Separate from enforce_budget() because a budget and a cooldown answer
    different attacks: the daily budget alone would let a hundred scripted retry clicks
    through as long as units remain.
    """
    remaining = rate_limit.cooldown(key, rate_limit.RETRY_COOLDOWN_SECONDS)
    if remaining:
        raise RateLimitError(message, remaining)
