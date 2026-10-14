"""Verbatim speech-to-text for one recorded answer.

A plain module, not a provider package: there is exactly one implementation and
no env var selecting between alternatives, so an ABC mirroring EmailProvider
would be a dead interface. It lives beside the engine because transcription is
interview business logic, and it imports nothing from FastAPI — bytes in, text
out, the same discipline the engine keeps.

STT has its own model setting (Config.INTERVIEW_TRANSCRIBE_MODEL_NAME, a Gemini
model): the rest of the interview may run on a text-only model such as Muse
Spark, which cannot take audio. Like every interview LLM call it is exempt from
the circuit breaker: those calls are singular and interactive, and a quota trip
should surface to the candidate as a retryable 503 rather than poison the batch
breaker.
"""

import base64
import logging
from typing import Any

from app.api.exceptions import ValidationError
from app.config import Config
from app.core.model_factory import build_model

logger = logging.getLogger(__name__)

# The transcript is both the audit trail and the assessment input, so
# transcription fidelity is a correctness concern: without this prompt the
# model paraphrases into fluent falsehoods. Do not reword it, and do not add
# vocabulary biasing here — biasing's own failure mode (inserting a hinted term
# nobody said) is untested. scripts/spike_stt.py is where that experiment lives.
VERBATIM_PROMPT = (
    "Transcribe this audio verbatim. Output only the exact words spoken, "
    "including filler words and false starts. Do not summarize, paraphrase, "
    "correct, or restructure. Preserve all technical terms and acronyms "
    "exactly as spoken."
)


class TranscriptionError(Exception):
    """The transcription call failed. Our fault, not the candidate's: retrying
    the same recording is the fix, so the route maps this to a 503."""


class EmptyTranscriptionError(ValidationError):
    """The recording produced no words. Re-recording is the fix, so this is a
    400 — a ValidationError subclass, picked up by the existing handler."""

    def __init__(self) -> None:
        super().__init__(
            "We couldn't hear anything in that recording — "
            "please re-record and try again."
        )


def transcribe_answer(audio: bytes, mime_type: str) -> str:
    """Verbatim transcription of one recorded answer.

    Raises TranscriptionError on any provider failure and
    EmptyTranscriptionError on silence; never returns a guess.

    The audio travels as langchain-core's standard AudioContentBlock, which
    langchain-google-genai decodes and forwards as inline data. That makes this
    an ordinary build_model() call site — no create_agent, no ToolStrategy,
    since transcription is plain text out, not structured output. `mime_type`
    is the browser's own string and is forwarded unchanged; both
    "audio/webm;codecs=opus" and bare "audio/webm" are accepted upstream, so
    stripping the suffix would buy nothing.
    """
    model = build_model(Config.INTERVIEW_TRANSCRIBE_MODEL_NAME)
    content: list[Any] = [
        {"type": "text", "text": VERBATIM_PROMPT},
        {
            "type": "audio",
            "base64": base64.b64encode(audio).decode(),
            "mime_type": mime_type,
        },
    ]

    try:
        transcript = str(model.invoke([{"role": "user", "content": content}]).text)
    except Exception as e:
        logger.exception("Answer transcription failed")
        raise TranscriptionError(str(e)) from e

    # The verbatim prompt's output IS the transcript: strip surrounding
    # whitespace and nothing else. No punctuation cleanup, no capitalization
    # fixes, no spell-correcting technical terms — post-processing a transcript
    # invents claims the candidate never made.
    transcript = transcript.strip()
    if not transcript:
        raise EmptyTranscriptionError()

    return transcript
