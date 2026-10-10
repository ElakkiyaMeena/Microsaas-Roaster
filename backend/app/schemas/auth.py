"""Request/response schemas for the authentication module."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.auth.security import BCRYPT_MAX_BYTES

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
#: Generous upper bound for an encoded JWT; protects against oversized inputs.
TOKEN_MAX_LENGTH = 4096


def _lowercase_email(value: str) -> str:
    return value.strip().lower()


class RegisterRequest(BaseModel):
    """Body of ``POST /auth/register``."""

    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    full_name: str | None = Field(default=None, max_length=100)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        """Store and compare emails in lowercase."""
        return _lowercase_email(value)

    @field_validator("password")
    @classmethod
    def _password_fits_bcrypt(cls, value: str) -> str:
        """Reject passwords bcrypt would silently truncate (> 72 UTF-8 bytes)."""
        if len(value.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(
                f"Password must be at most {BCRYPT_MAX_BYTES} bytes when UTF-8 encoded"
            )
        return value

    @field_validator("full_name")
    @classmethod
    def _strip_full_name(cls, value: str | None) -> str | None:
        """Trim whitespace and normalize blank names to ``None``."""
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class LoginRequest(BaseModel):
    """JSON body of ``POST /auth/login``."""

    email: EmailStr
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        """Compare emails in lowercase."""
        return _lowercase_email(value)


class RefreshRequest(BaseModel):
    """Body of ``POST /auth/refresh``."""

    refresh_token: str = Field(min_length=1, max_length=TOKEN_MAX_LENGTH)


class LogoutRequest(RefreshRequest):
    """Body of ``POST /auth/logout``."""


class TokenResponse(BaseModel):
    """Access/refresh token pair."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
