"""RoastUsage model: an append-only ledger of roast attempts used for the daily quota."""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class RoastUsage(Base):
    """
    One row per roast attempt, written in the same commit as the pending Roast.

    Rows are never deleted when a roast or submission is deleted, so users cannot reset their
    daily quota by deleting roasts. They are only removed together with the user (CASCADE).
    """

    __tablename__ = "roast_usages"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )

    def __repr__(self) -> str:
        return f"<RoastUsage id={self.id} user_id={self.user_id}>"
