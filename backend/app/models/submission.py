"""Submission and SubmissionFile models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.base import TimestampMixin, enum_column_type
from app.models.enums import SourceType

if TYPE_CHECKING:
    from app.models.roast import Roast
    from app.models.user import User


class Submission(Base, TimestampMixin):
    """A code assignment submitted by a user (pasted, uploaded or fetched from a GitHub commit)."""

    __tablename__ = "submissions"
    __table_args__ = (sa.Index("ix_submissions_user_id_created_at", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(sa.String(200), nullable=False)
    assignment_brief: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    language: Mapped[str] = mapped_column(sa.String(30), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(enum_column_type(SourceType), nullable=False)
    code_content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    #: Canonical origin URL (GitHub commit link) for ``github_commit`` submissions.
    source_url: Mapped[str | None] = mapped_column(sa.String(500), nullable=True)

    user: Mapped[User] = relationship(back_populates="submissions")
    files: Mapped[list[SubmissionFile]] = relationship(
        back_populates="submission", cascade="all, delete-orphan", passive_deletes=True
    )
    roasts: Mapped[list[Roast]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(Roast.created_at)",
    )

    def __repr__(self) -> str:
        return f"<Submission id={self.id} user_id={self.user_id} title={self.title!r}>"


class SubmissionFile(Base):
    """A single uploaded file belonging to a submission (stored under UPLOAD_DIR)."""

    __tablename__ = "submission_files"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        sa.ForeignKey("submissions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    submission: Mapped[Submission] = relationship(back_populates="files")

    def __repr__(self) -> str:
        return f"<SubmissionFile id={self.id} filename={self.filename!r}>"
