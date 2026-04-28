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

router = APIRouter()


@router.get("/google")
async def login_with_google(request: Request) -> object:
    redirect_uri = f"{Config.BASE_URL}/auth/google/callback"
    return await google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(
    request: Request, db: Session = Depends(get_db)
) -> RedirectResponse:
    token = await google.authorize_access_token(request)
    userinfo = token.get("userinfo") or await google.userinfo(token=token)
    user = UserRepository(db).get_or_create(dict(userinfo))
    access_token = create_access_token({"sub": user.google_id})
    return RedirectResponse(f"{Config.FRONTEND_URL}/auth/callback?token={access_token}")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)
