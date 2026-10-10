"""Admin business logic: user management, platform stats and share-link moderation."""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.exceptions import BadRequestError, NotFoundError
from app.models.enums import RoastStatus
from app.models.roast import Roast
from app.models.share_link import ShareLink
from app.models.submission import Submission
from app.models.user import RefreshToken, User
from app.schemas.admin import (
    AdminShareLinkItem,
    AdminStats,
    AdminUserItem,
    AdminUserUpdate,
    DailyCount,
)
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)

STATS_DAYS = 7


def _escape_like(term: str) -> str:
    """Escape LIKE wildcards (``%``, ``_``) and the escape char itself in a search term."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _utcnow() -> datetime:
    """Current time as an aware UTC datetime."""
    return datetime.now(timezone.utc)


def _as_utc_date(value: datetime) -> date:
    """Convert a (possibly naive, assumed UTC) datetime to its UTC calendar date."""
    if value.tzinfo is None:
        return value.date()
    return value.astimezone(timezone.utc).date()


def list_users(
    db: Session, *, offset: int, limit: int, search: str | None = None
) -> tuple[list[AdminUserItem], int]:
    """
    List users newest first with submission and roast counts.

    Counts are computed with grouped subqueries joined to the user query (no N+1).

    Args:
        db: Database session
        offset: Row offset
        limit: Max rows to return
        search: Optional case-insensitive substring matched against email or full name

    Returns:
        Tuple of (items for the page, total matching users)
    """
    filters: list[Any] = []
    term = (search or "").strip()
    if term:
        pattern = f"%{_escape_like(term.lower())}%"
        filters.append(
            or_(
                func.lower(User.email).like(pattern, escape="\\"),
                func.lower(func.coalesce(User.full_name, "")).like(pattern, escape="\\"),
            )
        )

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0

    submission_counts = (
        select(Submission.user_id.label("user_id"), func.count(Submission.id).label("cnt"))
        .group_by(Submission.user_id)
        .subquery()
    )
    roast_counts = (
        select(Roast.user_id.label("user_id"), func.count(Roast.id).label("cnt"))
        .group_by(Roast.user_id)
        .subquery()
    )
    stmt = (
        select(
            User,
            func.coalesce(submission_counts.c.cnt, 0),
            func.coalesce(roast_counts.c.cnt, 0),
        )
        .outerjoin(submission_counts, submission_counts.c.user_id == User.id)
        .outerjoin(roast_counts, roast_counts.c.user_id == User.id)
        .where(*filters)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items: list[AdminUserItem] = []
    for user, submission_count, roast_count in db.execute(stmt).all():
        base = UserResponse.model_validate(user).model_dump()
        items.append(
            AdminUserItem(
                **base, submission_count=int(submission_count), roast_count=int(roast_count)
            )
        )
    return items, int(total)


def update_user(db: Session, admin: User, user_id: int, data: AdminUserUpdate) -> User:
    """
    Update a user's ``is_active`` / ``is_admin`` flags.

    Deactivating a user revokes all of their refresh tokens.

    Args:
        db: Database session
        admin: The admin performing the change
        user_id: Target user id
        data: Fields to change (unset fields are left untouched)

    Returns:
        The updated User

    Raises:
        NotFoundError: The user does not exist
        BadRequestError: ``CANNOT_MODIFY_SELF`` when an admin deactivates or demotes themself
    """
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User")

    if user.id == admin.id and (data.is_active is False or data.is_admin is False):
        raise BadRequestError("Admins cannot deactivate or demote themselves", "CANNOT_MODIFY_SELF")

    if data.is_admin is not None:
        user.is_admin = data.is_admin
    if data.is_active is not None:
        user.is_active = data.is_active
        if not data.is_active:
            db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
                .values(revoked=True)
            )

    db.commit()
    db.refresh(user)
    logger.info(
        "Admin %s updated user %s (is_active=%s, is_admin=%s)",
        admin.id,
        user.id,
        data.is_active,
        data.is_admin,
    )
    return user


def get_stats(db: Session) -> AdminStats:
    """
    Compute platform-wide statistics.

    ``roasts_last_7_days`` holds exactly 7 entries (oldest to newest, today last), keyed by
    UTC date and zero-filled. Bucketing happens in Python so it works on SQLite and Postgres.

    Args:
        db: Database session

    Returns:
        AdminStats
    """
    now = _utcnow()
    today = now.date()
    start_day = today - timedelta(days=STATS_DAYS - 1)
    window_start = datetime.combine(start_day, time.min, tzinfo=timezone.utc)

    total_users = db.scalar(select(func.count(User.id))) or 0
    active_users = db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0
    total_submissions = db.scalar(select(func.count(Submission.id))) or 0
    roast_totals = db.execute(
        select(
            func.count(Roast.id),
            func.coalesce(func.sum(Roast.prompt_tokens), 0),
            func.coalesce(func.sum(Roast.completion_tokens), 0),
        )
    ).one()
    failed_roasts = (
        db.scalar(select(func.count(Roast.id)).where(Roast.status == RoastStatus.FAILED)) or 0
    )
    active_share_links = (
        db.scalar(
            select(func.count(ShareLink.id)).where(
                ShareLink.is_active.is_(True),
                or_(ShareLink.expires_at.is_(None), ShareLink.expires_at > now),
            )
        )
        or 0
    )

    buckets: dict[date, int] = {start_day + timedelta(days=i): 0 for i in range(STATS_DAYS)}
    for created_at in db.scalars(select(Roast.created_at).where(Roast.created_at >= window_start)):
        day = _as_utc_date(created_at)
        if day in buckets:
            buckets[day] += 1

    return AdminStats(
        total_users=int(total_users),
        active_users=int(active_users),
        total_submissions=int(total_submissions),
        total_roasts=int(roast_totals[0] or 0),
        failed_roasts=int(failed_roasts),
        roasts_last_7_days=[
            DailyCount(date=day.isoformat(), count=count) for day, count in buckets.items()
        ],
        total_prompt_tokens=int(roast_totals[1] or 0),
        total_completion_tokens=int(roast_totals[2] or 0),
        active_share_links=int(active_share_links),
    )


def list_share_links(
    db: Session, *, offset: int, limit: int
) -> tuple[list[AdminShareLinkItem], int]:
    """
    List all share links newest first with owner email, roast headline and submission title.

    Args:
        db: Database session
        offset: Row offset
        limit: Max rows to return

    Returns:
        Tuple of (items for the page, total share links)
    """
    total = db.scalar(select(func.count(ShareLink.id))) or 0
    stmt = (
        select(
            ShareLink.id,
            ShareLink.roast_id,
            ShareLink.slug,
            ShareLink.is_active,
            ShareLink.show_code,
            ShareLink.view_count,
            ShareLink.expires_at,
            ShareLink.created_at,
            Roast.headline,
            Submission.title,
            User.email,
        )
        .join(Roast, Roast.id == ShareLink.roast_id)
        .join(Submission, Submission.id == Roast.submission_id)
        .join(User, User.id == ShareLink.user_id)
        .order_by(ShareLink.created_at.desc(), ShareLink.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items = [
        AdminShareLinkItem.model_validate(
            {
                "id": row.id,
                "roast_id": row.roast_id,
                "slug": row.slug,
                "is_active": row.is_active,
                "show_code": row.show_code,
                "view_count": row.view_count,
                "expires_at": row.expires_at,
                "created_at": row.created_at,
                "roast_headline": row.headline,
                "submission_title": row.title,
                "owner_email": row.email,
            }
        )
        for row in db.execute(stmt).all()
    ]
    return items, int(total)


def delete_share_link(db: Session, admin: User, link_id: int) -> None:
    """
    Permanently delete a share link.

    Args:
        db: Database session
        admin: The admin performing the deletion
        link_id: Share link id

    Raises:
        NotFoundError: The share link does not exist
    """
    link = db.get(ShareLink, link_id)
    if link is None:
        raise NotFoundError("Share link")
    db.delete(link)
    db.commit()
    logger.info("Admin %s deleted share link %s", admin.id, link_id)
