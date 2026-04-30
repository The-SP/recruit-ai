"""add_user_id_to_runs_and_jobs

Revision ID: 51896a764020
Revises: ad00f8222310
Create Date: 2026-04-29 21:22:11.867132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '51896a764020'
down_revision: Union[str, Sequence[str], None] = 'ad00f8222310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "evaluation_runs",
        sa.Column("user_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_evaluation_runs_user_id",
        "evaluation_runs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_evaluation_runs_user_id", "evaluation_runs", ["user_id"], unique=False
    )

    op.add_column(
        "jobs",
        sa.Column("user_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_jobs_user_id",
        "jobs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_jobs_user_id", "jobs", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_jobs_user_id", table_name="jobs")
    op.drop_constraint("fk_jobs_user_id", "jobs", type_="foreignkey")
    op.drop_column("jobs", "user_id")

    op.drop_index("ix_evaluation_runs_user_id", table_name="evaluation_runs")
    op.drop_constraint(
        "fk_evaluation_runs_user_id", "evaluation_runs", type_="foreignkey"
    )
    op.drop_column("evaluation_runs", "user_id")
