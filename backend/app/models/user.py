"""User and RefreshToken models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.base import TimestampMixin, enum_column_type
from app.models.enums import RoastIntensity

if TYPE_CHECKING:
    from app.models.roast import Roast
    from app.models.share_link import ShareLink
    from app.models.submission import Submission


class User(Base, TimestampMixin):
    """An application user (email/password and/or Google OAuth)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(sa.String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, server_default=sa.true(), nullable=False
    )
    is_verified: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false(), nullable=False
    )
    is_admin: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false(), nullable=False
    )
    oauth_provider: Mapped[str | None] = mapped_column(sa.String(20), nullable=True)
    google_id: Mapped[str | None] = mapped_column(
        sa.String(255), unique=True, index=True, nullable=True
    )
    avatar_url: Mapped[str | None] = mapped_column(sa.String(500), nullable=True)
    default_intensity: Mapped[RoastIntensity] = mapped_column(
        enum_column_type(RoastIntensity),
        default=RoastIntensity.MEDIUM,
        server_default=RoastIntensity.MEDIUM.value,
        nullable=False,
    )

    submissions: Mapped[list[Submission]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    roasts: Mapped[list[Roast]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    share_links: Mapped[list[ShareLink]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class RefreshToken(Base):
    """A refresh token record; only the SHA-256 hex digest of the JWT is stored."""

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="refresh_tokens")

    def __repr__(self) -> str:
        return f"<RefreshToken id={self.id} user_id={self.user_id} revoked={self.revoked}>"
