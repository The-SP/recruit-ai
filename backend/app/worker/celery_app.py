from celery import Celery

from app.config import Config

celery_app = Celery(
    "recruit_ai",
    broker=Config.REDIS_URL,
    backend=Config.REDIS_URL,
    include=["app.worker.tasks"],
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
