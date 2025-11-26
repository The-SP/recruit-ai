import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    # Model Configuration
    MODEL_NAME: str = os.getenv("MODEL_NAME", "google_genai:gemini-2.5-flash-lite")
