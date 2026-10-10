"""FastAPI application factory for the Assignment Roaster API."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from http import HTTPStatus
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings, warn_if_insecure
from app.exceptions import AppException
from app.rate_limit import limiter
from app.routers import admin, auth, public, roasts, share_links, submissions

logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"
REQUEST_TOO_LARGE_CODE = "REQUEST_TOO_LARGE"


class RequestTooLargeError(StarletteHTTPException):
    """Raised while streaming a request body that exceeds ``MAX_REQUEST_BYTES``."""

    def __init__(self, max_bytes: int) -> None:
        super().__init__(status_code=413, detail=_too_large_detail(max_bytes))
        self.code = REQUEST_TOO_LARGE_CODE


def _too_large_detail(max_bytes: int) -> str:
    return f"Request body exceeds the {max_bytes} byte limit"


class BodySizeLimitMiddleware:
    """
    Pure ASGI middleware capping request bodies at ``max_bytes`` (413 ``REQUEST_TOO_LARGE``).

    Requests declaring a larger ``Content-Length`` are rejected before any body is read; for
    chunked/undeclared bodies the streamed bytes are counted and reading aborts once the cap
    is exceeded, so oversized uploads are never buffered in full.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send: Send) -> None:
        body = json.dumps(_error(_too_large_detail(self.max_bytes), REQUEST_TOO_LARGE_CODE)).encode(
            "utf-8"
        )
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = -1
                if declared > self.max_bytes:
                    await self._reject(send)
                    return
                break

        received = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestTooLargeError(self.max_bytes)
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except RequestTooLargeError:
            if response_started:
                raise
            await self._reject(send)


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logging once (no-op if handlers already exist)."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def _error(detail: str, code: str, **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"detail": detail, "code": code}
    body.update(extra)
    return body


def _derive_code(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).name
    except ValueError:
        return f"HTTP_{status_code}"


async def app_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Render ``AppException`` as ``{"detail", "code"}``."""
    assert isinstance(exc, AppException)  # noqa: S101 - narrowing for type checkers
    return JSONResponse(status_code=exc.status_code, content=_error(exc.message, exc.code))


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Normalize ``HTTPException`` to ``{"detail", "code"}``, preserving headers."""
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    code = getattr(exc, "code", None) or _derive_code(exc.status_code)
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error(detail, code),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Render request validation errors as 422 ``VALIDATION_ERROR`` with a readable detail."""
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    errors = exc.errors()
    detail = "Invalid request"
    if errors:
        first = errors[0]
        loc = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path"))
        msg = str(first.get("msg", "Invalid value"))
        detail = f"{loc}: {msg}" if loc else msg
    safe_errors = [
        {"loc": list(e.get("loc", ())), "msg": str(e.get("msg", "")), "type": e.get("type", "")}
        for e in errors
    ]
    return JSONResponse(
        status_code=422,
        content=_error(detail, "VALIDATION_ERROR", errors=safe_errors),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log any unhandled exception and return a generic 500 without leaking internals."""
    logger.error(
        "Unhandled error on %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(status_code=500, content=_error("Internal server error", "INTERNAL_ERROR"))


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    """Render slowapi ``RateLimitExceeded`` as 429 ``RATE_LIMITED``."""
    detail = getattr(exc, "detail", None) or "Rate limit exceeded"
    return JSONResponse(
        status_code=429,
        content=_error(f"Too many requests: {detail}", "RATE_LIMITED"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup/shutdown hooks: warn on insecure config and ensure UPLOAD_DIR exists."""
    warn_if_insecure()
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    logger.info("Assignment Roaster API started")
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    configure_logging()
    application = FastAPI(
        title="Assignment Roaster API",
        version="1.0.0",
        lifespan=lifespan,
    )

    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
    application.add_exception_handler(AppException, app_exception_handler)
    application.add_exception_handler(StarletteHTTPException, http_exception_handler)
    application.add_exception_handler(RequestValidationError, validation_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Added last => outermost user middleware: oversized bodies are refused before anything else.
    application.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.MAX_REQUEST_BYTES)

    for module in (auth, submissions, roasts, share_links, public, admin):
        application.include_router(module.router, prefix=API_PREFIX)

    @application.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        """Liveness probe."""
        return {"status": "healthy"}

    return application


app = create_app()
