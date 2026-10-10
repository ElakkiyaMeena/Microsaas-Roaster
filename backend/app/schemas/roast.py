"""Pydantic schemas for roasts: AI output validation, requests and API responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import RoastIntensity, RoastStatus
from app.schemas.share_link import ShareLinkResponse, ensure_aware_utc

IssueSeverity = Literal["low", "medium", "high"]
IssueCategory = Literal["bug", "style", "performance", "security", "readability", "requirements"]

_SEVERITIES: frozenset[str] = frozenset(get_args(IssueSeverity))
_CATEGORIES: frozenset[str] = frozenset(get_args(IssueCategory))
MAX_FILE_LENGTH = 255
MAX_HEADLINE_LENGTH = 280


class RoastIssue(BaseModel):
    """A single concrete problem found in the submission, with a suggested fix."""

    file: str | None = Field(default=None, max_length=255)
    line: int | None = Field(default=None, ge=1)
    severity: IssueSeverity
    category: IssueCategory
    message: str = Field(min_length=1, max_length=2000)
    suggested_fix: str = Field(min_length=1, max_length=4000)

    # Lenient coercion of cosmetic fields so one sloppy value from the model does not discard
    # an otherwise good roast. ``message`` / ``suggested_fix`` stay strictly required.

    @field_validator("file", mode="before")
    @classmethod
    def _truncate_file(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value[:MAX_FILE_LENGTH] or None
        return value

    @field_validator("line", mode="before")
    @classmethod
    def _coerce_line(cls, value: Any) -> int | None:
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            return None
        return value

    @field_validator("severity", mode="before")
    @classmethod
    def _coerce_severity(cls, value: Any) -> str:
        normalized = value.strip().lower() if isinstance(value, str) else value
        return normalized if normalized in _SEVERITIES else "medium"

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_category(cls, value: Any) -> str:
        normalized = value.strip().lower() if isinstance(value, str) else value
        return normalized if normalized in _CATEGORIES else "readability"


class RoastResult(BaseModel):
    """Structured roast content returned by the AI model (validated before persisting)."""

    score: int = Field(ge=0, le=100)
    headline: str = Field(min_length=1, max_length=MAX_HEADLINE_LENGTH)
    summary: str = Field(min_length=1, max_length=5000)
    issues: list[RoastIssue] = Field(default_factory=list, max_length=50)
    strengths: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("headline", mode="before")
    @classmethod
    def _truncate_headline(cls, value: Any) -> Any:
        return value[:MAX_HEADLINE_LENGTH] if isinstance(value, str) else value


class RoastCreate(BaseModel):
    """Request body for creating a roast; ``intensity`` defaults to the user's preference."""

    intensity: RoastIntensity | None = None


class RoastResponse(BaseModel):
    """A roast as returned by the API (owner view)."""

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    submission_id: int
    intensity: RoastIntensity
    status: RoastStatus
    score: int | None = None
    headline: str | None = None
    summary: str | None = None
    issues: list[RoastIssue] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    model: str | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    share_link: ShareLinkResponse | None = None

    @field_validator("created_at", "completed_at")
    @classmethod
    def _aware(cls, value: datetime | None) -> datetime | None:
        return ensure_aware_utc(value) if value is not None else None


class RoastQuota(BaseModel):
    """Daily roast quota for the current user (resets at 00:00 UTC)."""

    limit: int
    used_today: int
    remaining: int
