"""Application exceptions. All are rendered as ``{"detail": ..., "code": ...}`` by ``main.py``."""

from __future__ import annotations


class AppException(Exception):  # noqa: N818 - name fixed by the project contract
    """Base class for domain errors that map to an HTTP response."""

    def __init__(self, message: str, code: str = "ERROR", status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class NotFoundError(AppException):
    """404 — resource missing (or owned by another user)."""

    def __init__(self, resource: str = "Resource") -> None:
        super().__init__(f"{resource} not found", "NOT_FOUND", 404)


class ConflictError(AppException):
    """409 — conflicting state, e.g. duplicate email."""

    def __init__(self, message: str = "Conflict", code: str = "CONFLICT") -> None:
        super().__init__(message, code, 409)


class BadRequestError(AppException):
    """400 — invalid request that passed schema validation."""

    def __init__(self, message: str = "Bad request", code: str = "BAD_REQUEST") -> None:
        super().__init__(message, code, 400)


class UnauthorizedError(AppException):
    """401 — missing or invalid credentials."""

    def __init__(self, message: str = "Not authenticated", code: str = "INVALID_TOKEN") -> None:
        super().__init__(message, code, 401)


class ForbiddenError(AppException):
    """403 — authenticated but not allowed."""

    def __init__(self, message: str = "Forbidden", code: str = "FORBIDDEN") -> None:
        super().__init__(message, code, 403)


class PayloadTooLargeError(AppException):
    """413 — uploaded payload exceeds configured limits."""

    def __init__(self, message: str = "Payload too large", code: str = "FILE_TOO_LARGE") -> None:
        super().__init__(message, code, 413)


class RateLimitError(AppException):
    """429 — rate limit or quota exceeded."""

    def __init__(self, message: str = "Too many requests", code: str = "RATE_LIMITED") -> None:
        super().__init__(message, code, 429)


class UpstreamError(AppException):
    """502 — upstream (e.g. AI provider) failure."""

    def __init__(self, message: str = "Upstream error", code: str = "UPSTREAM_ERROR") -> None:
        super().__init__(message, code, 502)


class ServiceUnavailableError(AppException):
    """503 — feature not configured or temporarily unavailable."""

    def __init__(
        self, message: str = "Service unavailable", code: str = "SERVICE_UNAVAILABLE"
    ) -> None:
        super().__init__(message, code, 503)
