from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DeletionTarget(str, Enum):
    RUN = "run"
    RUN_ITEM = "run_item"


class DeletionAudit(Base):
    """One row per destructive action, written in the same transaction.

    Deletion is irreversible and cascades well past the row the user clicked:
    a run takes its candidates, evaluations, interviews, turns, resumes and
    recordings with it. This is the only record that any of it existed.

    Deliberately denormalized. Every id it stores points at a row that is gone
    by the time the audit is readable, so a join would return nothing -- the
    snapshot columns and `details` carry what was destroyed, not references to
    it. `actor_email` is copied for the same reason: the FK is SET NULL so the
    audit survives the account being removed, and the email is then the only
    remaining identification of who acted.
    """

    __tablename__ = "deletion_audits"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # DeletionTarget: what kind of thing was deleted.
    target_type: Mapped[str] = mapped_column(String(20), index=True)
    # The deleted row's own id. Intentionally not a FK -- the referent is gone.
    target_id: Mapped[UUID] = mapped_column(index=True)
    # For a run_item, the run it belonged to; for a run, the run itself.
    run_id: Mapped[UUID] = mapped_column(index=True)

    # SET NULL rather than CASCADE: deleting an account must not erase the
    # record of what that account destroyed.
    actor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, default=None
    )
    actor_email: Mapped[str | None] = mapped_column(String(255), default=None)

    # Snapshot of what was destroyed: job title, candidate names, row and file
    # counts. Shape varies by target_type, which is why it is JSONB.
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)

    def __repr__(self) -> str:
        return (
            f"<DeletionAudit(id={self.id}, target={self.target_type}, "
            f"target_id={self.target_id})>"
        )
