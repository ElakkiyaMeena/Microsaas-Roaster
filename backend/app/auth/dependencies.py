"""FastAPI dependencies for resolving the authenticated user."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import ACCESS_TOKEN_TYPE, decode_token, get_user_id_from_payload
from app.database import get_db
from app.models.user import User

oauth2_scheme = HTTPBearer(auto_error=False)


def _unauthorized(message: str = "Could not validate credentials") -> HTTPException:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )
    exc.code = "INVALID_TOKEN"  # type: ignore[attr-defined]
    return exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve the current user from a ``Bearer`` access token.

    Raises:
        HTTPException: 401 ``INVALID_TOKEN`` if the token is missing, invalid, not an access
            token, or the user does not exist or is inactive.
    """
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Not authenticated")
    payload = decode_token(credentials.credentials, ACCESS_TOKEN_TYPE)
    if payload is None:
        raise _unauthorized()
    user_id = get_user_id_from_payload(payload)
    if user_id is None:
        raise _unauthorized()
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized()
    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require an admin user; raises 403 ``FORBIDDEN`` otherwise."""
    if not current_user.is_admin:
        exc = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        exc.code = "FORBIDDEN"  # type: ignore[attr-defined]
        raise exc
    return current_user
