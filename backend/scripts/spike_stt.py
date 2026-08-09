"""Ad hoc tool for checking whether the interview STT pipeline (Gemini, via
build_model()) transcribes technical vocabulary and disfluencies correctly
for a given audio clip.

Grew out of the M1 investigation for docs/ai-interviewer-phase2-stt-plan.md
-- see that plan's §12 for the full recorded findings: transport works
cleanly, the verbatim prompt holds structurally (retractions, fillers,
self-corrections mostly survive), but specific technical terms -- notably
nginx and JSONB -- get mis-heard even on clean TTS audio, and some terms
(Celery, GIN) degrade further on a non-native-English accent. The owner
decision was to proceed with INTERVIEW_MODE as an opt-in env var rather than
fix the model.

Kept as a standing tool rather than deleted after M1, because re-checking
fidelity is exactly what's needed whenever INTERVIEW_MODEL_NAME, the
verbatim prompt, or a biasing approach changes.

Delete this file (and its one caller, the import in
app/api/routes/interview.py, if that route still exists) once
INTERVIEW_MODEL_NAME's STT fidelity is trusted enough that nobody needs to
re-verify it before changing INTERVIEW_MODE's default. Until then, this is
the tool for that check.

Clips must be real recordings, not ffmpeg-converted files -- converter
output does not reproduce what a browser's MediaRecorder actually emits, so
a pass on it proves nothing about real candidate audio. Record clips with
docs/spike-recorder.html (see that file for how to serve it).

Usage (REDIS_URL is not optional outside Docker: without
INTERVIEW_GOOGLE_API_KEY set, build_model() falls through to the Redis
rotation cursor, and the default port 6379 vs docker's 6380 fails in a way
that reads like an LLM error):

    REDIS_URL=redis://localhost:6380/0 uv run -m scripts.spike_stt \
        ~/Downloads/clip.webm --mime 'audio/webm;codecs=opus'
    REDIS_URL=redis://localhost:6380/0 uv run -m scripts.spike_stt \
        ~/Downloads/clip.mp4 --vocab-hint

No built-in repeat: the model is nondeterministic on identical bytes (a
single clip has scored anywhere from 1/5 to 4/5 on technical terms across
separate calls), so treat any single run as one datapoint. Re-invoke by hand
if you want more confidence; this tool intentionally doesn't loop for you,
to keep API usage under your control.
"""

import argparse
import base64
import re
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from app.config import Config
from app.core.model_factory import build_model

# Imported, not copied: this tool's whole job is checking whether the settled
# prompt still holds, which it cannot do against its own stale duplicate.
from app.interview.transcriber import VERBATIM_PROMPT

# Gated behind --vocab-hint. Not part of the settled §0 prompt -- an ongoing
# experiment testing contextual biasing (plan §11 option B) as a mitigation
# for vocabulary suppression (nginx, JSONB). The "only if actually spoken"
# clause exists because biasing's known failure mode is the opposite of
# suppression: inventing a listed term nobody said. This tool measures
# recall only. It cannot measure precision/hallucination on a clip that
# genuinely contains every hinted term -- that risk stays untested here;
# check it with a clip that deliberately omits one of the listed terms.
VOCAB_HINT = (
    "\n\nThe speaker works in backend infrastructure and may use these exact "
    "terms: Celery, Redis, MySQL, Postgres, RDS, JSONB, GIN, nginx, TLS, p99. "
    "Transcribe a term from this list only if it is actually spoken -- do not "
    "insert one that is not present in the audio."
)

# Mutated by --vocab-hint.
_ACTIVE_PROMPT = VERBATIM_PROMPT

EXTENSION_MIME = {
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
}


# =============================================================================
# Fidelity markers — the passage in docs/spike-recorder.html is built around
# these
# =============================================================================


class Kind(Enum):
    """Which failure a marker detects. Keeping these apart is the whole point.

    Paraphrase (the model summarizing/correcting/restructuring what was said)
    and mis-hearing (the model hearing the wrong word) are different failures
    with different causes and different fixes. A marker set that reports one
    combined number cannot tell them apart.
    """

    # Was a technical token heard correctly? Failure = mis-transcription.
    TECHNICAL = "technical"
    # Did the disfluency/retraction/self-correction survive? Failure =
    # paraphrase, i.e. the model cleaned the speech up.
    STRUCTURAL = "structural"


@dataclass(frozen=True)
class Marker:
    label: str
    kind: Kind
    # Alternatives that count as a pass. Case-insensitive, whole-word by
    # default: "JSONB"/"jsonb" both hit, "Jason B" does not, and — the reason
    # whole-word is the default — "um" does not hit inside "col-um-ns".
    needles: tuple[str, ...]
    why: str
    # True when every needle must appear, not just one.
    require_all: bool = False
    # Match ignoring punctuation and word boundaries instead. Only for needles
    # that deliberately span punctuation, i.e. the stuttered false start.
    loose: bool = False
    # Reported but NOT verdict-bearing. For the one marker whose failure cannot
    # distinguish "the model smoothed it" from "the speaker never said it" --
    # see the false-start marker below.
    advisory: bool = False


MARKERS = (
    Marker(
        "Celery",
        Kind.TECHNICAL,
        ("celery",),
        "technical term; known to be heard as 'salary'",
    ),
    Marker("RDS", Kind.TECHNICAL, ("rds",), "acronym; known to be heard as 'AWS'"),
    Marker("nginx", Kind.TECHNICAL, ("nginx",), "lowercase-branded term"),
    Marker("JSONB", Kind.TECHNICAL, ("jsonb",), "acronym-ish; watch for 'Jason B'"),
    Marker("GIN", Kind.TECHNICAL, ("gin",), "3-letter index type; watch for 'Zen'"),
    Marker(
        "MySQL",
        Kind.STRUCTURAL,
        ("mysql",),
        "RETRACTED word -- absent => paraphrase (strongest single tell)",
    ),
    Marker(
        "filler", Kind.STRUCTURAL, ("um", "uh", "like"), "spoken disfluency survived"
    ),
    Marker(
        # ADVISORY, and this is the one judgement call in the marker set. Every
        # other structural marker is self-corroborating: a retraction ("MySQL,
        # sorry, Postgres") and a numeric self-correction only make sense if
        # spoken, so their absence really is the model removing something. A
        # repeated "I" is different -- a reader glancing at the page routinely
        # skips a written stutter, so its absence cannot tell you whether the
        # model smoothed it or the speaker never said it. Letting one
        # unfalsifiable marker fire the paraphrase finding would condemn the
        # model on the reader's delivery. Confirm against your own recording;
        # if you DID stutter and it is missing, treat that as a genuine
        # paraphrase datapoint and override the finding below.
        "false start",
        Kind.STRUCTURAL,
        ("iuhi",),
        "the 'I, uh, I mainly owned' stutter survived",
        loose=True,
        advisory=True,
    ),
    Marker(
        # Numerals and words both count. The model choosing "400" over "four
        # hundred" is an orthography choice, not a smoothed self-correction.
        "400+600",
        Kind.STRUCTURAL,
        ("four hundred|400", "six hundred|600"),
        "both numbers => the latency self-correction was not smoothed",
        require_all=True,
    ),
)


def _find_word(transcript: str, needle: str) -> str | None:
    """Whole-word, case-insensitive match; returns the raw surface form.

    Printing the surface form matters: "Nginx" vs "nginx" is capitalization
    (cosmetic), whereas "salary" or "AWS" is a mishearing. This function must
    not make that call for the reader.
    """
    # A needle may hold "|"-separated equivalents ("four hundred|400") when the
    # same spoken thing has more than one legitimate written form.
    alternatives = "|".join(re.escape(a) for a in needle.split("|"))
    match = re.search(rf"\b(?:{alternatives})\b", transcript, re.IGNORECASE)
    return match.group(0) if match else None


def _find_loose(transcript: str, needle: str) -> str | None:
    """Match `needle` against the transcript stripped of everything but
    lowercase alphanumerics, then map the hit back to its raw surface form.

    For "iuhi" ("I, uh, I ..."), whose whole point is that punctuation and
    spacing fall wherever the model put them.
    """
    lowered = transcript.lower()
    positions = [i for i, ch in enumerate(lowered) if ch.isalnum()]
    normalized = "".join(lowered[i] for i in positions)
    at = normalized.find(needle)
    if at == -1:
        return None
    return transcript[positions[at] : positions[at + len(needle) - 1] + 1]


def _surface_form(transcript: str, needle: str, loose: bool) -> str | None:
    return _find_loose(transcript, needle) if loose else _find_word(transcript, needle)


# =============================================================================
# Transcription. Just the one path -- U1 settled on the langchain-core
# standard audio block, verified against real audio, no need to keep the
# discovery scaffolding (three other content-block shapes) around now that
# it's decided. See plan §3 for the full record of what was tried and why it
# lost, if that's ever needed again.
# =============================================================================


def transcribe(audio: bytes, mime_type: str) -> str:
    """Send one clip through build_model() and return the raw transcript.

    langchain-core's standard AudioContentBlock
    (langchain_core/messages/content.py:600) is recognized by
    langchain_google_genai (chat_models.py:231) and routed to
    Blob(inline_data=...) correctly. This is an ordinary build_model() call
    site -- no create_agent, no ToolStrategy -- so CLAUDE.md's "all LLM call
    sites go through build_model()" rule holds untouched.
    """
    model = build_model(
        Config.INTERVIEW_MODEL_NAME, Config.INTERVIEW_GOOGLE_API_KEY or None
    )
    content: list[Any] = [
        {"type": "text", "text": _ACTIVE_PROMPT},
        {
            "type": "audio",
            "base64": base64.b64encode(audio).decode(),
            "mime_type": mime_type,
        },
    ]
    return str(model.invoke([{"role": "user", "content": content}]).text)


class Outcome(Enum):
    ERROR = "ERROR"  # exception, either client-side or an API rejection
    EMPTY = "EMPTY"  # accepted, but nothing came back -- not a pass
    OK = "OK"  # accepted, non-empty transcript


@dataclass
class Attempt:
    clip: str
    mime_type: str
    outcome: Outcome
    transcript: str = ""
    error: str = ""
    seconds: float = 0.0


def run_attempt(clip: Path, audio: bytes, mime_type: str) -> Attempt:
    started = time.monotonic()
    try:
        transcript = transcribe(audio, mime_type).strip()
    except Exception as e:
        return Attempt(
            clip=clip.name,
            mime_type=mime_type,
            outcome=Outcome.ERROR,
            error=f"{type(e).__name__}: {e}",
            seconds=time.monotonic() - started,
        )
    outcome = Outcome.OK if transcript else Outcome.EMPTY
    return Attempt(
        clip=clip.name,
        mime_type=mime_type,
        outcome=outcome,
        transcript=transcript,
        seconds=time.monotonic() - started,
    )


# =============================================================================
# Fidelity
# =============================================================================


@dataclass
class Fidelity:
    """Marker results split by Kind, because one score conflates two
    different failures."""

    technical_passed: int = 0
    technical_total: int = 0
    structural_passed: int = 0
    structural_total: int = 0
    missed_terms: tuple[str, ...] = ()

    @property
    def paraphrased(self) -> bool:
        """The model cleaned up the speech: a retraction, a disfluency, or a
        self-correction is gone."""
        return self.structural_passed < self.structural_total

    @property
    def misheard(self) -> bool:
        """Technical vocabulary came back wrong while the structure survived.
        NOT paraphrase -- a different failure with a different cause."""
        return self.technical_passed < self.technical_total


def print_fidelity(transcript: str) -> Fidelity:
    """Print the marker table, split by Kind. Returns the split result."""
    print("  fidelity:")
    result = Fidelity()
    missed: list[str] = []
    for marker in MARKERS:
        found = {n: _surface_form(transcript, n, marker.loose) for n in marker.needles}
        hits = {n: v for n, v in found.items() if v is not None}
        ok = len(hits) == len(marker.needles) if marker.require_all else bool(hits)
        if marker.advisory:
            pass
        elif marker.kind is Kind.TECHNICAL:
            result.technical_total += 1
            result.technical_passed += int(ok)
        else:
            result.structural_total += 1
            result.structural_passed += int(ok)
        tag = "advi" if marker.advisory else marker.kind.value[:4]
        if ok:
            detail = ", ".join(f'"{v}"' for v in hits.values())
            print(f"    OK   [{tag}] {marker.label:<12} found as {detail}")
        else:
            if marker.kind is Kind.TECHNICAL and not marker.advisory:
                missed.append(marker.label)
            missing = [n for n in marker.needles if n not in hits]
            print(
                f"    FAIL [{tag}] {marker.label:<12} NOT FOUND (looked for: "
                f"{', '.join(missing)}) -- {marker.why}"
            )
            if marker.advisory:
                print(
                    "         ^ advisory only: does not drive the finding below. "
                    "Listen to your recording --\n           if you DID say it, "
                    "treat this as a real paraphrase datapoint."
                )
    result.missed_terms = tuple(missed)
    print(
        f"    -> technical {result.technical_passed}/{result.technical_total}, "
        f"structural {result.structural_passed}/{result.structural_total}"
    )
    return result


def print_attempt(attempt: Attempt) -> None:
    print(f"\n--- {attempt.clip} | mime='{attempt.mime_type}' ---")
    if attempt.outcome is Outcome.ERROR:
        print(f"  ERROR ({attempt.seconds:.1f}s)")
        print(f"    {attempt.error}")
        return
    if attempt.outcome is Outcome.EMPTY:
        print(f"  EMPTY ({attempt.seconds:.1f}s) -- accepted but returned nothing.")
        print("    Suspect an undecodable container.")
        return
    print(f"  OK ({attempt.seconds:.1f}s, {len(attempt.transcript)} chars)")
    print("  transcript:")
    print('  """')
    for line in attempt.transcript.splitlines() or [""]:
        print(f"  {line}")
    print('  """')


PARAPHRASE_FINDING = """
FINDING -- PARAPHRASE. A retraction, a disfluency, or a self-correction is
missing: the model cleaned up the speech despite the verbatim prompt. See
docs/ai-interviewer-phase2-stt-plan.md §12 for the recorded baseline (this
happened in roughly 1 of 6 calls there too) before treating this as new.
"""

MISHEARD_FINDING = """
FINDING -- MIS-TRANSCRIPTION (different from paraphrase; structure survived,
specific words did not: {terms}). Compare against the per-term tables in
docs/ai-interviewer-phase2-stt-plan.md §12 -- if this matches the recorded
baseline (nginx/JSONB failing, or Celery/GIN failing on an accented voice),
that's expected, not a new problem. If it's a term the baseline had passing
reliably, or a new model/prompt/biasing change was in play, that's worth
recording in §12.
"""


# =============================================================================
# CLI
# =============================================================================


def guess_mime(clip: Path) -> str:
    mime = EXTENSION_MIME.get(clip.suffix.lower())
    if mime is None:
        raise ValueError(
            f"Cannot guess a MIME type for {clip.name}; pass --mime explicitly."
        )
    return mime


def mime_forms(mime_type: str, both: bool) -> list[str]:
    """The full recorder string, and optionally the bare base type.

    Both are accepted by the server's prefix-match allowlist; this checks
    whether the transcriber itself needs the ';codecs=' suffix stripped
    before forwarding to the provider.
    """
    bare = mime_type.split(";", 1)[0].strip()
    if both and bare != mime_type:
        return [mime_type, bare]
    return [mime_type]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check interview STT fidelity for one or more audio clips."
    )
    parser.add_argument("clips", nargs="+", help="Paths to audio clips")
    parser.add_argument(
        "--mime",
        help="MIME type to send, e.g. 'audio/webm;codecs=opus'. Use the exact "
        "recorder.mimeType docs/spike-recorder.html logged. Defaults to the "
        "file extension.",
    )
    parser.add_argument(
        "--both-mime-forms",
        action="store_true",
        help="Also retry with the ';codecs=...' suffix stripped.",
    )
    parser.add_argument(
        "--model",
        help="Override INTERVIEW_MODEL_NAME, e.g. to try a different model.",
    )
    parser.add_argument(
        "--vocab-hint",
        action="store_true",
        help="Append VOCAB_HINT to the prompt (contextual biasing, plan §11 "
        "option B) and see whether it helps. Does not test hallucination risk "
        "-- see VOCAB_HINT's docstring.",
    )
    return parser.parse_args()


def main() -> None:
    global _ACTIVE_PROMPT
    args = parse_args()

    if args.model:
        Config.INTERVIEW_MODEL_NAME = args.model
        print(f"NOTE: overriding model to {args.model}.\n")
    if not Config.INTERVIEW_GOOGLE_API_KEY and not Config.GOOGLE_API_KEYS:
        print("WARNING: no interview or pooled Google API key configured.\n")
    if args.vocab_hint:
        _ACTIVE_PROMPT = VERBATIM_PROMPT + VOCAB_HINT
        print(
            "NOTE: --vocab-hint is an experiment, not the settled §0 prompt. It "
            "measures recall only -- see VOCAB_HINT's docstring for the "
            "hallucination-risk caveat.\n"
        )

    print(f"model:  {Config.INTERVIEW_MODEL_NAME}")
    print(f"prompt: {_ACTIVE_PROMPT}")

    fidelity: dict[str, Fidelity] = {}

    for raw_clip in args.clips:
        clip = Path(raw_clip).expanduser()
        audio = clip.read_bytes()
        base_mime = args.mime or guess_mime(clip)
        print(f"\n{'=' * 70}\n{clip.name}  ({len(audio)} bytes)\n{'=' * 70}")

        for mime_type in mime_forms(base_mime, args.both_mime_forms):
            attempt = run_attempt(clip, audio, mime_type)
            print_attempt(attempt)
            if attempt.outcome is Outcome.OK:
                key = f"{clip.name} | {mime_type}"
                fidelity[key] = print_fidelity(attempt.transcript)

    print(f"\n{'=' * 70}\nSUMMARY\n{'=' * 70}")
    if not fidelity:
        print("No clip produced a transcript. See the ERROR/EMPTY output above.")
        return

    print(f"fidelity across {len(fidelity)} transcript(s):")
    for key, result in fidelity.items():
        print(
            f"  technical {result.technical_passed}/{result.technical_total}  "
            f"structural {result.structural_passed}/{result.structural_total}  {key}"
        )

    if any(r.paraphrased for r in fidelity.values()):
        print(PARAPHRASE_FINDING)
    if any(r.misheard for r in fidelity.values()):
        missed = sorted({t for r in fidelity.values() for t in r.missed_terms})
        print(MISHEARD_FINDING.format(terms=", ".join(missed)))


if __name__ == "__main__":
    main()
