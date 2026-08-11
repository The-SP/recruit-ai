"""add is_admin to users

Revision ID: 9a3c1f7b42de
Revises: 5edfbfda4cc6
Create Date: 2026-08-11 10:12:04.318725

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a3c1f7b42de'
down_revision: Union[str, Sequence[str], None] = '5edfbfda4cc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default is what makes a NOT NULL add safe on a populated table.
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'is_admin')
