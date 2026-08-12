from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logger import init_logger
from app.models.deletion_audit import DeletionAudit, DeletionTarget

logger = init_logger(__name__)


class DeletionAuditRepository:
    def __init__(self, db: Session):
        self.db = db

    def record(
        self,
        target_type: DeletionTarget,
        target_id: UUID,
        run_id: UUID,
        actor_user_id: UUID | None,
        actor_email: str | None,
        details: dict[str, Any],
    ) -> DeletionAudit:
        """Stage an audit row. Does not commit.

        The caller commits, so the audit and the deletion land in one
        transaction: a rollback must not leave a record of something that still
        exists, and a successful delete must not be able to lose its record.
        """
        audit = DeletionAudit(
            target_type=target_type.value,
            target_id=target_id,
            run_id=run_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            details=details,
        )
        self.db.add(audit)
        return audit

    def list_recent(self, limit: int = 100) -> list[DeletionAudit]:
        """Most recent deletions first. For psql/ops use; no HTTP surface."""
        stmt = (
            select(DeletionAudit).order_by(DeletionAudit.created_at.desc()).limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def list_for_run(self, run_id: UUID) -> list[DeletionAudit]:
        """Every deletion recorded against one run, oldest first.

        Item deletions and the eventual run deletion share a run_id, so this
        reconstructs the whole history of a run that no longer exists.
        """
        stmt = (
            select(DeletionAudit)
            .where(DeletionAudit.run_id == run_id)
            .order_by(DeletionAudit.created_at)
        )
        return list(self.db.scalars(stmt).all())
