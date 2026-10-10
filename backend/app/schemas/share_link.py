"""Pydantic schemas for the Sharing module (owner-facing share links).

NOTE: this module must not import ``app.schemas.roast`` (``RoastResponse`` imports
``ShareLinkResponse`` from here; importing back would create a cycle).
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.config import settings


def ensure_aware_utc(value: datetime) -> datetime:
    """Return ``value`` as a timezone-aware datetime, assuming UTC when it is naive."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _validate_future(value: datetime | None) -> datetime | None:
    """Normalize ``value`` to aware UTC and require it to be in the future (``None`` passes)."""
    if value is None:
        return None
    aware = ensure_aware_utc(value)
    if aware <= datetime.now(timezone.utc):
        raise ValueError("expires_at must be in the future")
    return aware


def build_share_url(slug: str) -> str:
    """Build the public frontend URL for a share slug: ``{FRONTEND_URL}/r/{slug}``."""
    return f"{settings.FRONTEND_URL.rstrip('/')}/r/{slug}"


class ShareLinkCreate(BaseModel):
    """Request body for ``POST /roasts/{id}/share``."""

    show_code: bool = False
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def _expires_in_future(cls, value: datetime | None) -> datetime | None:
        return _validate_future(value)


class ShareLinkUpdate(BaseModel):
    """Request body for ``PATCH /share-links/{id}``. Only provided fields are applied.

    Sending ``"expires_at": null`` explicitly clears the expiry.
    """

    is_active: bool | None = None
    show_code: bool | None = None
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def _expires_in_future(cls, value: datetime | None) -> datetime | None:
        return _validate_future(value)


class ShareLinkResponse(BaseModel):
    """Owner-facing representation of a share link."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    roast_id: int
    slug: str
    is_active: bool
    show_code: bool
    view_count: int
    expires_at: datetime | None = None
    created_at: datetime

    @field_validator("expires_at", "created_at")
    @classmethod
    def _aware(cls, value: datetime | None) -> datetime | None:
        return ensure_aware_utc(value) if value is not None else None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def url(self) -> str:
        """Public URL of the shared roast page."""
        return build_share_url(self.slug)


class ShareLinkListItem(ShareLinkResponse):
    """Share link plus context for listing: roast headline and submission title."""

    roast_headline: str | None = None
    submission_title: str
