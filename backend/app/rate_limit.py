"""Shared slowapi limiter. Use ``@limiter.limit("5/minute")`` on endpoints that take ``request``."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(key_func=get_remote_address, enabled=settings.RATE_LIMIT_ENABLED)
