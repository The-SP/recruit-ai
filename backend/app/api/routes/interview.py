"""Candidate-facing interview endpoints. The invite token in the path is the
candidate's identity (same trust model as the batch flow); responses must
never include the script, the rubric, or the assessment.
"""

import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import ConflictError, NotFoundError, ValidationError
from app.api.schemas.interview import (
    AnswerRequest,
    InterviewStateResponse,
    build_state_response,
    build_turn_out,
)
from app.core.logger import init_logger
from app.interview import engine
from app.interview.service import apply_lazy_expiry
from app.models.database import create_session
from app.models.interview import Interview, InterviewStatus
from app.repositories.interview_repository import InterviewRepository
from app.worker.interview_tasks import assess_interview

logger = init_logger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _sse_frame(event: str, data: dict[str, object]) -> str:
    """Format one SSE frame. Kept tiny on purpose: no sse-starlette dependency."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _event_frame(event: engine.EngineEvent) -> str | None:
    """Map one EngineEvent to its SSE frame (the thin side of the seam).

    Returns None for events with no candidate-facing frame; the protocol is
    append-only, so nothing is emitted for them.
    """
    if isinstance(event, engine.AnswerAccepted):
        return _sse_frame("ack", {"answer_seq": event.answer_seq})
    if isinstance(event, engine.InterviewerTurn):
        return _sse_frame("turn", build_turn_out(event.turn).model_dump(mode="json"))
    if isinstance(event, engine.StateChanged):
        return _sse_frame(
            "state",
            {
                "status": event.status,
                "question_number": event.question_number,
                "total_questions": event.total_questions,
                "time_remaining_seconds": event.time_remaining_seconds,
            },
        )
    return None


def _load_by_token(db: Session, token: str) -> Interview:
    interview = InterviewRepository(db).get_by_token(token)
    if not interview:
        raise NotFoundError("Interview", token)
    return apply_lazy_expiry(db, interview)


@router.get("/{token}", response_model=InterviewStateResponse)
def get_interview_state(
    token: str, db: Session = Depends(get_db)
) -> InterviewStateResponse:
    """Current state + transcript so far. The client renders from this on
    every mount and reconnect; SSE events only advance live state."""
    interview = _load_by_token(db, token)
    turns = InterviewRepository(db).get_turns(interview.id)
    return build_state_response(interview, turns)


@router.post("/{token}/start", response_model=InterviewStateResponse)
def start_interview(
    token: str, db: Session = Depends(get_db)
) -> InterviewStateResponse:
    """Begin the interview: opening + first question. Idempotent while
    in_progress so a refresh-then-click is harmless."""
    repo = InterviewRepository(db)
    # Row lock: two racing starts would both read last_seq=0 and collide on
    # the unique (interview_id, seq) constraint.
    interview = repo.get_by_token_for_update(token)
    if not interview:
        raise NotFoundError("Interview", token)
    interview = apply_lazy_expiry(db, interview)

    if interview.status == InterviewStatus.CREATED.value:
        engine.start_interview(db, interview)
    elif interview.status != InterviewStatus.IN_PROGRESS.value:
        raise ValidationError(
            f"Interview cannot be started (status: '{interview.status}')."
        )

    turns = repo.get_turns(interview.id)
    return build_state_response(interview, turns)


def _precheck_answer(token: str, after_seq: int) -> None:
    """Run the engine's answer rules before streaming starts, so failures get
    real HTTP codes.

    Exception handlers cannot fire once the response body has begun; anything
    rejected after this point surfaces as an SSE `error` event instead. The
    engine re-validates under the row lock, so a race lost between this check
    and the lock is still caught.
    """
    db = create_session()
    try:
        engine.validate_answerable(db, _load_by_token(db, token), after_seq)
    finally:
        db.close()


@router.post("/{token}/answers")
def submit_answer(token: str, body: AnswerRequest) -> StreamingResponse:
    """Accept one answer and stream the interviewer's reaction (SSE).

    Deliberately no Depends(get_db): a request-scoped session would stay
    pinned to this connection for the whole stream. The generator opens its
    own session (worker discipline) and closes it in finally.
    """
    _precheck_answer(token, body.after_seq)

    def gen() -> Iterator[str]:
        db = create_session()
        try:
            interview = InterviewRepository(db).get_by_token_for_update(token)
            if not interview:
                yield _sse_frame("error", {"detail": "Interview not found."})
                return
            for event in engine.submit_answer(
                db, interview, body.content, body.after_seq
            ):
                if isinstance(event, engine.InterviewClosed):
                    # Routes dispatch, workers execute -- the same split as
                    # batch.py. Keeps app.worker out of the engine.
                    assess_interview.delay(str(event.interview_id))
                    continue
                frame = _event_frame(event)
                if frame is not None:
                    yield frame
            yield _sse_frame("done", {})
        except (ValidationError, ConflictError) as e:
            # Lost a race between the precheck and the lock (e.g. another
            # tab answered first). The client refetches GET state.
            yield _sse_frame("error", {"detail": e.message})
        except Exception:
            logger.exception("Interview answer stream failed")
            yield _sse_frame(
                "error", {"detail": "Something went wrong. Refresh and try again."}
            )
        finally:
            db.close()

    return StreamingResponse(gen(), media_type="text/event-stream", headers=SSE_HEADERS)
