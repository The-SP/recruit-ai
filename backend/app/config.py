import logging
import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    # Model Configuration
    MODEL_NAME: str = os.getenv("MODEL_NAME", "google_genai:gemini-2.5-flash-lite")
    LOG_LEVEL: int = getattr(
        logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO
    )
    LOG_TO_FILE: bool = os.getenv("LOG_TO_FILE", "false").lower() == "true"

    # Database Configuration
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/recruit-ai"
    )

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Email Provider: "gmail" or "resend"
    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "gmail")

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
