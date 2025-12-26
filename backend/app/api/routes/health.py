from typing import Any

from fastapi import APIRouter
from langchain.agents import create_agent
from pydantic import BaseModel
from redis import Redis
from sqlalchemy import text

from app.config import Config
from app.core.logger import init_logger
from app.models.database import engine
from app.worker.celery_app import celery_app

logger = init_logger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


class DetailedHealthResponse(BaseModel):
    status: str
    database: dict
    redis: dict
    celery: dict
    llm: dict


def _check_database() -> dict:
    """Test database connectivity."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


def _check_redis() -> dict:
    """Test Redis connectivity."""
    try:
        redis_client = Redis.from_url(Config.REDIS_URL)
        redis_client.ping()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


def _check_celery() -> dict:
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


def _check_llm() -> dict:
    """Test LLM connectivity with minimal prompt."""
    try:
        agent: Any = create_agent(model=Config.MODEL_NAME)
        result = agent.invoke({"messages": [{"role": "user", "content": "say 'ok'"}]})

        if result.get("messages"):
            return {"status": "ok", "model": Config.MODEL_NAME}
        else:
            return {"status": "error", "message": "No response"}

    except Exception as e:
        logger.error(f"LLM health check failed: {e}")
        return {"status": "error", "message": str(e)[:100]}


@router.get("")
def health_check():
    return {"status": "ok"}


@router.get("/detailed", response_model=DetailedHealthResponse)
def detailed_health_check() -> DetailedHealthResponse:
    """Detailed health check - tests actual connectivity."""
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
