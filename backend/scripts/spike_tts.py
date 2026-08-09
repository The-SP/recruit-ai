"""Ad hoc tool for synthesizing interviewer speech and checking what comes
back, for the Phase 3 (TTS) work in docs/ai-interviewer-phase3-tts-plan.md.

M1 findings, recorded 2026-08-09 (see that plan's §3 for the full write-up):

  - gemini-2.5-flash-preview-tts exists and supports generateContent. The
    gemini-2.5-flash-native-audio-* models do NOT -- they are bidiGenerateContent
    (Live API) only, so they cannot serve request/response synthesis.
  - build_model() carries TTS with NO changes. langchain-google-genai defaults
    response_modalities to ["AUDIO"] when the model name ends in "-tts"
    (chat_models.py:2607), so the ordinary build_model() call site just works.
    The raw google-genai client fallback was NOT needed; google-genai stays an
    undeclared transitive dep and CLAUDE.md's build_model() rule needs no
    carve-out.
  - The response carries a standard AudioContentBlock at
    response.content_blocks[0] -- {"type": "audio", "base64", "mime_type"} --
    the mirror image of the block transcriber.py sends. The bytes are already a
    complete WAV (RIFF header applied upstream): 24 kHz, mono, signed 16-bit.
    Nothing needs the stdlib `wave` module to wrap PCM.
  - VOICE SELECTION IS NOT AVAILABLE through langchain-google-genai 4.2.1.
    The package contains no reference to speech_config, voice_config, or
    prebuilt_voice_config; passing speech_config= lands in model_kwargs and is
    silently dropped. Verified falsifiably: an invalid voice name
    ("NOT_A_REAL_VOICE") returns 200 with normal audio instead of the 400 the
    API would give if the config had actually been sent. Do not re-test this by
    comparing byte lengths between two voices -- output length varies by a few
    percent between identical calls, so length differences prove nothing.

Usage (REDIS_URL is not optional outside Docker: without
INTERVIEW_GOOGLE_API_KEY set, build_model() falls through to the Redis rotation
cursor, and the default port 6379 vs docker's 6380 fails in a way that reads
like an LLM error):

    REDIS_URL=redis://localhost:6380/0 uv run -m scripts.spike_tts \
        "Thanks for making time today." --out /tmp/opening.wav

Then LISTEN to the file. The checks below confirm the bytes are structurally
valid, non-silent audio; they cannot confirm it sounds like a person asking a
question, and a spike that only reads the numbers is the exact self-deception
this tool exists to prevent.

No built-in repeat: synthesis is billed per call and TTS is the most expensive
thing in the interview pipeline (see the plan's M4). Re-invoke by hand.

Delete this file once Phase 3 ships and INTERVIEW_TTS_MODEL_NAME is stable
enough that nobody needs to re-check output quality before changing it. Until
then this is the tool for that check -- notably for the R5 question of how the
voice pronounces technical vocabulary (nginx, JSONB, p99), which is a listening
test, not a measurement.
"""

import argparse
import array
import base64
import io
import time
import wave
from pathlib import Path

from app.config import Config
from app.core.model_factory import build_model

# The model ID verified in M1. Not read from Config, because this tool's job is
# checking a candidate model -- pass --model to try another one.
DEFAULT_TTS_MODEL = "google_genai:gemini-2.5-flash-preview-tts"

# TTS models take the text to speak plus optional style direction in the same
# prompt. Kept here rather than imported, because unlike the STT verbatim
# prompt this is not a correctness-critical constant -- it is style direction,
# and the plan explicitly forbids growing it into pronunciation hints or SSML.
STYLE_DIRECTION = "Read this aloud in a warm, professional interviewer's voice: "


def synthesize(text: str, model_name: str) -> tuple[bytes, str, dict[str, int]]:
    """One utterance through build_model(). Returns (wav_bytes, mime, usage)."""
    model = build_model(model_name, Config.INTERVIEW_GOOGLE_API_KEY or None)
    response = model.invoke(STYLE_DIRECTION + text)

    blocks = [b for b in (response.content_blocks or []) if b.get("type") == "audio"]
    if not blocks:
        raise RuntimeError(
            "No audio block in the response. content_blocks="
            f"{response.content_blocks!r}"
        )

    block = blocks[0]
    return (
        base64.b64decode(block["base64"]),
        str(block.get("mime_type", "")),
        dict(response.usage_metadata or {}),
    )


def describe(wav_bytes: bytes) -> None:
    """Print structural facts and a silence check.

    The silence check matters because a TTS failure that returns a valid but
    empty WAV is indistinguishable from success by byte count alone.
    """
    reader = wave.open(io.BytesIO(wav_bytes))
    channels = reader.getnchannels()
    rate = reader.getframerate()
    width = reader.getsampwidth()
    frames = reader.getnframes()
    print(
        f"  WAV: channels={channels} rate={rate} sampwidth={width} "
        f"frames={frames} duration={frames / rate:.2f}s"
    )

    if width != 2:
        print("  (skipping amplitude check: not 16-bit)")
        return

    samples = array.array("h")
    samples.frombytes(reader.readframes(frames))
    peak = max(abs(s) for s in samples)
    rms = (sum(s * s for s in samples) / len(samples)) ** 0.5

    window = rate // 20  # 50ms
    loud = sum(
        1
        for i in range(0, len(samples) - window, window)
        if (sum(s * s for s in samples[i : i + window]) / window) ** 0.5 > 300
    )
    total = len(samples) // window
    print(f"  peak={peak}/32767  rms={rms:.0f}  non-silent 50ms windows={loud}/{total}")
    if peak < 1000:
        print("  WARNING: near-silent output. This is a failure, not a quiet voice.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Synthesize one interviewer utterance and inspect the audio."
    )
    parser.add_argument("text", help="What the interviewer should say")
    parser.add_argument("--out", required=True, help="Where to write the .wav")
    parser.add_argument(
        "--model",
        default=DEFAULT_TTS_MODEL,
        help=f"Model to synthesize with (default: {DEFAULT_TTS_MODEL})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not Config.INTERVIEW_GOOGLE_API_KEY and not Config.GOOGLE_API_KEYS:
        print("WARNING: no interview or pooled Google API key configured.\n")

    print(f"model: {args.model}")
    print(f"text:  {args.text}")

    started = time.monotonic()
    wav_bytes, mime, usage = synthesize(args.text, args.model)
    elapsed = time.monotonic() - started

    out = Path(args.out).expanduser()
    out.write_bytes(wav_bytes)

    print(f"\n  {elapsed:.1f}s  {len(wav_bytes)} bytes  mime={mime}")
    print(f"  usage: {usage}")
    describe(wav_bytes)
    print(f"\n  wrote {out}")
    print("  NOW LISTEN TO IT. The numbers above cannot tell you how it sounds.")


if __name__ == "__main__":
    main()
