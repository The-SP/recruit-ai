import logging
import os

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    """Read an env var that has no safe default, failing at import if unset."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} must be set (see backend/.env.example)")
    return value


class Config:
    # Required
    # Signs JWTs and the OAuth session. No default: a fallback would be a
    # publicly known key, silently used by any deploy that forgot to seed it.
    SECRET_KEY: str = _require("SECRET_KEY")
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/recruit-ai"
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6380/0")

    # App
    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    LOG_LEVEL: int = getattr(
        logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO
    )
    LOG_TO_FILE: bool = os.getenv("LOG_TO_FILE", "false").lower() == "true"

    # Auth (Google OAuth + JWT)
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # LLM providers
    # Comma-separated list of Google API keys to rotate across (round-robin).
    # Takes precedence over GOOGLE_API_KEY; falls back to it when unset.
    GOOGLE_API_KEYS: list[str] = [
        k.strip()
        for k in os.getenv("GOOGLE_API_KEYS", os.getenv("GOOGLE_API_KEY", "")).split(
            ","
        )
        if k.strip()
    ]
    # Meta Model API (Muse Spark), used by any *_MODEL_NAME set to "meta:<model>".
    META_API_KEY: str = os.getenv("META_API_KEY", "")
    META_BASE_URL: str = os.getenv("META_BASE_URL", "https://api.meta.ai/v1")

    # LLM models
    MODEL_NAME: str = os.getenv("MODEL_NAME", "google_genai:gemini-2.5-flash-lite")
    INTERVIEW_MODEL_NAME: str = os.getenv(
        "INTERVIEW_MODEL_NAME", "google_genai:gemini-3.5-flash-lite"
    )
    # Spoken-answer transcription needs a model that takes audio input, so it
    # is separate from INTERVIEW_MODEL_NAME (Muse Spark has no audio input).
    INTERVIEW_TRANSCRIBE_MODEL_NAME: str = os.getenv(
        "INTERVIEW_TRANSCRIBE_MODEL_NAME", "google_genai:gemini-3.5-flash-lite"
    )
    # Must be a TTS model: langchain-google-genai only defaults the response
    # modality to AUDIO when the model name ends in "-tts". There is no voice
    # setting, because that package cannot carry speech_config.
    INTERVIEW_TTS_MODEL_NAME: str = os.getenv(
        "INTERVIEW_TTS_MODEL_NAME", "google_genai:gemini-2.5-flash-preview-tts"
    )

    # AI interviewer
    # Answer mode for this deployment: "text" (typed) or "audio" (spoken,
    # transcribed via INTERVIEW_TRANSCRIBE_MODEL_NAME).
    INTERVIEW_MODE: str = os.getenv("INTERVIEW_MODE", "text")
    # Whether the interviewer's turns are read aloud: "on" or "off". Separate
    # from INTERVIEW_MODE on purpose: synthesis is by far the most expensive
    # call in the pipeline, so spoken questions and spoken answers have to be
    # affordable independently. Snapshotted onto each interview at creation.
    INTERVIEW_VOICE: str = os.getenv("INTERVIEW_VOICE", "off")
    # Core questions per interview. Defaults to a fast 1-question development
    # value; production sets 5 via env.
    INTERVIEW_QUESTION_COUNT: int = int(os.getenv("INTERVIEW_QUESTION_COUNT", "1"))
    # Accepted spread around the count when validating LLM output.
    INTERVIEW_QUESTION_COUNT_TOLERANCE: int = int(
        os.getenv("INTERVIEW_QUESTION_COUNT_TOLERANCE", "0")
    )

    # LLM rate limiting. Other limits are constants in core/rate_limit.py.
    # "on" enforces, "log" counts without rejecting, "off" skips Redis.
    RATE_LIMIT_ENABLED: str = os.getenv("RATE_LIMIT_ENABLED", "on")
    # Ceiling across all callers per UTC day. ~16 anonymous trial runs
    # (6 units each). Raise before a demo.
    RATE_LIMIT_DAILY_GLOBAL_UNITS: int = int(
        os.getenv("RATE_LIMIT_DAILY_GLOBAL_UNITS", "100")
    )

    # Email provider: "console", "gmail", or "resend"
    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "console")
    # Gmail SMTP
    MAIL_FROM: str = os.getenv("MAIL_FROM", "")
    MAIL_PASSWORD: str = os.getenv("MAIL_PASSWORD", "")
    MAIL_FROM_NAME: str = os.getenv("MAIL_FROM_NAME", "Recruit AI")
    MAIL_PORT: int = int(os.getenv("MAIL_PORT", "587"))
    MAIL_SERVER: str = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    # Resend (for production with a custom domain)
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = os.getenv(
        "RESEND_FROM_EMAIL", "Recruit AI <onboarding@resend.dev>"
    )

    # Storage: local disk unless USE_S3 is true
    USE_S3: bool = os.getenv("USE_S3", "false").lower() == "true"
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "recruit-ai")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
