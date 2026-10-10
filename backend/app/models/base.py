"""Reusable model mixins and column type helpers."""

from __future__ import annotations

import enum
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


def enum_column_type(enum_cls: type[enum.Enum]) -> sa.Enum:
    """
    Build a portable (non-native) enum column type storing the lowercase member values.

    Args:
        enum_cls: The ``str, enum.Enum`` class to store.

    Returns:
        A VARCHAR(20)-backed ``sa.Enum`` that works on PostgreSQL and SQLite.
    """
    return sa.Enum(
        enum_cls,
        native_enum=False,
        length=20,
        values_callable=lambda e: [m.value for m in e],
    )


class TimestampMixin:
    """Adds ``created_at`` (server default now) and ``updated_at`` (set on update)."""

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class SoftDeleteMixin:
    """Adds soft-delete flags (currently unused by Assignment Roaster models)."""

    is_deleted: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True), nullable=True)
