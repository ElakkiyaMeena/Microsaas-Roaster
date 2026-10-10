"""Owner-facing share link endpoints: create/reactivate, list, update and delete."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.share_link import (
    ShareLinkCreate,
    ShareLinkListItem,
    ShareLinkResponse,
    ShareLinkUpdate,
)
from app.services import share_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sharing"])

# Plain ``def`` endpoints: sync SQLAlchemy work runs in FastAPI's threadpool, not on the loop.


@router.post(
    "/roasts/{roast_id}/share",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": ShareLinkResponse, "description": "Existing link reactivated"}},
)
def create_share_link(
    roast_id: int,
    response: Response,
    data: ShareLinkCreate | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ShareLinkResponse:
    """Create a share link for a completed roast (201) or reactivate the existing one (200)."""
    link, created = share_service.create_or_reactivate_share_link(
        db, roast_id, current_user.id, data or ShareLinkCreate()
    )
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return ShareLinkResponse.model_validate(link)


@router.get("/share-links", response_model=list[ShareLinkListItem])
def list_share_links(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ShareLinkListItem]:
    """List the current user's share links, newest first."""
    return share_service.list_share_links(db, current_user.id)


@router.patch("/share-links/{link_id}", response_model=ShareLinkResponse)
def update_share_link(
    link_id: int,
    data: ShareLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ShareLinkResponse:
    """Update ``is_active`` / ``show_code`` / ``expires_at`` on one of the user's links."""
    link = share_service.update_share_link(db, link_id, current_user.id, data)
    return ShareLinkResponse.model_validate(link)


@router.delete("/share-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_share_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Permanently delete one of the user's share links."""
    share_service.delete_share_link(db, link_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
