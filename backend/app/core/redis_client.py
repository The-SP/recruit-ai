"""Shared Redis client.

One connection pool for the whole process. Redis is used for several unrelated
things here -- the Celery broker, the API key rotation cursor, the rate limit
circuit breaker, and the LLM rate limiter -- and each of them used to build its
own client. That is wasteful in the API (four pools) and was an outright bug in
the health check, which constructed a fresh client on every request and never
closed it.

decode_responses is left at its default (False) on purpose: existing callers
either test for None or cast to int, and flipping it would silently change what
they read.
"""

from redis import Redis

from app.config import Config

_client: Redis | None = None


def get_redis() -> Redis:
    """Return the process-wide Redis client, creating it on first use.

    Lazy rather than module-level so importing this module does not require a
    reachable Redis -- scripts and tests can import callers without a server.
    """
    global _client
    if _client is None:
        _client = Redis.from_url(Config.REDIS_URL)
    return _client
