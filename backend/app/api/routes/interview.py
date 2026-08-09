"""Candidate-facing interview endpoints. The invite token in the path is the
candidate's identity (same trust model as the batch flow); responses must
never include the script, the rubric, or the assessment.
"""

import json
from collections.abc import Iterator
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.api.exceptions import (
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
)
from app.api.schemas.interview import (
    AnswerRequest,
    InterviewStateResponse,
    build_state_response,
    build_turn_out,
)
from app.core.file_upload import read_answer_audio_content
from app.core.logger import init_logger
from app.interview import engine
from app.interview.service import apply_lazy_expiry, store_answer_audio
from app.interview.transcriber import TranscriptionError, transcribe_answer
from app.models.database import create_session
from app.models.interview import Interview, InterviewMode, InterviewStatus
from app.repositories.interview_repository import InterviewRepository
from app.worker.interview_tasks import assess_interview

logger = init_logger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

# Keyed by the interview's OWN mode, not the endpoint's: the caller needs to be
# told what this interview accepts, not what the door they knocked on does. An
# audio deployment that left a typed side door open would make the mode
# snapshot decorative, so both routes reject the other mode outright.
MODE_MESSAGES = {
    InterviewMode.TEXT.value: "This interview accepts typed answers.",
    InterviewMode.AUDIO.value: "This interview accepts spoken answers.",
}


def _sse_frame(event: str, data: dict[str, object]) -> str:
    """Format one SSE frame. Kept tiny on purpose: no sse-starlette dependency."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _event_frame(event: engine.EngineEvent, content: str) -> str | None:
    """Map one EngineEvent to its SSE frame (the thin side of the seam).

    Returns None for events with no candidate-facing frame; the protocol is
    append-only, so nothing is emitted for them.

    The ack echoes the committed answer text. A spoken answer's client has no
    other way to learn it — the server minted it from audio — and echoing it for
    typed answers too means every client renders what was actually stored rather
    than its own copy. That echo is a transport concern, resolved here rather
    than by teaching AnswerAccepted about transcription.
    """
    if isinstance(event, engine.AnswerAccepted):
        return _sse_frame("ack", {"answer_seq": event.answer_seq, "content": content})
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


def _precheck_answer(token: str, after_seq: int, expected_mode: InterviewMode) -> UUID:
    """Check the mode gate and the engine's answer rules before streaming
    starts, so failures get real HTTP codes. Returns the interview id.

    Exception handlers cannot fire once the response body has begun; anything
    rejected after this point surfaces as an SSE `error` event instead. The
    engine re-validates under the row lock, so a race lost between this check
    and the lock is still caught.

    The audio route calls this before reading bytes or transcribing: a stale
    after_seq or a finished interview must cost zero STT quota.
    """
    db = create_session()
    try:
        interview = _load_by_token(db, token)
        if interview.answer_mode != expected_mode.value:
            raise ValidationError(
                MODE_MESSAGES.get(
                    interview.answer_mode,
                    "This interview does not accept answers this way.",
                )
            )
        engine.validate_answerable(db, interview, after_seq)
        return interview.id
    finally:
        db.close()


def _answer_stream(
    token: str,
    content: str,
    after_seq: int,
    answer_audio: tuple[str, str] | None = None,
) -> Iterator[str]:
    """Run one answer through the engine and yield its SSE frames.

    Shared by both answer routes so they cannot drift: the only differences
    between typed and spoken answers are how `content` was obtained and whether
    a recording gets attached afterwards. `answer_audio` is
    (storage_path, mime_type) for a spoken answer.

    Deliberately opens its own session (worker discipline) rather than taking
    one from Depends(get_db), which would stay pinned for the whole stream.
    """
    db = create_session()
    try:
        interview = InterviewRepository(db).get_by_token_for_update(token)
        if not interview:
            yield _sse_frame("error", {"detail": "Interview not found."})
            return
        interview_id = interview.id
        for event in engine.submit_answer(db, interview, content, after_seq):
            if isinstance(event, engine.InterviewClosed):
                # Routes dispatch, workers execute -- the same split as
                # batch.py. Keeps app.worker out of the engine.
                assess_interview.delay(str(event.interview_id))
                continue
            frame = _event_frame(event, content)
            if frame is not None:
                yield frame

        if answer_audio is not None:
            # The answer turn is durably committed by now: the engine persists
            # before it emits, so draining the events means the write landed.
            # attach_answer_audio never raises -- a failure costs the recruiter
            # playback for one turn and nothing else.
            InterviewRepository(db).attach_answer_audio(
                interview_id, after_seq + 1, *answer_audio
            )

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


@router.post("/{token}/answers")
def submit_answer(token: str, body: AnswerRequest) -> StreamingResponse:
    """Accept one typed answer and stream the interviewer's reaction (SSE)."""
    _precheck_answer(token, body.after_seq, InterviewMode.TEXT)

    return StreamingResponse(
        _answer_stream(token, body.content, body.after_seq),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.post("/{token}/answers-audio")
def submit_audio_answer(
    token: str,
    audio: UploadFile = File(...),
    after_seq: int = Form(...),
) -> StreamingResponse:
    """Accept one recorded answer, transcribe it, and stream the interviewer's
    reaction (SSE) — the same protocol the typed route speaks.

    Everything that can fail does so before the response body opens, so the
    candidate gets a real status code and a Retry that re-sends the same blob:
    nothing is persisted until the stream starts.

    Deliberately `def`, not `async def`, like its typed twin: transcription is a
    multi-second blocking model call and the upload is blocking I/O, so this
    belongs in FastAPI's threadpool. On the event loop it would stall every
    other request — including other candidates' in-flight SSE streams — for the
    duration of each transcription.
    """
    interview_id = _precheck_answer(token, after_seq, InterviewMode.AUDIO)

    content, mime_type = read_answer_audio_content(audio)

    try:
        transcript = transcribe_answer(content, audio.content_type or mime_type)
    except TranscriptionError as e:
        raise ServiceUnavailableError(
            "We couldn't process your recording. Your answer was not submitted "
            "— please try again."
        ) from e

    # Stored under the seq this answer is about to take. Deterministic under the
    # after_seq check: if another writer got there first, the engine 409s below
    # and this file is simply overwritten on retry.
    audio_path = store_answer_audio(interview_id, after_seq + 1, content, mime_type)

    return StreamingResponse(
        _answer_stream(
            token, transcript, after_seq, answer_audio=(audio_path, mime_type)
        ),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
