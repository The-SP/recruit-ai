import logging
import sys
from pathlib import Path

from app.config import Config

LOG_FILE = "logs/app.log"


def init_logger(name: str) -> logging.Logger:
    console_formatter = logging.Formatter(
        "[%(asctime)s] [%(name)s] [%(levelname)s] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setFormatter(console_formatter)

    logger = logging.getLogger(name)
    logger.addHandler(console_handler)

    if Config.LOG_TO_FILE:
        Path(LOG_FILE).parent.mkdir(exist_ok=True)
        file_handler = logging.FileHandler(LOG_FILE)
        file_handler.setFormatter(console_formatter)
        logger.addHandler(file_handler)

    logger.setLevel(Config.LOG_LEVEL)

    return logger
