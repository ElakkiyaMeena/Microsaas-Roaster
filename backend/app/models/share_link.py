"""ShareLink model: a public, slug-addressed link to a roast."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base

if TYPE_CHECKING:
    from app.models.roast import Roast
    from app.models.user import User


class ShareLink(Base):
    """A public share link for a roast (at most one per roast)."""

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    roast_id: Mapped[int] = mapped_column(
        sa.ForeignKey("roasts.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    slug: Mapped[str] = mapped_column(sa.String(32), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, default=True, server_default=sa.true(), nullable=False
    )
    show_code: Mapped[bool] = mapped_column(
        sa.Boolean, default=False, server_default=sa.false(), nullable=False
    )
    view_count: Mapped[int] = mapped_column(
        sa.Integer, default=0, server_default="0", nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    roast: Mapped[Roast] = relationship(back_populates="share_link")
    user: Mapped[User] = relationship(back_populates="share_links")

    def __repr__(self) -> str:
        return f"<ShareLink id={self.id} slug={self.slug!r} active={self.is_active}>"
