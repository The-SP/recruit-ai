from typing import Any

from celery import Celery
from celery.signals import worker_process_shutdown
from langchain_core.tracers.langchain import wait_for_all_tracers

from app.config import Config

celery_app = Celery(
    "recruit_ai",
    broker=Config.REDIS_URL,
    backend=Config.REDIS_URL,
    include=["app.worker.tasks", "app.worker.interview_tasks"],
)

celery_app.conf.update(
    # Reliability settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Fair distribution for long-running tasks
    worker_prefetch_multiplier=1,
    # Timeouts
    task_soft_time_limit=120,  # 2 min warning
    task_time_limit=300,  # 5 min hard kill
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Result expiration (24 hours)
    result_expires=86400,
)


@worker_process_shutdown.connect
def _flush_llm_traces(**_: Any) -> None:
    """Send LangSmith traces still queued when a worker process exits.

    The tracer uploads from a background thread, so a restart (every deploy)
    would otherwise drop the last batch. A no-op when tracing is off.
    """
    wait_for_all_tracers()
