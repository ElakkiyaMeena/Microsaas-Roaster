"""Google OAuth 2.0 helpers: authorization URL, signed state cookie, code exchange, userinfo."""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.config import settings

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - public endpoint URL
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPE = "openid email profile"
HTTP_TIMEOUT_SECONDS = 10.0

STATE_COOKIE_NAME = "oauth_state"
STATE_COOKIE_MAX_AGE = 600
STATE_COOKIE_PATH = "/api/v1/auth/google"
_STATE_SALT = "oauth-state"


class GoogleOAuthError(Exception):
    """Raised when the Google code exchange or userinfo request fails or is unusable."""


@dataclass(frozen=True)
class GoogleUserInfo:
    """The subset of Google's OIDC userinfo we rely on."""

    sub: str
    email: str
    email_verified: bool
    name: str | None = None
    picture: str | None = None


def is_configured() -> bool:
    """True when both ``GOOGLE_CLIENT_ID`` and ``GOOGLE_CLIENT_SECRET`` are set."""
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def generate_state() -> str:
    """Generate a random, URL-safe CSRF state value."""
    return secrets.token_urlsafe(32)


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.SECRET_KEY, salt=_STATE_SALT)


def sign_state(state: str) -> str:
    """Sign ``state`` for storage in the ``oauth_state`` cookie."""
    return _serializer().dumps(state)


def verify_state(cookie_value: str | None, state: str | None) -> bool:
    """
    Check that the signed cookie is valid, not older than 10 minutes, and matches ``state``.

    Args:
        cookie_value: Raw ``oauth_state`` cookie value (signed).
        state: The ``state`` query parameter returned by Google.

    Returns:
        True only if the signature and age are valid and the values match (constant time).
    """
    if not cookie_value or not state:
        return False
    try:
        expected = _serializer().loads(cookie_value, max_age=STATE_COOKIE_MAX_AGE)
    except BadSignature:  # SignatureExpired is a subclass of BadSignature
        return False
    if not isinstance(expected, str):
        return False
    return secrets.compare_digest(expected.encode("utf-8"), state.encode("utf-8"))


def cookie_secure() -> bool:
    """Whether the state cookie should carry the ``Secure`` flag."""
    return settings.BACKEND_URL.lower().startswith("https")


def build_authorization_url(state: str) -> str:
    """Build the Google consent-screen URL for the authorization-code flow."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPE,
        "state": state,
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    """
    Exchange an authorization code for a Google access token.

    Raises:
        GoogleOAuthError: On network errors, non-2xx responses, or a missing access token.
    """
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(GOOGLE_TOKEN_URL, data=data)
    except httpx.HTTPError as exc:
        raise GoogleOAuthError(f"Token exchange request failed: {type(exc).__name__}") from exc
    if response.status_code != 200:
        raise GoogleOAuthError(f"Token exchange returned HTTP {response.status_code}")
    try:
        payload: Any = response.json()
    except ValueError as exc:
        raise GoogleOAuthError("Token exchange returned invalid JSON") from exc
    access_token = payload.get("access_token") if isinstance(payload, dict) else None
    if not isinstance(access_token, str) or not access_token:
        raise GoogleOAuthError("Token exchange response has no access_token")
    return access_token


async def fetch_user_info(access_token: str) -> GoogleUserInfo:
    """
    Fetch the OIDC userinfo for ``access_token``.

    Raises:
        GoogleOAuthError: On network errors, non-2xx responses, or missing ``sub``/``email``.
    """
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
    except httpx.HTTPError as exc:
        raise GoogleOAuthError(f"Userinfo request failed: {type(exc).__name__}") from exc
    if response.status_code != 200:
        raise GoogleOAuthError(f"Userinfo returned HTTP {response.status_code}")
    try:
        payload: Any = response.json()
    except ValueError as exc:
        raise GoogleOAuthError("Userinfo returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise GoogleOAuthError("Userinfo payload is not an object")
    sub = payload.get("sub")
    email = payload.get("email")
    if not isinstance(sub, str) or not sub or not isinstance(email, str) or not email:
        raise GoogleOAuthError("Userinfo payload lacks sub or email")
    verified = payload.get("email_verified")
    name = payload.get("name")
    picture = payload.get("picture")
    return GoogleUserInfo(
        sub=sub,
        email=email.strip().lower(),
        email_verified=verified is True or verified == "true",
        name=name if isinstance(name, str) and name.strip() else None,
        picture=picture if isinstance(picture, str) and picture else None,
    )
