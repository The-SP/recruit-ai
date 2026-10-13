"""add interview invite sent

Revision ID: b7e2d9c41a06
Revises: a3c9e1f2b7d4
Create Date: 2026-10-13 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2d9c41a06'
down_revision: Union[str, Sequence[str], None] = 'a3c9e1f2b7d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('interviews', sa.Column('invite_sent_to', sa.String(length=255), nullable=True))
    op.add_column('interviews', sa.Column('invite_sent_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('interviews', 'invite_sent_at')
    op.drop_column('interviews', 'invite_sent_to')
