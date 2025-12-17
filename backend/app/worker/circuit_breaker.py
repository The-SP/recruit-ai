"""
Circuit breaker logic for rate limit handling.

Provides utilities to detect, activate, and check rate limit circuit breaker state.
"""

from uuid import UUID

from redis import Redis
from sqlalchemy.orm import Session

from app.config import Config
from app.core.logger import init_logger
from app.models.database import create_session
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.worker.celery_app import get_failed_key

logger = init_logger(__name__)

redis_client = Redis.from_url(Config.REDIS_URL)

# Global circuit breaker key (no expiration - must be manually reset)
CIRCUIT_BREAKER_KEY = "rate_limit_circuit_breaker"


def is_rate_limit_error(error: Exception | str) -> bool:
    """
    Check if error is a rate limit/quota error.

    Args:
        error: Exception or error string to check

    Returns:
        True if this is a rate limit error, False otherwise
    """
    error_str = str(error)
    return (
        "ResourceExhausted" in error_str
        or "rate-limits" in error_str.lower()
        or "quota" in error_str.lower()
    )


def is_circuit_breaker_active() -> bool:
    """
    Check if rate limit circuit breaker is currently active.

    Returns:
        True if circuit breaker is active (blocking tasks), False otherwise
    """
    return redis_client.get(CIRCUIT_BREAKER_KEY) is not None


def activate_circuit_breaker() -> bool:
    """
    Activate the circuit breaker to block all tasks.

    Sets a Redis flag with no expiration if not already set.

    Returns:
        True if this call successfully activated the breaker (first one),
        False if it was already active.
    """
    # nx=True ensures we only set it if it doesn't exist
    was_set = redis_client.set(CIRCUIT_BREAKER_KEY, "1", nx=True)
    if was_set:
        logger.error(
            "🚨 Circuit breaker activated - all tasks blocked until manual reset"
        )
    return bool(was_set)


def handle_rate_limit_failure(
    item_id: UUID,
    run_id: UUID,
    error: Exception,
    db: Session,
) -> None:
    """
    Handle rate limit error: activate circuit breaker, mark run/item as failed.

    This consolidates all the rate limit failure handling logic:
    1. Activates circuit breaker to stop other tasks
    2. Marks the entire evaluation run as failed
    3. Marks the current item as failed
    4. Increments failure counter

    Args:
        item_id: UUID of the failed evaluation run item
        run_id: UUID of the evaluation run
        error: The rate limit exception that occurred
        db: Database session for marking failures
    """
    logger.error(f"🚨 RATE LIMIT HIT on item={item_id}")
    logger.error("Daily quota likely exhausted. Manual reset required.")

    # Activate circuit breaker to stop all other tasks
    # We only mark the PARENT run as failed if we are the first one to trip the breaker
    is_first_to_trip = activate_circuit_breaker()

    if is_first_to_trip:
        # Mark entire run as failed
        try:
            run_repo = EvaluationRunRepository(db)
            run_repo.mark_failed(
                run_id,
                "Rate limit exceeded (daily quota).",
            )
            logger.error(
                f"Marked run={run_id} as failed due to rate limit. Run 'make circuit-reset' after quota resets."
            )
        except Exception as e:
            logger.error(f"Failed to mark run as failed: {e}")

    # Mark this item as failed
    try:
        item_repo = EvaluationRunItemRepository(db)
        item_repo.mark_failed(item_id, f"Rate limit exceeded: {str(error)[:200]}")
        redis_client.incr(get_failed_key(str(run_id)))
    except Exception as e:
        logger.error(f"Failed to mark item as failed: {e}")


def handle_circuit_breaker_skip(item_id: UUID) -> None:
    """
    Handle skipping a task due to active circuit breaker.

    Marks the item as failed with appropriate message when circuit breaker
    prevents it from executing.

    Args:
        item_id: UUID of the evaluation run item to skip
    """
    logger.warning(f"⚠️  Skipping item={item_id} - circuit breaker active (rate limit)")

    db = create_session()
    try:
        item_repo = EvaluationRunItemRepository(db)
        item = item_repo.get_by_id(item_id)
        if item:
            item_repo.mark_failed(
                item.id, "Skipped - rate limit circuit breaker active"
            )
            redis_client.incr(get_failed_key(str(item.evaluation_run_id)))
    except Exception as e:
        logger.error(f"Failed to mark item as skipped: {e}")
    finally:
        db.close()
