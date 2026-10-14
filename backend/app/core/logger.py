import logging
import logging.config
from pathlib import Path
from typing import Any

from app.config import Config

LOG_FILE = "logs/app.log"
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Third-party loggers that are chatty at INFO (one line per HTTP request etc.).
NOISY_LOGGERS = ("httpx", "httpcore", "urllib3", "langsmith", "google_genai")

_configured = False


def configure_logging() -> None:
    """Install the root handlers. Safe to call more than once."""
    global _configured
    if _configured:
        return

    handlers: dict[str, dict[str, Any]] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stderr",
        },
    }
    if Config.LOG_TO_FILE:
        Path(LOG_FILE).parent.mkdir(exist_ok=True)
        handlers["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "default",
            "filename": LOG_FILE,
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "encoding": "utf-8",
        }

    logging.config.dictConfig(
        {
            "version": 1,
            # Keep loggers created before this runs (uvicorn's, module-level ones).
            "disable_existing_loggers": False,
            "formatters": {"default": {"format": LOG_FORMAT, "datefmt": DATE_FORMAT}},
            "handlers": handlers,
            "root": {"level": Config.LOG_LEVEL, "handlers": list(handlers)},
            "loggers": {name: {"level": "WARNING"} for name in NOISY_LOGGERS},
        }
    )
    _configured = True


def mask_email(address: str) -> str:
    """Reduce an email address to something safe to log: `s***@gmail.com`."""
    local, sep, domain = address.partition("@")
    if not sep:
        return "***"
    return f"{local[:1]}***@{domain}"
