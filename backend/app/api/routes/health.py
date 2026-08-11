import json
from typing import Any, cast

from fastapi import APIRouter, Depends
from langchain.agents import create_agent
from pydantic import BaseModel
from redis.exceptions import RedisError
from sqlalchemy import text

from app.api.dependencies import enforce_budget, verify_api_key
from app.config import Config
from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.core.rate_limit import COST_HEALTH_PROBE
from app.core.redis_client import get_redis
from app.models.database import engine
from app.worker.celery_app import celery_app

logger = init_logger(__name__)

router = APIRouter(prefix="/health", tags=["health"])

# The LLM probe is a real billable model call, so its verdict is cached: at most
# one call per this many seconds no matter how often /detailed is polled.
_LLM_CACHE_KEY = "health:llm"
_LLM_CACHE_TTL = 300


class DetailedHealthResponse(BaseModel):
    status: str
    database: dict[str, Any]
    redis: dict[str, Any]
    celery: dict[str, Any]
    llm: dict[str, Any]


def _check_database() -> dict[str, Any]:
    """Test database connectivity."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


def _check_redis() -> dict[str, Any]:
    """Test Redis connectivity."""
    try:
        get_redis().ping()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


def _check_celery() -> dict[str, Any]:
    """Test Celery worker availability."""
    try:
        # Check if any workers are active
        inspect = celery_app.control.inspect()
        active_workers = inspect.active()

        if active_workers:
            worker_count = len(active_workers)
            return {"status": "ok", "workers": worker_count}
        else:
            return {"status": "error", "message": "No active workers found"}

    except Exception as e:
        logger.error(f"Celery health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


def _invoke_llm_probe() -> dict[str, Any]:
    """Test LLM connectivity with a minimal prompt. One billable model call."""
    try:
        # Through build_model() like every other call site, so the probe
        # participates in key rotation instead of always hitting key #1.
        agent: Any = create_agent(model=build_model())
        result = agent.invoke({"messages": [{"role": "user", "content": "say 'ok'"}]})

        if result.get("messages"):
            return {"status": "ok", "model": Config.MODEL_NAME}
        else:
            return {"status": "error", "message": "No response"}

    except Exception as e:
        logger.error(f"LLM health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


def _check_llm() -> dict[str, Any]:
    """Cached LLM probe.

    This endpoint used to make an unauthenticated Gemini call on every hit,
    which made it the cheapest way in the whole API to burn quota. Now a cached
    verdict is served for _LLM_CACHE_TTL seconds and only a miss reaches the
    model -- worst case ~12 calls/hour globally, regardless of traffic. The
    miss is also charged to the caller, so it is priced like any other LLM
    route.
    """
    try:
        client = get_redis()
        cached = cast(bytes | None, client.get(_LLM_CACHE_KEY))
        if cached is not None:
            result: dict[str, Any] = json.loads(cached)
            result["cached"] = True
            return result
    except (RedisError, ValueError) as e:
        # A broken cache must not take the health check down with it; fall
        # through to a live probe.
        logger.error(f"LLM health cache read failed: {e}")

    enforce_budget(COST_HEALTH_PROBE)
    fresh = _invoke_llm_probe()

    try:
        get_redis().set(_LLM_CACHE_KEY, json.dumps(fresh), ex=_LLM_CACHE_TTL)
    except RedisError as e:
        logger.error(f"LLM health cache write failed: {e}")

    return fresh


@router.get("")
def health_check() -> dict[str, str]:
    # Deliberately unauthenticated and dependency-free: this is what the
    # container healthcheck in docker-compose.prod.yml polls.
    return {"status": "ok"}


@router.get(
    "/detailed",
    response_model=DetailedHealthResponse,
    dependencies=[Depends(verify_api_key)],
)
def detailed_health_check() -> DetailedHealthResponse:
    """Detailed health check - tests actual connectivity.

    Gated on the api key, unlike GET /health, because this one can reach the
    model. That gate is weak on its own -- API_KEY ships to browsers as
    NEXT_PUBLIC_API_KEY and verify_api_key no-ops when it is unset -- so the
    real protections are the cache and the budget check in _check_llm.
    """
    db_status = _check_database()
    redis_status = _check_redis()
    celery_status = _check_celery()
    llm_status = _check_llm()

    overall_status = "ok"
    if any(
        s["status"] != "ok"
        for s in [db_status, redis_status, celery_status, llm_status]
    ):
        overall_status = "degraded"

    return DetailedHealthResponse(
        status=overall_status,
        database=db_status,
        redis=redis_status,
        celery=celery_status,
        llm=llm_status,
    )
