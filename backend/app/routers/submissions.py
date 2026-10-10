"""Submissions endpoints: list, create (paste / upload / GitHub commit), read, update, delete."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.common import Paginated, PaginationParams
from app.schemas.submission import (
    GitHubCommitSubmissionCreate,
    SubmissionCreate,
    SubmissionDetail,
    SubmissionListItem,
    SubmissionUpdate,
    SubmissionUploadForm,
)
from app.services import roast_service, submission_service

router = APIRouter(prefix="/submissions", tags=["submissions"])

# Sync-DB endpoints are plain ``def`` (run in FastAPI's threadpool, never blocking the event
# loop); only ``upload_submission`` and ``create_github_commit_submission`` are ``async``
# because they await streamed file reads / the GitHub API.


@router.get("", response_model=Paginated[SubmissionListItem])
def list_submissions(
    params: PaginationParams = Depends(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Paginated[SubmissionListItem]:
    """List the current user's submissions, newest first."""
    return submission_service.list_submissions(db, current_user.id, params.page, params.per_page)


@router.post("", response_model=SubmissionDetail, status_code=status.HTTP_201_CREATED)
def create_submission(
    body: SubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionDetail:
    """Create a submission from pasted code."""
    submission = submission_service.create_paste_submission(db, current_user.id, body)
    return SubmissionDetail.model_validate(submission)


@router.post("/upload", response_model=SubmissionDetail, status_code=status.HTTP_201_CREATED)
async def upload_submission(
    title: str = Form(...),
    language: str = Form(...),
    assignment_brief: str | None = Form(None),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionDetail:
    """Create a submission from uploaded source files and/or zip archives."""
    try:
        form = SubmissionUploadForm(
            title=title, language=language, assignment_brief=assignment_brief
        )
    except ValidationError as exc:
        raise RequestValidationError(
            [{**err, "loc": ("body", *err.get("loc", ()))} for err in exc.errors()]
        ) from exc
    submission = await submission_service.create_upload_submission(db, current_user.id, form, files)
    return SubmissionDetail.model_validate(submission)


@router.post("/github-commit", response_model=SubmissionDetail, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_github_commit_submission(
    request: Request,
    body: GitHubCommitSubmissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionDetail:
    """Create a submission from a public GitHub commit link (the diff is what gets roasted)."""
    submission = await submission_service.create_github_commit_submission(db, current_user.id, body)
    return SubmissionDetail.model_validate(submission)


@router.get("/{submission_id}", response_model=SubmissionDetail)
def read_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionDetail:
    """Get one of the current user's submissions with files and roasts."""
    roast_service.expire_stale_pending(db, current_user.id)
    submission = submission_service.get_submission_detail(db, submission_id, current_user.id)
    return SubmissionDetail.model_validate(submission)


@router.put("/{submission_id}", response_model=SubmissionDetail)
def update_submission(
    submission_id: int,
    body: SubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubmissionDetail:
    """Update a submission; code is only editable for pasted submissions."""
    submission = submission_service.update_submission(db, submission_id, current_user.id, body)
    return SubmissionDetail.model_validate(submission)


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Delete a submission, its roasts and its stored files."""
    submission_service.delete_submission(db, submission_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
