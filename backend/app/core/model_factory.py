from typing import Any, cast

from langchain.chat_models import init_chat_model
from redis import Redis

from app.config import Config

_redis = Redis.from_url(Config.REDIS_URL)
_CURSOR_KEY = "google_api_key_cursor"


def _next_api_key() -> str | None:
    """Return the next Google API key in round-robin order.

    Uses an atomic Redis INCR cursor so rotation stays correct across the
    separate Celery worker processes. Returns None when no keys are configured,
    in which case the caller falls back to the ambient GOOGLE_API_KEY.
    """
    keys = Config.GOOGLE_API_KEYS
    if not keys:
        return None
    idx = cast(int, _redis.incr(_CURSOR_KEY)) % len(keys)
    return keys[idx]


def build_model() -> Any:
    """Build a chat model bound to the next rotated Google API key."""
    key = _next_api_key()
    if key is None:
        return init_chat_model(Config.MODEL_NAME)
    return init_chat_model(Config.MODEL_NAME, google_api_key=key)
