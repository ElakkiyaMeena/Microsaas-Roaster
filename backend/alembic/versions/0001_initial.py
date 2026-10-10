"""initial schema: users, refresh_tokens, submissions, submission_files, roasts, share_links

Revision ID: 0001
Revises:
Create Date: 2026-10-10 15:45:18.910185

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply this migration."""
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=True),
    sa.Column('full_name', sa.String(length=100), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('is_admin', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('oauth_provider', sa.String(length=20), nullable=True),
    sa.Column('google_id', sa.String(length=255), nullable=True),
    sa.Column('avatar_url', sa.String(length=500), nullable=True),
    sa.Column('default_intensity', sa.Enum('mild', 'medium', 'savage', name='roastintensity', native_enum=False, length=20), server_default='medium', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_google_id'), ['google_id'], unique=True)

    op.create_table('refresh_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens'))
    )
    with op.batch_alter_table('refresh_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_refresh_tokens_token_hash'), ['token_hash'], unique=True)
        batch_op.create_index(batch_op.f('ix_refresh_tokens_user_id'), ['user_id'], unique=False)

    op.create_table('submissions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('assignment_brief', sa.Text(), nullable=True),
    sa.Column('language', sa.String(length=30), nullable=False),
    sa.Column('source_type', sa.Enum('paste', 'upload', name='sourcetype', native_enum=False, length=20), nullable=False),
    sa.Column('code_content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_submissions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_submissions'))
    )
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_submissions_user_id'), ['user_id'], unique=False)
        batch_op.create_index('ix_submissions_user_id_created_at', ['user_id', 'created_at'], unique=False)

    op.create_table('roasts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('submission_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('intensity', sa.Enum('mild', 'medium', 'savage', name='roastintensity', native_enum=False, length=20), nullable=False),
    sa.Column('status', sa.Enum('pending', 'completed', 'failed', name='roaststatus', native_enum=False, length=20), server_default='pending', nullable=False),
    sa.Column('score', sa.Integer(), nullable=True),
    sa.Column('headline', sa.String(length=280), nullable=True),
    sa.Column('summary', sa.Text(), nullable=True),
    sa.Column('issues', sa.JSON(), nullable=False),
    sa.Column('strengths', sa.JSON(), nullable=False),
    sa.Column('model', sa.String(length=100), nullable=True),
    sa.Column('prompt_tokens', sa.Integer(), nullable=True),
    sa.Column('completion_tokens', sa.Integer(), nullable=True),
    sa.Column('error_message', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['submission_id'], ['submissions.id'], name=op.f('fk_roasts_submission_id_submissions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_roasts_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_roasts'))
    )
    with op.batch_alter_table('roasts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_roasts_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_roasts_submission_id'), ['submission_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_roasts_user_id'), ['user_id'], unique=False)
        batch_op.create_index('ix_roasts_user_id_created_at', ['user_id', 'created_at'], unique=False)

    op.create_table('submission_files',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('submission_id', sa.Integer(), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('storage_path', sa.String(length=500), nullable=False),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['submission_id'], ['submissions.id'], name=op.f('fk_submission_files_submission_id_submissions'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_submission_files'))
    )
    with op.batch_alter_table('submission_files', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_submission_files_submission_id'), ['submission_id'], unique=False)

    op.create_table('share_links',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('roast_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('slug', sa.String(length=32), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
    sa.Column('show_code', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('view_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['roast_id'], ['roasts.id'], name=op.f('fk_share_links_roast_id_roasts'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_share_links_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_share_links'))
    )
    with op.batch_alter_table('share_links', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_share_links_roast_id'), ['roast_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_share_links_slug'), ['slug'], unique=True)
        batch_op.create_index(batch_op.f('ix_share_links_user_id'), ['user_id'], unique=False)



def downgrade() -> None:
    """Revert this migration."""
    with op.batch_alter_table('share_links', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_share_links_user_id'))
        batch_op.drop_index(batch_op.f('ix_share_links_slug'))
        batch_op.drop_index(batch_op.f('ix_share_links_roast_id'))

    op.drop_table('share_links')
    with op.batch_alter_table('submission_files', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_submission_files_submission_id'))

    op.drop_table('submission_files')
    with op.batch_alter_table('roasts', schema=None) as batch_op:
        batch_op.drop_index('ix_roasts_user_id_created_at')
        batch_op.drop_index(batch_op.f('ix_roasts_user_id'))
        batch_op.drop_index(batch_op.f('ix_roasts_submission_id'))
        batch_op.drop_index(batch_op.f('ix_roasts_created_at'))

    op.drop_table('roasts')
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_index('ix_submissions_user_id_created_at')
        batch_op.drop_index(batch_op.f('ix_submissions_user_id'))

    op.drop_table('submissions')
    with op.batch_alter_table('refresh_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_user_id'))
        batch_op.drop_index(batch_op.f('ix_refresh_tokens_token_hash'))

    op.drop_table('refresh_tokens')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_google_id'))
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
