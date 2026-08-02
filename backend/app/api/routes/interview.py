import json
import time
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.logger import init_logger

logger = init_logger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _sse_frame(event: str, data: dict[str, object]) -> str:
    """Format one SSE frame. Kept tiny on purpose — no sse-starlette dependency."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/_spike")
def spike_sse() -> StreamingResponse:
    """TEMPORARY (M1/U2): prove SSE flushes unbuffered end-to-end.

    Yields five events one second apart. Verify with:
        curl -N http://localhost:8000/interviews/_spike
    Events must arrive one per second, not all five at the end.

    Sync generator on purpose: FastAPI iterates it in a threadpool, which
    matches this codebase's synchronous SQLAlchemy sessions and route style.
    """

    def gen() -> Iterator[str]:
        for i in range(1, 6):
            yield _sse_frame("tick", {"n": i})
            time.sleep(1)
        yield _sse_frame("done", {})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
