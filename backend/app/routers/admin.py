"""Admin endpoints (``/api/v1/admin/*``). Every route requires an admin user (403 otherwise)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_admin, get_db
from app.models.user import User
from app.schemas.admin import AdminShareLinkItem, AdminStats, AdminUserItem, AdminUserUpdate
from app.schemas.common import Paginated, PaginationParams
from app.schemas.user import UserResponse
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

# Plain ``def`` endpoints: sync SQLAlchemy work runs in FastAPI's threadpool, not on the loop.


@router.get("/users", response_model=Paginated[AdminUserItem])
def list_users(
    params: PaginationParams = Depends(),
    search: str | None = Query(None, max_length=255, description="Email or name substring"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Paginated[AdminUserItem]:
    """List users (newest first) with submission and roast counts; optional search."""
    items, total = admin_service.list_users(
        db, offset=params.offset, limit=params.limit, search=search
    )
    return Paginated[AdminUserItem](
        items=items, total=total, page=params.page, per_page=params.per_page
    )


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> UserResponse:
    """Activate/deactivate or promote/demote a user. Admins cannot modify themselves."""
    user = admin_service.update_user(db, admin, user_id, data)
    return UserResponse.model_validate(user)


@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> AdminStats:
    """Platform-wide totals, token usage and roasts per day for the last 7 UTC days."""
    return admin_service.get_stats(db)


@router.get("/share-links", response_model=Paginated[AdminShareLinkItem])
def list_share_links(
    params: PaginationParams = Depends(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Paginated[AdminShareLinkItem]:
    """List all share links (newest first) with owner email, roast headline and title."""
    items, total = admin_service.list_share_links(db, offset=params.offset, limit=params.limit)
    return Paginated[AdminShareLinkItem](
        items=items, total=total, page=params.page, per_page=params.per_page
    )


@router.delete("/share-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_share_link(
    link_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> Response:
    """Permanently delete a share link (404 if missing)."""
    admin_service.delete_share_link(db, admin, link_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
