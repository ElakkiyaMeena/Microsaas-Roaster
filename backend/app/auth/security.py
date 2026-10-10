"""Password hashing (bcrypt) and JWT creation/validation (PyJWT)."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.config import settings

logger = logging.getLogger(__name__)

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
#: bcrypt only uses the first 72 bytes; schemas must reject longer passwords.
BCRYPT_MAX_BYTES = 72


def hash_password(password: str) -> str:
    """
    Hash a password with bcrypt.

    Args:
        password: Plain-text password (≤ 72 UTF-8 bytes; enforced by request schemas).

    Returns:
        bcrypt hash as a UTF-8 string.

    Raises:
        ValueError: If the password exceeds 72 bytes.
    """
    raw = password.encode("utf-8")
    if len(raw) > BCRYPT_MAX_BYTES:
        raise ValueError("Password must be at most 72 bytes")
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str | None) -> bool:
    """Return True if ``password`` matches ``hashed_password``; False for None/invalid hashes."""
    if not hashed_password:
        return False
    raw = password.encode("utf-8")
    if len(raw) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(raw, hashed_password.encode("utf-8"))
    except ValueError:
        return False


def _create_token(user_id: int, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: int) -> str:
    """Create a short-lived access JWT (``ACCESS_TOKEN_EXPIRE_MINUTES``)."""
    return _create_token(
        user_id, ACCESS_TOKEN_TYPE, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )


def create_refresh_token(user_id: int) -> str:
    """Create a unique refresh JWT (``REFRESH_TOKEN_EXPIRE_DAYS``); persist only ``hash_token``."""
    return _create_token(
        user_id, REFRESH_TOKEN_TYPE, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )


def refresh_token_expires_at() -> datetime:
    """Timezone-aware expiry timestamp for a refresh token issued now."""
    return datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def decode_token(token: str, expected_type: str) -> dict[str, Any] | None:
    """
    Decode and validate a JWT.

    Args:
        token: Encoded JWT.
        expected_type: ``"access"`` or ``"refresh"``.

    Returns:
        The payload dict, or None if invalid, expired, of the wrong type, or lacking ``sub``.
    """
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type or not payload.get("sub"):
        return None
    return payload


def get_user_id_from_payload(payload: dict[str, Any]) -> int | None:
    """Extract the integer user id from a decoded token payload."""
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None


def hash_token(token: str) -> str:
    """SHA-256 hex digest of a token (64 chars), used to store refresh tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
