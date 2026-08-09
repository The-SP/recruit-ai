"""Text-to-speech for the interviewer's turns: the outbound half of the voice
loop, and the mirror image of transcriber.py.

A plain module, not a provider package, for the reason transcriber.py records:
there is exactly one implementation and no env var selecting between
alternatives, so an ABC would be a dead interface. It lives beside the engine
because deciding what gets spoken is interview business logic, and it imports
nothing from FastAPI -- text in, bytes out.

TTS rides Config.INTERVIEW_TTS_MODEL_NAME (a dedicated var, because it must be
a "-tts" model) with Config.INTERVIEW_GOOGLE_API_KEY, the same key the engine,
transcriber, and assessor use. Like every interview LLM call it is exempt from
the circuit breaker: those calls are singular and interactive, use their own
key, and a quota trip should surface to the candidate as a retryable 503 rather
than poison the batch breaker.

No voice/timbre selection exists. langchain-google-genai 4.2.1 has no support
for speech_config anywhere in the package -- passing one is silently discarded
-- so the model's default voice is what ships. Verified rather than assumed:
synthesizing with an invalid voice name returns normal audio instead of the 400
the API would give if the setting had actually been sent.

WHICH TURNS ARE PRECOMPUTABLE is the load-bearing idea here. A slot can be
synthesized ahead of time exactly when its text is verbatim from the frozen
question_script, because that is the only text that exists before the interview
starts. Opening and questions qualify (engine.py:158, :163, :264). Closings do
NOT: the engine writes two different closing texts under the same TurnKind --
script.closing on normal completion (engine.py:271) and a time-limit-prefixed
variant on overrun (engine.py:238-240) -- so a single shared "closing" slot
would speak the wrong words for a timed-out interview. Closings and follow-ups
are therefore keyed by seq and synthesized on demand.
"""

import base64
import re
from typing import Any
from uuid import UUID

from app.config import Config
from app.core.file_storage import (
    file_exists,
    get_interview_audio_folder,
    resolve_file_path,
    save_uploaded_file,
)
from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.models.interview import Interview, InterviewTurn, TurnKind, TurnRole
from app.schemas.interview import InterviewScript

logger = init_logger(__name__)

# What the provider returns: a complete WAV (24 kHz, mono, signed 16-bit), not
# raw PCM -- langchain-google-genai applies the RIFF header itself, so nothing
# here builds one. One format for every synthesized turn, which is what lets
# the storage key be derived from the turn instead of recorded per row.
VOICE_MIME_TYPE = "audio/wav"

# Style direction, prepended to whatever is being spoken. TTS models take the
# text and its delivery in one prompt. Deliberately kept to tone: this is not a
# place for pronunciation hints or SSML -- the candidate reads the correct text
# on screen regardless, and post-processing speech has the same
# invent-what-was-never-said failure mode the verbatim STT prompt guards against.
STYLE_DIRECTION = "Read this aloud in a warm, professional interviewer's voice: "

# Keys become filenames (tts-{key}.wav). The resolvers below only ever return
# keys they derived themselves, but a cache hit is served without consulting
# them, so this is the gate that actually stands between a request and a
# filename -- see is_safe_voice_key.
VOICE_KEY_PATTERN = re.compile(r"^[a-z0-9-]+$")

OPENING_KEY = "opening"


def voice_response_headers() -> dict[str, str]:
    """Cache policy for a synthesized clip, shared by both serving doors.

    Clips are immutable once written, so replaying one shouldn't refetch from
    S3. Single-homed with VOICE_MIME_TYPE so the candidate and recruiter
    endpoints cannot drift on either.
    """
    return {"Cache-Control": "private, max-age=3600"}


def is_safe_voice_key(key: str) -> bool:
    """Whether `key` may be interpolated into a storage filename.

    Load-bearing rather than belt-and-braces: callers may serve a cached clip
    without going through resolve_voice_text, and LocalStorage.get/exists take
    the path as given. Nothing builds a voice path without passing here first.
    """
    return bool(VOICE_KEY_PATTERN.match(key))


def question_key(index: int) -> str:
    """The key for the question at `index`.

    Shared by the read side (voice_key_for_turn, resolving a request) and the
    write side (script_voice_keys, warming the cache) for the same reason
    OPENING_KEY is a constant: if the two formats drift, nothing errors.
    Precompute would warm keys nobody asks for while every question falls
    through to on-demand synthesis — silently doubling spend and putting a
    multi-second wait on question one.
    """
    return f"question-{index}"


class SynthesisError(Exception):
    """Synthesis failed. Our fault, not the candidate's: retrying is the fix,
    so the route maps this to a 503. The interview is never blocked on it --
    the question is already on screen as text."""


def synthesize_speech(text: str) -> bytes:
    """One interviewer utterance as WAV bytes.

    Raises SynthesisError on any provider failure or on empty audio; never
    returns silence, because a valid-but-empty WAV is indistinguishable from
    success by byte count alone at every layer above this one.

    An ordinary build_model() call site: langchain-google-genai defaults the
    response modality to AUDIO for any model whose name ends in "-tts", so no
    extra parameters are needed and CLAUDE.md's "all LLM call sites go through
    build_model()" rule holds untouched. The response carries a standard
    AudioContentBlock -- the exact mirror of the block transcriber.py sends.
    """
    model = build_model(
        Config.INTERVIEW_TTS_MODEL_NAME, Config.INTERVIEW_GOOGLE_API_KEY or None
    )

    try:
        response = model.invoke(STYLE_DIRECTION + text)
        blocks: list[Any] = list(response.content_blocks or [])
    except Exception as e:
        logger.exception("Interviewer speech synthesis failed")
        raise SynthesisError(str(e)) from e

    audio = next(
        (b for b in blocks if isinstance(b, dict) and b.get("type") == "audio"), None
    )
    if audio is None:
        raise SynthesisError(
            f"No audio block in the response (got {[type(b) for b in blocks]})"
        )

    content = base64.b64decode(audio.get("base64", ""))
    if not content:
        raise SynthesisError("Provider returned an empty audio block")

    return content


# ---------------------------------------------------------------------------
# Keys: which turn maps to which stored clip
# ---------------------------------------------------------------------------


def voice_key_for_turn(turn: InterviewTurn) -> str | None:
    """The storage key for one turn's synthesized speech, or None if the turn
    is never spoken.

    Candidate turns return None: the interviewer does not read the candidate's
    own answers back to them.
    """
    if turn.role != TurnRole.INTERVIEWER.value:
        return None
    if turn.kind == TurnKind.OPENING.value:
        return OPENING_KEY
    if turn.kind == TurnKind.QUESTION.value and turn.question_index is not None:
        return question_key(turn.question_index)
    if turn.kind == TurnKind.FOLLOWUP.value:
        return f"followup-{turn.seq}"
    if turn.kind == TurnKind.CLOSING.value:
        # By seq, not a shared slot: see the module docstring -- the engine has
        # two different closing texts under this one kind.
        return f"closing-{turn.seq}"
    return None


def script_voice_keys(script: InterviewScript) -> list[tuple[str, str]]:
    """(key, text) for every slot that can be synthesized before the interview
    starts, i.e. everything whose text is verbatim from the frozen script.

    Excludes closings deliberately (module docstring). Follow-ups cannot appear
    here at all -- they do not exist until a candidate answers.
    """
    # Keyed by list position, not question.id, because InterviewTurn's
    # question_index is a list position (engine.py:163, :259). The generator
    # normalizes id to the same value (question_generator.py:227-228), so the
    # two agree today; indexing the list keeps them agreeing if it ever stops.
    slots = [(OPENING_KEY, script.opening)]
    slots.extend(
        (question_key(index), question.text)
        for index, question in enumerate(script.questions)
    )
    return slots


def resolve_voice_text(
    interview: Interview, turns: list[InterviewTurn], key: str
) -> str | None:
    """The text `key` should speak in THIS interview, or None if it names
    nothing real.

    This is the security boundary for the candidate-facing audio endpoint, and
    the bound on what it can be made to spend. Text comes only from the
    interview's own frozen script or its own committed turns, so a caller can
    never steer synthesis toward text they chose, and a key that maps to
    nothing costs a 404 rather than a model call. Since every real key is
    reachable at most once before it is cached, total synthesis for an
    interview is bounded by its number of turns.
    """
    if not is_safe_voice_key(key):
        return None

    # Scripted slots resolve from the script so they work before the interview
    # starts -- that is what makes precompute possible.
    #
    # An unreadable script degrades to "no scripted slots" rather than raising,
    # matching _questions_from_script in api/schemas/interview.py: an older or
    # malformed script shape should cost a candidate their question audio, not
    # turn the request into a 500. Committed turns below still resolve.
    try:
        script = InterviewScript.model_validate(interview.question_script)
    except Exception:
        logger.warning(
            f"Interview {interview.id} has an unreadable question_script; "
            "no scripted voice slots available"
        )
    else:
        scripted = dict(script_voice_keys(script)).get(key)
        if scripted is not None:
            return scripted

    # Everything else is dynamic and must match a turn that actually exists.
    for turn in turns:
        if voice_key_for_turn(turn) == key:
            return turn.content

    return None


def voice_filename(key: str) -> str:
    """The stored filename for one key.

    The single place this name is built. Unlike answer recordings -- whose
    path is recorded on the turn row and read back from it -- synthesized
    clips are addressed by derivation, so the write side and the read side
    have nothing but this function keeping them in agreement.
    """
    return f"tts-{key}.wav"


def voice_storage_path(interview_id: UUID, key: str) -> str:
    """Where one synthesized clip lives.

    Shares the interview's audio folder with candidate recordings
    (turn-{seq}.{ext}); the "tts-" prefix keeps the two from colliding, and
    delete_interview_audio already sweeps the whole folder.

    Relative, matching what S3Storage returns from save() and what both
    backends accept in get()/exists(). LocalStorage.save() reports an absolute
    path instead, which is why nothing here round-trips through its return
    value -- the derivation below is the only address a synthesized clip has.
    """
    return resolve_file_path(
        get_interview_audio_folder(interview_id), voice_filename(key)
    )


def synthesize_and_store(interview_id: UUID, key: str, text: str) -> bytes:
    """Synthesize one clip, cache it, and return the bytes.

    The one place synthesis and storage are paired, shared by the on-demand
    endpoint and the precompute task so the two cannot cache to different
    places or under different conditions. It lives here rather than in
    service.py because service.py imports the worker (to dispatch), so the
    worker cannot import back from it.
    """
    content = synthesize_speech(text)
    save_uploaded_file(
        get_interview_audio_folder(interview_id), voice_filename(key), content
    )
    return content


def voice_is_cached(interview_id: UUID, key: str) -> bool:
    """Whether this clip has already been synthesized and stored."""
    return file_exists(voice_storage_path(interview_id, key))
