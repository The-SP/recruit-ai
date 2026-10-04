from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.schemas.auth import UserResponse
from app.auth.jwt import create_access_token, get_current_active_user
from app.auth.oauth import google
from app.config import Config
from app.models.database import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google")
async def login_with_google(request: Request) -> object:
    redirect_uri = f"{Config.BASE_URL}/auth/google/callback"
    return await google.authorize_redirect(request, redirect_uri)  # type: ignore[no-untyped-call]


@router.get("/google/callback")
async def google_callback(
    request: Request, db: Session = Depends(get_db)
) -> RedirectResponse:
    try:
        token = await google.authorize_access_token(request)  # type: ignore[no-untyped-call]
    except OAuthError as exc:
        # Cancelling Google's consent screen (or a stale state cookie) lands
        # here; send the user back to the login page with a reason instead
        # of a raw 500 from the API domain.
        reason = "cancelled" if exc.error == "access_denied" else "failed"
        return RedirectResponse(f"{Config.FRONTEND_URL}/login?error={reason}")
    userinfo = token.get("userinfo") or await google.userinfo(token=token)
    user = UserRepository(db).get_or_create(dict(userinfo))
    access_token = create_access_token({"sub": user.google_id})
    return RedirectResponse(f"{Config.FRONTEND_URL}/auth/callback?token={access_token}")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
