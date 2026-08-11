from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.logger import init_logger

logger = init_logger(__name__)


class NotFoundError(Exception):
    """Raised when a resource is not found."""

    def __init__(self, resource: str, resource_id: str):
        self.resource = resource
        self.resource_id = resource_id
        self.message = f"{resource} not found: {resource_id}"
        super().__init__(self.message)


class ValidationError(Exception):
    """Raised when input validation fails."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class ConflictError(Exception):
    """Raised when a request lost a concurrency race (e.g. a stale after_seq).

    409 rather than 400 so clients can tell "refetch state and retry" apart
    from "your input is invalid".
    """

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class ServiceUnavailableError(Exception):
    """Raised when a dependency we own failed and the same request is worth
    retrying unchanged (e.g. transcription).

    503 rather than 500 so clients can offer Retry: the input was fine, we
    were not.
    """

    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class RateLimitError(Exception):
    """Raised when a caller (or the deployment) is out of LLM budget.

    429 rather than 503: the request was well-formed and the service is
    healthy -- the allowance is spent. `retry_after` is seconds until the
    budget actually frees up (UTC midnight for the daily ceiling, the
    remaining wait for a cooldown), deliberately not the Redis key's TTL,
    which outlives the day it covers so the counter can be inspected later.
    """

    def __init__(self, message: str, retry_after: int):
        self.message = message
        self.retry_after = max(1, retry_after)
        super().__init__(self.message)


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers."""

    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": exc.message})

    @app.exception_handler(ValidationError)
    async def validation_error_handler(
        request: Request, exc: ValidationError
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": exc.message})

    @app.exception_handler(ConflictError)
    async def conflict_error_handler(
        request: Request, exc: ConflictError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": exc.message})

    @app.exception_handler(ServiceUnavailableError)
    async def service_unavailable_handler(
        request: Request, exc: ServiceUnavailableError
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": exc.message})

    @app.exception_handler(RateLimitError)
    async def rate_limit_handler(request: Request, exc: RateLimitError) -> JSONResponse:
        # retry_after rides in the body as well as the header because
        # CORSMiddleware does not expose response headers to JS by default.
        # main.py adds it to expose_headers too; the body is what the frontend
        # actually reads, and it works for the SSE fetch path as well.
        return JSONResponse(
            status_code=429,
            content={"detail": exc.message, "retry_after": exc.retry_after},
            headers={"Retry-After": str(exc.retry_after)},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500, content={"detail": "Internal server error"}
        )
