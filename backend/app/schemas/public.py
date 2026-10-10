"""Public (unauthenticated) response schemas.

Only whitelisted fields are exposed: no user ids, emails or internal ids other than the slug.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class PublicRoastResponse(BaseModel):
    """A shared roast as shown on the public ``/r/{slug}`` page."""

    slug: str
    submission_title: str
    language: str
    intensity: str
    score: int | None = None
    headline: str | None = None
    summary: str | None = None
    #: List of RoastIssue-shaped dicts (file, line, severity, category, message, suggested_fix).
    issues: list[dict[str, Any]]
    strengths: list[str]
    #: ``None`` unless the owner enabled ``show_code`` on the link.
    code_content: str | None = None
    #: First name only (first token of the owner's ``full_name``) or ``None``.
    author_name: str | None = None
    created_at: datetime
