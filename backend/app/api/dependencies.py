from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

from app.config import Config

# Re-export database dependency
from app.models.database import get_db

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def verify_api_key(x_api_key: str | None = Depends(_api_key_header)) -> None:
    """Validate the X-API-Key header against the configured API_KEY."""
    if not Config.API_KEY:
        return
    if x_api_key != Config.API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
