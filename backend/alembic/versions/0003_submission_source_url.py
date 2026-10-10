"""submissions.source_url for GitHub commit submissions

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-10 20:00:00.000000

``source_type`` is a non-native VARCHAR(20) enum without a CHECK constraint, so the new
``github_commit`` value needs no schema change; only the nullable ``source_url`` column is added.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Revert this migration."""
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('source_url')
