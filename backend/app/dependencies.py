"""Convenience re-exports of common FastAPI dependencies."""

from app.auth.dependencies import get_current_admin, get_current_user
from app.database import get_db

__all__ = ["get_current_admin", "get_current_user", "get_db"]
