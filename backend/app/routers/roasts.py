"""Roasts router: generate, list, fetch and delete AI roasts, plus the daily quota."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.roast import RoastCreate, RoastQuota, RoastResponse
from app.services import roast_service
from app.services.submission_service import get_owned_submission

router = APIRouter(tags=["roasts"])

# Sync-DB endpoints are plain ``def`` (FastAPI threadpool, no event-loop blocking). Only
# ``create_roast`` is ``async``: it awaits OpenAI and holds no DB connection during that call.


@router.post(
    "/submissions/{submission_id}/roasts",
    response_model=RoastResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_roast(
    submission_id: int,
    payload: RoastCreate | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RoastResponse:
    """
    Roast a submission synchronously. Returns 201 with status ``completed`` or ``failed``.

    Errors: 404 (not owner), 503 ``AI_NOT_CONFIGURED``, 429 ``ROAST_LIMIT_REACHED``.
    """
    submission = get_owned_submission(db, submission_id, current_user.id)
    intensity = payload.intensity if payload is not None else None
    roast = await roast_service.create_roast(db, submission, current_user, intensity)
    return RoastResponse.model_validate(roast)


@router.get("/submissions/{submission_id}/roasts", response_model=list[RoastResponse])
def list_submission_roasts(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RoastResponse]:
    """List a submission's roasts, newest first (404 if the submission is not owned)."""
    submission = get_owned_submission(db, submission_id, current_user.id)
    roast_service.expire_stale_pending(db, current_user.id)
    return [RoastResponse.model_validate(r) for r in roast_service.list_roasts(db, submission)]


@router.get("/roasts/quota", response_model=RoastQuota)
def read_roast_quota(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RoastQuota:
    """Return today's roast quota (resets at 00:00 UTC)."""
    return roast_service.get_quota(db, current_user)


@router.get("/roasts/{roast_id}", response_model=RoastResponse)
def read_roast(
    roast_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RoastResponse:
    """Fetch a single roast owned by the current user (404 otherwise)."""
    roast_service.expire_stale_pending(db, current_user.id)
    roast = roast_service.get_owned_roast(db, roast_id, current_user.id)
    return RoastResponse.model_validate(roast)


@router.delete("/roasts/{roast_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_roast(
    roast_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete a roast owned by the current user (and its share link)."""
    roast = roast_service.get_owned_roast(db, roast_id, current_user.id)
    roast_service.delete_roast(db, roast)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
