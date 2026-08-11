from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.logger import init_logger
from app.models.user import User

logger = init_logger(__name__)


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_google_id(self, google_id: str) -> User | None:
        stmt = select(User).where(User.google_id == google_id)
        return self.db.scalars(stmt).first()

    def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email)
        return self.db.scalars(stmt).first()

    def create(self, user_data: dict[str, Any]) -> User:
        user = User(**user_data)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        logger.info(f"Created user: id={user.id}, email={user.email}")
        return user

    def list_all(
        self, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[User]:
        """Every user, newest first. Cross-tenant: admin reads only."""
        stmt = select(User)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(User.full_name.ilike(pattern) | User.email.ilike(pattern))
        stmt = stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
        return list(self.db.scalars(stmt).all())

    def count(self, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(User)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(User.full_name.ilike(pattern) | User.email.ilike(pattern))
        return self.db.scalar(stmt) or 0

    def count_since(self, since: datetime) -> int:
        stmt = select(func.count()).select_from(User).where(User.created_at >= since)
        return self.db.scalar(stmt) or 0

    def get_or_create(self, userinfo: dict[str, Any]) -> User:
        google_id: str = userinfo["sub"]
        user = self.get_by_google_id(google_id)
        if user is None:
            user = self.create(
                {
                    "google_id": google_id,
                    "email": userinfo["email"],
                    "full_name": userinfo.get("name"),
                    "avatar_url": userinfo.get("picture"),
                }
            )
        return user
