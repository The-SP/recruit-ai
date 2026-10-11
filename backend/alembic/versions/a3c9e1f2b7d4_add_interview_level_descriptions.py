"""add interview level descriptions

Revision ID: a3c9e1f2b7d4
Revises: f640645dd32b
Create Date: 2026-10-11 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a3c9e1f2b7d4'
down_revision: Union[str, Sequence[str], None] = 'f640645dd32b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('interview_templates', sa.Column('level_descriptions', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('interviews', sa.Column('level_descriptions', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('interviews', 'level_descriptions')
    op.drop_column('interview_templates', 'level_descriptions')
