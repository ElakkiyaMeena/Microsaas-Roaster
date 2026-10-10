"""roast_usages: append-only ledger for the daily roast quota

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10 18:00:00.000000

Existing roasts are back-filled into the ledger so today's quota is preserved on upgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('roast_usages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_roast_usages_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_roast_usages'))
    )
    with op.batch_alter_table('roast_usages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_roast_usages_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_roast_usages_user_id'), ['user_id'], unique=False)

    # Back-fill from existing roasts (portable INSERT ... SELECT).
    op.execute(
        "INSERT INTO roast_usages (user_id, created_at) "
        "SELECT user_id, created_at FROM roasts"
    )


def downgrade() -> None:
    """Revert this migration."""
    with op.batch_alter_table('roast_usages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_roast_usages_user_id'))
        batch_op.drop_index(batch_op.f('ix_roast_usages_created_at'))

    op.drop_table('roast_usages')
