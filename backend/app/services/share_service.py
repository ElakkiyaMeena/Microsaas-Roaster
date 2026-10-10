"""Business logic for share links and the public roast view."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.exceptions import BadRequestError, NotFoundError
from app.models.enums import RoastStatus
from app.models.roast import Roast
from app.models.share_link import ShareLink
from app.models.submission import Submission
from app.schemas.public import PublicRoastResponse
from app.schemas.share_link import (
    ShareLinkCreate,
    ShareLinkListItem,
    ShareLinkResponse,
    ShareLinkUpdate,
    ensure_aware_utc,
)

logger = logging.getLogger(__name__)

SLUG_BYTES = 12
MAX_SLUG_ATTEMPTS = 5


def generate_slug() -> str:
    """Return a new URL-safe random slug (16 chars for 12 random bytes)."""
    return secrets.token_urlsafe(SLUG_BYTES)


def _is_expired(expires_at: datetime | None, now: datetime | None = None) -> bool:
    """True when ``expires_at`` is set and not in the future (naive values are treated as UTC)."""
    if expires_at is None:
        return False
    current = now or datetime.now(timezone.utc)
    return ensure_aware_utc(expires_at) <= current


def _get_owned_roast(db: Session, roast_id: int, user_id: int) -> Roast:
    """Load a roast owned by ``user_id`` (with its share link) or raise 404."""
    roast = db.scalars(
        select(Roast)
        .options(joinedload(Roast.share_link))
        .where(Roast.id == roast_id, Roast.user_id == user_id)
    ).first()
    if roast is None:
        raise NotFoundError("Roast")
    return roast


def get_owned_share_link(db: Session, link_id: int, user_id: int) -> ShareLink:
    """
    Load a share link owned by ``user_id``.

    Raises:
        NotFoundError: if the link is missing or belongs to another user.
    """
    link = db.scalars(
        select(ShareLink).where(ShareLink.id == link_id, ShareLink.user_id == user_id)
    ).first()
    if link is None:
        raise NotFoundError("Share link")
    return link


def create_or_reactivate_share_link(
    db: Session, roast_id: int, user_id: int, data: ShareLinkCreate
) -> tuple[ShareLink, bool]:
    """
    Create a share link for a completed roast, or reactivate the existing one.

    Args:
        db: Database session
        roast_id: Roast to share (must belong to ``user_id``)
        user_id: Current user's id
        data: ``show_code`` / ``expires_at`` settings

    Returns:
        ``(link, created)`` where ``created`` is False when an existing link was reactivated.

    Raises:
        NotFoundError: roast missing or owned by someone else.
        BadRequestError: ``ROAST_NOT_COMPLETED`` if the roast is not completed.
    """
    roast = _get_owned_roast(db, roast_id, user_id)
    if roast.status != RoastStatus.COMPLETED:
        raise BadRequestError("Only completed roasts can be shared", "ROAST_NOT_COMPLETED")

    existing = roast.share_link
    if existing is not None:
        existing.is_active = True
        existing.show_code = data.show_code
        existing.expires_at = data.expires_at
        db.commit()
        db.refresh(existing)
        logger.info("Reactivated share link id=%s for roast id=%s", existing.id, roast.id)
        return existing, False

    for attempt in range(1, MAX_SLUG_ATTEMPTS + 1):
        link = ShareLink(
            roast_id=roast.id,
            user_id=user_id,
            slug=generate_slug(),
            is_active=True,
            show_code=data.show_code,
            expires_at=data.expires_at,
        )
        db.add(link)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # A concurrent request may have created the link for this roast.
            concurrent = db.scalars(select(ShareLink).where(ShareLink.roast_id == roast.id)).first()
            if concurrent is not None:
                concurrent.is_active = True
                concurrent.show_code = data.show_code
                concurrent.expires_at = data.expires_at
                db.commit()
                db.refresh(concurrent)
                return concurrent, False
            logger.warning("Share slug collision (attempt %s); retrying", attempt)
            continue
        db.refresh(link)
        logger.info("Created share link id=%s for roast id=%s", link.id, roast.id)
        return link, True

    raise RuntimeError("Could not generate a unique share slug")


def list_share_links(db: Session, user_id: int) -> list[ShareLinkListItem]:
    """Return the user's share links with roast headline and submission title, newest first."""
    rows = db.execute(
        select(ShareLink, Roast.headline, Submission.title)
        .join(Roast, ShareLink.roast_id == Roast.id)
        .join(Submission, Roast.submission_id == Submission.id)
        .where(ShareLink.user_id == user_id)
        .order_by(ShareLink.created_at.desc(), ShareLink.id.desc())
    ).all()
    items: list[ShareLinkListItem] = []
    for link, headline, title in rows:
        base = ShareLinkResponse.model_validate(link).model_dump(exclude={"url"})
        items.append(ShareLinkListItem(**base, roast_headline=headline, submission_title=title))
    return items


def update_share_link(db: Session, link_id: int, user_id: int, data: ShareLinkUpdate) -> ShareLink:
    """Apply the provided fields of ``data`` to the user's share link (404 if not owned)."""
    link = get_owned_share_link(db, link_id, user_id)
    fields = data.model_fields_set
    if "is_active" in fields and data.is_active is not None:
        link.is_active = data.is_active
    if "show_code" in fields and data.show_code is not None:
        link.show_code = data.show_code
    if "expires_at" in fields:
        link.expires_at = data.expires_at
    db.commit()
    db.refresh(link)
    return link


def delete_share_link(db: Session, link_id: int, user_id: int) -> None:
    """Delete the user's share link (404 if not owned)."""
    link = get_owned_share_link(db, link_id, user_id)
    db.delete(link)
    db.commit()
    logger.info("Deleted share link id=%s", link_id)


def _first_name(full_name: str | None) -> str | None:
    """Return the first whitespace-separated token of ``full_name`` or ``None``."""
    if not full_name:
        return None
    parts = full_name.split()
    return parts[0] if parts else None


def get_public_roast(db: Session, slug: str) -> PublicRoastResponse:
    """
    Resolve a public share slug, increment its view count and return whitelisted fields.

    Raises:
        NotFoundError: ("Roast") if the link is missing, inactive, expired, the roast is not
            completed, or the owner is inactive.
    """
    link = db.scalars(
        select(ShareLink)
        .options(
            joinedload(ShareLink.roast).joinedload(Roast.submission),
            joinedload(ShareLink.user),
        )
        .where(ShareLink.slug == slug)
    ).first()
    if (
        link is None
        or not link.is_active
        or _is_expired(link.expires_at)
        or link.roast.status != RoastStatus.COMPLETED
        or not link.user.is_active
    ):
        raise NotFoundError("Roast")

    db.execute(
        update(ShareLink)
        .where(ShareLink.id == link.id)
        .values(view_count=ShareLink.view_count + 1)
        .execution_options(synchronize_session=False)
    )
    db.commit()

    roast = link.roast
    submission = roast.submission
    intensity = roast.intensity.value if hasattr(roast.intensity, "value") else roast.intensity
    return PublicRoastResponse(
        slug=link.slug,
        submission_title=submission.title,
        language=submission.language,
        intensity=str(intensity),
        score=roast.score,
        headline=roast.headline,
        summary=roast.summary,
        issues=list(roast.issues or []),
        strengths=list(roast.strengths or []),
        code_content=submission.code_content if link.show_code else None,
        author_name=_first_name(link.user.full_name),
        created_at=ensure_aware_utc(roast.created_at),
    )
