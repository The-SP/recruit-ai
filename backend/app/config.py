import logging
import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    # Authentication
    API_KEY: str = os.getenv("API_KEY", "")

    # Model Configuration
    MODEL_NAME: str = os.getenv("MODEL_NAME", "google_genai:gemini-2.5-flash-lite")

    # Comma-separated list of Google API keys to rotate across (round-robin).
    # Takes precedence over GOOGLE_API_KEY; falls back to it when unset.
    GOOGLE_API_KEYS: list[str] = [
        k.strip()
        for k in os.getenv("GOOGLE_API_KEYS", os.getenv("GOOGLE_API_KEY", "")).split(
            ","
        )
        if k.strip()
    ]
    # AI Interviewer
    INTERVIEW_MODEL_NAME: str = os.getenv(
        "INTERVIEW_MODEL_NAME", "google_genai:gemini-3.5-flash-lite"
    )
    # Dedicated key so interviews don't share the scorers' quota or circuit
    # breaker. Falls back to the rotated GOOGLE_API_KEYS pool when unset.
    INTERVIEW_GOOGLE_API_KEY: str = os.getenv("INTERVIEW_GOOGLE_API_KEY", "")
    # Core questions per interview. Defaults to the fast development value;
    INTERVIEW_QUESTION_COUNT: int = int(os.getenv("INTERVIEW_QUESTION_COUNT", "1"))
    # Accepted spread around the count when validating LLM output.
    INTERVIEW_QUESTION_COUNT_TOLERANCE: int = int(
        os.getenv("INTERVIEW_QUESTION_COUNT_TOLERANCE", "0")
    )
    # Answer mode for this deployment: "text" (typed) or "audio" (spoken,
    # transcribed via the interview model).
    INTERVIEW_MODE: str = os.getenv("INTERVIEW_MODE", "text")
    # Whether the interviewer's turns are read aloud: "on" or "off". Separate
    # from INTERVIEW_MODE on purpose -- synthesis is by far the most expensive
    # call in the pipeline, so spoken questions and spoken answers have to be
    # affordable independently. Snapshotted onto each interview at creation.
    INTERVIEW_VOICE: str = os.getenv("INTERVIEW_VOICE", "off")
    # Must be a TTS model: langchain-google-genai only defaults the response
    # modality to AUDIO when the model name ends in "-tts". There is no voice
    # setting -- that package cannot carry speech_config (see the phase 3 plan).
    INTERVIEW_TTS_MODEL_NAME: str = os.getenv(
        "INTERVIEW_TTS_MODEL_NAME", "google_genai:gemini-2.5-flash-preview-tts"
    )

    # LLM rate limiting. Other limits are constants in core/rate_limit.py.
    # "on" enforces, "log" counts without rejecting, "off" skips Redis.
    RATE_LIMIT_ENABLED: str = os.getenv("RATE_LIMIT_ENABLED", "on")
    # Ceiling across all callers per UTC day. ~16 anonymous trial runs
    # (6 units each). Raise before a demo.
    RATE_LIMIT_DAILY_GLOBAL_UNITS: int = int(
        os.getenv("RATE_LIMIT_DAILY_GLOBAL_UNITS", "100")
    )

    LOG_LEVEL: int = getattr(
        logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO
    )
    LOG_TO_FILE: bool = os.getenv("LOG_TO_FILE", "false").lower() == "true"

    # Database Configuration
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/recruit-ai"
    )

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Email Provider: "gmail", "resend", or "console"
    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "console")

    # Gmail SMTP Configuration
    MAIL_FROM: str = os.getenv("MAIL_FROM", "")
    MAIL_PASSWORD: str = os.getenv("MAIL_PASSWORD", "")
    MAIL_FROM_NAME: str = os.getenv("MAIL_FROM_NAME", "Recruit AI")
    MAIL_PORT: int = int(os.getenv("MAIL_PORT", "587"))
    MAIL_SERVER: str = os.getenv("MAIL_SERVER", "smtp.gmail.com")

    # Resend Configuration (for production with custom domain)
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    RESEND_FROM_EMAIL: str = os.getenv(
        "RESEND_FROM_EMAIL", "Recruit AI <onboarding@resend.dev>"
    )

    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:8000")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Storage Configuration
    USE_S3: bool = os.getenv("USE_S3", "false").lower() == "true"
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "recruit-ai")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
