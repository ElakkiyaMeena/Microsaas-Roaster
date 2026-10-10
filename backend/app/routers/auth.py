"""Authentication endpoints: register, login, refresh, logout, profile, Google OAuth."""

# NOTE: no ``from __future__ import annotations`` here — slowapi's decorator wraps endpoints and
# FastAPI must be able to resolve the real annotation objects.

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import google as google_oauth
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.exceptions import ForbiddenError, ServiceUnavailableError
from app.models.user import User
from app.rate_limit import limiter
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.user import UserResponse, UserUpdate
from app.services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Endpoints doing only synchronous DB work are plain ``def`` so FastAPI runs them in its
# threadpool instead of blocking the event loop (CLAUDE.md shows ``async``; that is reserved for
# endpoints that actually await I/O, such as the Google OAuth calls below).


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(
    request: Request, data: RegisterRequest, db: Session = Depends(get_db)
) -> UserResponse:
    """Create an email/password account. 409 ``EMAIL_EXISTS`` if the email is taken."""
    user = auth_service.register_user(db, data)
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Log in with JSON credentials. 401 ``INVALID_CREDENTIALS``; 403 ``USER_INACTIVE``."""
    return auth_service.login(db, data)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, data: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Rotate a refresh token. 401 ``INVALID_REFRESH_TOKEN`` if invalid/revoked/expired."""
    return auth_service.refresh_tokens(db, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(data: LogoutRequest, db: Session = Depends(get_db)) -> Response:
    """Revoke a refresh token. Idempotent; always 204."""
    auth_service.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
def read_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    """Update ``full_name`` and/or ``default_intensity`` of the authenticated user."""
    user = auth_service.update_profile(db, current_user, data)
    return UserResponse.model_validate(user)


def _frontend_redirect(path: str, *, fragment: str | None = None, error: str | None = None) -> str:
    base = f"{settings.FRONTEND_URL.rstrip('/')}{path}"
    if error is not None:
        base = f"{base}?{urlencode({'error': error})}"
    if fragment is not None:
        base = f"{base}#{fragment}"
    return base


def _redirect_clearing_state(url: str) -> RedirectResponse:
    response = RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    response.delete_cookie(
        google_oauth.STATE_COOKIE_NAME,
        path=google_oauth.STATE_COOKIE_PATH,
        secure=google_oauth.cookie_secure(),
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/google", status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def google_login() -> RedirectResponse:
    """Start Google OAuth: set a signed state cookie and redirect to Google's consent screen."""
    if not google_oauth.is_configured():
        raise ServiceUnavailableError("Google sign-in is not configured", "OAUTH_NOT_CONFIGURED")
    state = google_oauth.generate_state()
    response = RedirectResponse(
        google_oauth.build_authorization_url(state),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
    response.set_cookie(
        google_oauth.STATE_COOKIE_NAME,
        google_oauth.sign_state(state),
        max_age=google_oauth.STATE_COOKIE_MAX_AGE,
        path=google_oauth.STATE_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=google_oauth.cookie_secure(),
    )
    return response


@router.get("/google/callback", status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def google_callback(
    request: Request,
    code: str | None = Query(default=None, max_length=2048),
    state: str | None = Query(default=None, max_length=512),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Finish Google OAuth and redirect to the frontend with tokens in the URL fragment."""
    cookie_value = request.cookies.get(google_oauth.STATE_COOKIE_NAME)
    if not google_oauth.verify_state(cookie_value, state):
        logger.warning("Google OAuth callback with missing or mismatched state")
        return _redirect_clearing_state(_frontend_redirect("/login", error="oauth_state"))

    if not code or not google_oauth.is_configured():
        logger.warning("Google OAuth callback without code or with OAuth unconfigured")
        return _redirect_clearing_state(_frontend_redirect("/login", error="oauth_failed"))

    try:
        tokens = await auth_service.complete_google_login(db, code)
    except google_oauth.GoogleOAuthError as exc:
        logger.warning("Google OAuth failed: %s", exc)
        return _redirect_clearing_state(_frontend_redirect("/login", error="oauth_failed"))
    except ForbiddenError:
        return _redirect_clearing_state(_frontend_redirect("/login", error="inactive"))

    fragment = urlencode(
        {"access_token": tokens.access_token, "refresh_token": tokens.refresh_token}
    )
    return _redirect_clearing_state(_frontend_redirect("/auth/callback", fragment=fragment))
