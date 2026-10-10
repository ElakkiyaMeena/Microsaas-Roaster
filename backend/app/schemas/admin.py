"""Schemas for the admin module (``/api/v1/admin/*``)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.share_link import ShareLinkListItem
from app.schemas.user import UserResponse


class AdminUserItem(UserResponse):
    """A user row in the admin user list, with activity counts."""

    submission_count: int = 0
    roast_count: int = 0


class AdminUserUpdate(BaseModel):
    """Partial update of a user's account flags by an admin."""

    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None
    is_admin: bool | None = None


class DailyCount(BaseModel):
    """Number of roasts created on a single UTC day."""

    date: str = Field(description="UTC date as YYYY-MM-DD")
    count: int


class AdminStats(BaseModel):
    """Platform-wide statistics for the admin dashboard."""

    total_users: int
    active_users: int
    total_submissions: int
    total_roasts: int
    failed_roasts: int
    roasts_last_7_days: list[DailyCount]
    total_prompt_tokens: int
    total_completion_tokens: int
    active_share_links: int


class AdminShareLinkItem(ShareLinkListItem):
    """A share link row in the admin list, including the owner's email."""

    owner_email: str
