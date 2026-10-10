"""User response and profile-update schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RoastIntensity


class UserResponse(BaseModel):
    """Public representation of the authenticated user (never includes secrets)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str | None = None
    is_active: bool
    is_verified: bool
    is_admin: bool
    oauth_provider: str | None = None
    avatar_url: str | None = None
    default_intensity: RoastIntensity
    created_at: datetime


class UserUpdate(BaseModel):
    """
    Partial profile update for ``PUT /auth/me``.

    Only fields present in the request body are applied. ``full_name`` may be set to ``null``
    (or an empty string) to clear it; ``default_intensity: null`` is ignored.
    """

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, max_length=100)
    default_intensity: RoastIntensity | None = None

    @field_validator("full_name")
    @classmethod
    def _strip_full_name(cls, value: str | None) -> str | None:
        """Trim whitespace and normalize blank names to ``None``."""
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
