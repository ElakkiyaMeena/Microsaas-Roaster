"""Shared schemas: pagination and error envelope."""

from __future__ import annotations

from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel

T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    """Paginated list response: ``{"items", "total", "page", "per_page"}``."""

    items: list[T]
    total: int
    page: int
    per_page: int


class PaginationParams:
    """Query-param dependency: ``page`` (≥1, default 1) and ``per_page`` (1–100, default 20)."""

    def __init__(
        self,
        page: int = Query(1, ge=1, description="1-based page number"),
        per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    ) -> None:
        self.page = page
        self.per_page = per_page

    @property
    def offset(self) -> int:
        """Row offset for the current page."""
        return (self.page - 1) * self.per_page

    @property
    def limit(self) -> int:
        """Row limit (alias of ``per_page``)."""
        return self.per_page


class ErrorResponse(BaseModel):
    """Error envelope returned by every error response."""

    detail: str
    code: str
