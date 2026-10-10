"""Business logic for submissions: CRUD, ownership checks and upload persistence."""

from __future__ import annotations

import logging

import sqlalchemy as sa
from fastapi import UploadFile
from sqlalchemy.orm import Session, selectinload

from app.exceptions import BadRequestError, NotFoundError
from app.models.enums import SourceType
from app.models.roast import Roast
from app.models.submission import Submission, SubmissionFile
from app.schemas.common import Paginated
from app.schemas.submission import (
    GitHubCommitSubmissionCreate,
    GitHubSubmissionCreate,
    SubmissionCreate,
    SubmissionListItem,
    SubmissionUpdate,
    SubmissionUploadForm,
)
from app.services import github_service, upload_service

logger = logging.getLogger(__name__)


def get_owned_submission(db: Session, submission_id: int, user_id: int) -> Submission:
    """
    Fetch a submission owned by ``user_id``.

    Args:
        db: Database session
        submission_id: Submission primary key
        user_id: Current user's id

    Returns:
        The submission.

    Raises:
        NotFoundError: 404 if it does not exist **or** belongs to another user.
    """
    submission = db.scalar(
        sa.select(Submission).where(Submission.id == submission_id, Submission.user_id == user_id)
    )
    if submission is None:
        raise NotFoundError("Submission")
    return submission


def get_submission_detail(db: Session, submission_id: int, user_id: int) -> Submission:
    """
    Fetch an owned submission with files, roasts and roasts' share links eagerly loaded.

    Raises:
        NotFoundError: 404 if missing or owned by another user.
    """
    stmt = (
        sa.select(Submission)
        .where(Submission.id == submission_id, Submission.user_id == user_id)
        .options(
            selectinload(Submission.files),
            selectinload(Submission.roasts).selectinload(Roast.share_link),
        )
        .execution_options(populate_existing=True)
    )
    submission = db.scalar(stmt)
    if submission is None:
        raise NotFoundError("Submission")
    return submission


def list_submissions(
    db: Session, user_id: int, page: int, per_page: int
) -> Paginated[SubmissionListItem]:
    """
    List the user's submissions newest first with ``roast_count`` and ``latest_score``.

    Aggregates are computed with correlated scalar subqueries in a single statement (no N+1).

    Args:
        db: Database session
        user_id: Current user's id
        page: 1-based page number
        per_page: Page size

    Returns:
        A paginated list of submission summaries.
    """
    roast_count = (
        sa.select(sa.func.count(Roast.id))
        .where(Roast.submission_id == Submission.id)
        .correlate(Submission)
        .scalar_subquery()
    )
    latest_score = (
        sa.select(Roast.score)
        .where(Roast.submission_id == Submission.id, Roast.score.is_not(None))
        .order_by(Roast.created_at.desc(), Roast.id.desc())
        .limit(1)
        .correlate(Submission)
        .scalar_subquery()
    )
    stmt = (
        sa.select(
            Submission.id,
            Submission.title,
            Submission.language,
            Submission.source_type,
            Submission.source_url,
            Submission.created_at,
            Submission.updated_at,
            roast_count.label("roast_count"),
            latest_score.label("latest_score"),
        )
        .where(Submission.user_id == user_id)
        .order_by(Submission.created_at.desc(), Submission.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = db.execute(stmt).mappings().all()
    total = db.scalar(sa.select(sa.func.count(Submission.id)).where(Submission.user_id == user_id))
    items = [SubmissionListItem.model_validate(dict(row)) for row in rows]
    return Paginated[SubmissionListItem](
        items=items, total=int(total or 0), page=page, per_page=per_page
    )


def create_paste_submission(db: Session, user_id: int, data: SubmissionCreate) -> Submission:
    """
    Create a pasted-code submission.

    Args:
        db: Database session
        user_id: Owner id
        data: Validated request body

    Returns:
        The created submission with relationships loaded.
    """
    submission = Submission(
        user_id=user_id,
        title=data.title,
        assignment_brief=data.assignment_brief,
        language=data.language,
        source_type=SourceType.PASTE,
        code_content=data.code_content,
    )
    db.add(submission)
    db.commit()
    logger.info("Created paste submission id=%s user_id=%s", submission.id, user_id)
    return get_submission_detail(db, submission.id, user_id)


async def create_upload_submission(
    db: Session, user_id: int, form: SubmissionUploadForm, uploads: list[UploadFile]
) -> Submission:
    """
    Create a submission from uploaded files (zips are safely expanded; code is never executed).

    Files are written under ``UPLOAD_DIR/<user_id>/<uuid4>/`` and removed again if the
    database commit fails.

    Args:
        db: Database session
        user_id: Owner id
        form: Validated title / brief / language
        uploads: Uploaded files

    Returns:
        The created submission with relationships loaded.

    Raises:
        BadRequestError / PayloadTooLargeError: on any upload validation failure.
    """
    extracted = await upload_service.process_uploads(uploads)
    code_content = upload_service.build_code_content(extracted)
    submission_dir, stored = upload_service.save_files(user_id, extracted)
    try:
        submission = Submission(
            user_id=user_id,
            title=form.title,
            assignment_brief=form.assignment_brief,
            language=form.language,
            source_type=SourceType.UPLOAD,
            code_content=code_content,
        )
        submission.files = [
            SubmissionFile(
                filename=item.file.name,
                storage_path=item.storage_path,
                content_type=item.file.content_type,
                size_bytes=item.file.size_bytes,
            )
            for item in stored
        ]
        db.add(submission)
        db.commit()
    except Exception:
        db.rollback()
        upload_service.remove_directory(submission_dir)
        logger.exception("Failed to persist upload submission for user_id=%s", user_id)
        raise
    logger.info(
        "Created upload submission id=%s user_id=%s files=%d",
        submission.id,
        user_id,
        len(stored),
    )
    return get_submission_detail(db, submission.id, user_id)


async def create_github_commit_submission(
    db: Session, user_id: int, data: GitHubCommitSubmissionCreate
) -> Submission:
    """
    Create a submission from a public GitHub commit (its diff becomes the code to roast).

    The commit is fetched from the GitHub REST API; nothing is written to disk and no
    ``SubmissionFile`` rows are created.

    Args:
        db: Database session
        user_id: Owner id
        data: Validated request body (commit URL plus optional title / brief / language)

    Returns:
        The created submission with relationships loaded.

    Raises:
        BadRequestError: 400 ``INVALID_GITHUB_URL`` / ``NO_READABLE_FILES``.
        AppException: 404 ``GITHUB_COMMIT_NOT_FOUND``, 429 ``GITHUB_RATE_LIMITED``,
            502 ``GITHUB_UNAVAILABLE``.
    """
    ref = github_service.parse_commit_url(data.commit_url)
    return await _create_from_github(db, user_id, ref, data)


async def create_github_submission(
    db: Session, user_id: int, data: GitHubSubmissionCreate
) -> Submission:
    """
    Create a submission from a public GitHub link, auto-detecting commit vs. whole repository.

    Commit links behave exactly like ``create_github_commit_submission``. Repository links
    (``https://github.com/{owner}/{repo}[/tree/{ref}]``) roast a snapshot of the repository
    (structure plus selected files). Nothing is written to disk; no ``SubmissionFile`` rows.

    Args:
        db: Database session
        user_id: Owner id
        data: Validated request body (URL plus optional title / brief / language)

    Returns:
        The created submission with relationships loaded.

    Raises:
        BadRequestError: 400 ``INVALID_GITHUB_URL`` / ``NO_READABLE_FILES``.
        AppException: 404 ``GITHUB_COMMIT_NOT_FOUND`` / ``GITHUB_REPO_NOT_FOUND``,
            429 ``GITHUB_RATE_LIMITED``, 502 ``GITHUB_UNAVAILABLE``.
    """
    ref = github_service.parse_github_url(data.url)
    return await _create_from_github(db, user_id, ref, data)


async def _create_from_github(
    db: Session,
    user_id: int,
    ref: github_service.CommitRef | github_service.RepoRef,
    data: GitHubCommitSubmissionCreate | GitHubSubmissionCreate,
) -> Submission:
    """Fetch a commit or repository, build its content and persist the submission."""
    content: github_service.CommitContent | github_service.RepoContent
    if isinstance(ref, github_service.CommitRef):
        payload = await github_service.fetch_commit(ref)
        content = github_service.build_commit_content(payload, ref)
        source_type = SourceType.GITHUB_COMMIT
    else:
        content = await github_service.fetch_repo_content(ref)
        source_type = SourceType.GITHUB_REPO
    submission = Submission(
        user_id=user_id,
        title=data.title or content.title_default,
        assignment_brief=data.assignment_brief,
        language=data.language or content.language_guess,
        source_type=source_type,
        source_url=content.canonical_url,
        code_content=content.code_content,
    )
    db.add(submission)
    db.commit()
    logger.info(
        "Created %s submission id=%s user_id=%s files=%d",
        source_type.value,
        submission.id,
        user_id,
        content.file_count,
    )
    return get_submission_detail(db, submission.id, user_id)


def update_submission(
    db: Session, submission_id: int, user_id: int, data: SubmissionUpdate
) -> Submission:
    """
    Partially update an owned submission.

    Raises:
        NotFoundError: 404 if missing or owned by another user.
        BadRequestError: 400 ``CODE_NOT_EDITABLE`` when changing code of a non-pasted
            (uploaded, GitHub commit or GitHub repository) submission.
    """
    submission = get_owned_submission(db, submission_id, user_id)
    changes = data.model_dump(exclude_unset=True)
    if "code_content" in changes and submission.source_type != SourceType.PASTE:
        raise BadRequestError(
            "Code of uploaded or GitHub submissions cannot be edited",
            "CODE_NOT_EDITABLE",
        )
    for field in ("title", "language", "code_content"):
        if changes.get(field) is not None:
            setattr(submission, field, changes[field])
    if "assignment_brief" in changes:
        submission.assignment_brief = changes["assignment_brief"]
    db.commit()
    return get_submission_detail(db, submission.id, user_id)


def delete_submission(db: Session, submission_id: int, user_id: int) -> None:
    """
    Delete an owned submission (cascading files/roasts/share links) and its stored files.

    Raises:
        NotFoundError: 404 if missing or owned by another user.
    """
    submission = db.scalar(
        sa.select(Submission)
        .where(Submission.id == submission_id, Submission.user_id == user_id)
        .options(selectinload(Submission.files))
    )
    if submission is None:
        raise NotFoundError("Submission")
    directories = {
        directory
        for f in submission.files
        if (directory := upload_service.submission_dir_from_storage_path(f.storage_path))
        is not None
    }
    db.delete(submission)
    db.commit()
    for directory in directories:
        upload_service.remove_directory(directory)
    logger.info("Deleted submission id=%s user_id=%s", submission_id, user_id)
