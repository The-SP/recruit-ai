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


def build_model(model_name: str | None = None, api_key: str | None = None) -> Any:
    """Build a chat model bound to the next rotated Google API key.

    Defaults preserve the existing scorer behavior (Config.MODEL_NAME plus a
    rotated key). Interview call sites pass Config.INTERVIEW_MODEL_NAME and
    Config.INTERVIEW_GOOGLE_API_KEY.

    When api_key is given, the Redis rotation cursor is skipped entirely so a
    dedicated key does not consume rotation positions from the batch pool.
    """
    name = model_name or Config.MODEL_NAME
    if api_key:
        return init_chat_model(name, google_api_key=api_key)

    key = _next_api_key()
    if key is None:
        return init_chat_model(name)
    return init_chat_model(name, google_api_key=key)
