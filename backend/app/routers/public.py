"""Public, unauthenticated endpoints (shared roasts)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.exceptions import NotFoundError
from app.rate_limit import limiter
from app.schemas.public import PublicRoastResponse
from app.services import share_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])

# Plain ``def`` endpoint: sync SQLAlchemy work runs in FastAPI's threadpool, not on the loop.

MAX_SLUG_LENGTH = 64


@router.get("/roasts/{slug}", response_model=PublicRoastResponse)
@limiter.limit("60/minute")
def read_public_roast(
    request: Request,
    response: Response,
    slug: str,
    db: Session = Depends(get_db),
) -> PublicRoastResponse:
    """
    Return a shared roast by slug (no auth). Increments the link's view count.

    Returns 404 if the link is missing, inactive, expired, the roast is not completed, or the
    owner is inactive. Only whitelisted fields are returned.
    """
    if len(slug) > MAX_SLUG_LENGTH:
        raise NotFoundError("Roast")
    result = share_service.get_public_roast(db, slug)
    response.headers["Cache-Control"] = "no-store"
    return result
