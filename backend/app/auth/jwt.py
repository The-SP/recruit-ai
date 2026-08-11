from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from joserfc import jwt
from joserfc.jwk import OctKey
from sqlalchemy.orm import Session

from app.config import Config
from app.models.database import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository

http_bearer = HTTPBearer()

_key = OctKey.import_key(Config.SECRET_KEY.encode())


def create_access_token(
    data: dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=Config.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = int(expire.timestamp())
    return jwt.encode({"alg": Config.ALGORITHM}, to_encode, _key)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(http_bearer),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        decoded = jwt.decode(credentials.credentials, _key)
        google_id: str | None = decoded.claims.get("sub")
        if google_id is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    user = UserRepository(db).get_by_google_id(google_id)
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Gate the read-only /admin router on the hand-set users.is_admin flag.

    Layered on get_current_active_user rather than get_current_user, so a
    deactivated admin is rejected by the existing 400 before the flag is read.

    This is the authorization boundary for cross-tenant reads. The frontend
    also hides the Admin nav group and redirects, but that is convenience --
    the detail string below is what a typed URL should end up rendering.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
