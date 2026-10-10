"""Pydantic schemas for the submissions module."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import ALLOWED_LANGUAGES, settings
from app.models.enums import SourceType
from app.schemas.roast import RoastResponse

MAX_TITLE_LENGTH = 200
MAX_BRIEF_LENGTH = 5000
MAX_URL_LENGTH = 500


def validate_title(value: str) -> str:
    """Strip a title and ensure it is 1–200 characters."""
    stripped = value.strip()
    if not stripped:
        raise ValueError("Title must not be blank")
    if len(stripped) > MAX_TITLE_LENGTH:
        raise ValueError(f"Title must be at most {MAX_TITLE_LENGTH} characters")
    return stripped


def validate_brief(value: str | None) -> str | None:
    """Strip an assignment brief (empty → ``None``) and ensure it is ≤ 5000 characters."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > MAX_BRIEF_LENGTH:
        raise ValueError(f"Assignment brief must be at most {MAX_BRIEF_LENGTH} characters")
    return stripped


def validate_language(value: str) -> str:
    """Normalize a language to lowercase and ensure it is one of ``ALLOWED_LANGUAGES``."""
    normalized = value.strip().lower()
    if normalized not in ALLOWED_LANGUAGES:
        allowed = ", ".join(sorted(ALLOWED_LANGUAGES))
        raise ValueError(f"Language must be one of: {allowed}")
    return normalized


def validate_code(value: str) -> str:
    """Ensure code content is non-blank and at most ``MAX_CODE_CHARS`` characters."""
    if not value.strip():
        raise ValueError("Code content must not be blank")
    if len(value) > settings.MAX_CODE_CHARS:
        raise ValueError(f"Code content must be at most {settings.MAX_CODE_CHARS} characters")
    return value


class SubmissionCreate(BaseModel):
    """Request body for creating a pasted submission."""

    title: str
    assignment_brief: str | None = None
    language: str
    code_content: str

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str) -> str:
        return validate_title(value)

    @field_validator("assignment_brief")
    @classmethod
    def _check_brief(cls, value: str | None) -> str | None:
        return validate_brief(value)

    @field_validator("language")
    @classmethod
    def _check_language(cls, value: str) -> str:
        return validate_language(value)

    @field_validator("code_content")
    @classmethod
    def _check_code(cls, value: str) -> str:
        return validate_code(value)


class SubmissionUploadForm(BaseModel):
    """Validated non-file fields of the multipart upload form."""

    title: str
    assignment_brief: str | None = None
    language: str

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str) -> str:
        return validate_title(value)

    @field_validator("assignment_brief")
    @classmethod
    def _check_brief(cls, value: str | None) -> str | None:
        return validate_brief(value)

    @field_validator("language")
    @classmethod
    def _check_language(cls, value: str) -> str:
        return validate_language(value)


class GitHubCommitSubmissionCreate(BaseModel):
    """Request body for creating a submission from a public GitHub commit link."""

    commit_url: str = Field(max_length=MAX_URL_LENGTH)
    title: str | None = None
    assignment_brief: str | None = None
    language: str | None = None

    @field_validator("commit_url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Commit URL must not be blank")
        return stripped

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_title(value)

    @field_validator("assignment_brief")
    @classmethod
    def _check_brief(cls, value: str | None) -> str | None:
        return validate_brief(value)

    @field_validator("language")
    @classmethod
    def _check_language(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_language(value)


class GitHubSubmissionCreate(BaseModel):
    """Request body for creating a submission from a public GitHub repository or commit link."""

    url: str = Field(max_length=MAX_URL_LENGTH)
    title: str | None = None
    assignment_brief: str | None = None
    language: str | None = None

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("URL must not be blank")
        return stripped

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_title(value)

    @field_validator("assignment_brief")
    @classmethod
    def _check_brief(cls, value: str | None) -> str | None:
        return validate_brief(value)

    @field_validator("language")
    @classmethod
    def _check_language(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return validate_language(value)


class SubmissionUpdate(BaseModel):
    """Request body for partially updating a submission (all fields optional)."""

    title: str | None = None
    assignment_brief: str | None = None
    language: str | None = None
    code_content: str | None = None

    @field_validator("title")
    @classmethod
    def _check_title(cls, value: str | None) -> str | None:
        return None if value is None else validate_title(value)

    @field_validator("assignment_brief")
    @classmethod
    def _check_brief(cls, value: str | None) -> str | None:
        return validate_brief(value)

    @field_validator("language")
    @classmethod
    def _check_language(cls, value: str | None) -> str | None:
        return None if value is None else validate_language(value)

    @field_validator("code_content")
    @classmethod
    def _check_code(cls, value: str | None) -> str | None:
        return None if value is None else validate_code(value)


class SubmissionFileResponse(BaseModel):
    """Metadata for a stored uploaded file (never includes the storage path)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class SubmissionListItem(BaseModel):
    """A submission row in the paginated list, with aggregated roast stats."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    language: str
    source_type: SourceType
    source_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    roast_count: int = 0
    latest_score: int | None = None


class SubmissionDetail(BaseModel):
    """Full submission including code, files and roasts (newest first)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    assignment_brief: str | None = None
    language: str
    source_type: SourceType
    source_url: str | None = None
    code_content: str
    created_at: datetime
    updated_at: datetime | None = None
    files: list[SubmissionFileResponse] = Field(default_factory=list)
    roasts: list[RoastResponse] = Field(default_factory=list)
