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
