"""Authentication business logic: registration, login, token rotation, profile, Google OAuth."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import google as google_oauth
from app.auth.security import (
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_user_id_from_payload,
    hash_password,
    hash_token,
    refresh_token_expires_at,
    verify_password,
)
from app.exceptions import ConflictError, ForbiddenError, UnauthorizedError
from app.models.user import RefreshToken, User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserUpdate

logger = logging.getLogger(__name__)

GOOGLE_PROVIDER = "google"
_INVALID_CREDENTIALS_MSG = "Incorrect email or password"
_INVALID_REFRESH_MSG = "Invalid or expired refresh token"

#: Lazily-computed bcrypt hash used to equalize login timing for unknown emails.
_dummy_hash: str | None = None


def _get_dummy_hash() -> str:
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password("timing-equalization-dummy-password")
    return _dummy_hash


def _as_aware(value: datetime) -> datetime:
    """Treat naive datetimes (e.g. from SQLite) as UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def get_user_by_email(db: Session, email: str) -> User | None:
    """Return the user with this (case-insensitive) email, or None."""
    return db.scalars(select(User).where(User.email == email.strip().lower())).first()


def register_user(db: Session, data: RegisterRequest) -> User:
    """
    Create a new email/password user.

    Args:
        db: Database session
        data: Validated registration payload (email already lowercased)

    Returns:
        The created User.

    Raises:
        ConflictError: 409 ``EMAIL_EXISTS`` if the email is already registered.
    """
    if get_user_by_email(db, data.email) is not None:
        raise ConflictError("An account with this email already exists", "EMAIL_EXISTS")
    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("An account with this email already exists", "EMAIL_EXISTS") from exc
    db.refresh(user)
    logger.info("Registered user id=%s", user.id)
    return user


def issue_tokens(db: Session, user: User) -> TokenResponse:
    """
    Create an access/refresh token pair and persist the refresh token's hash.

    Args:
        db: Database session
        user: The user the tokens are issued for

    Returns:
        TokenResponse with both tokens.
    """
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_token_expires_at(),
        )
    )
    db.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


def prune_expired_tokens(db: Session, user_id: int) -> None:
    """
    Delete ``user_id``'s refresh-token rows that have expired (caller commits).

    Revoked-but-unexpired rows are kept on purpose: they are what refresh-token reuse
    detection matches against.
    """
    db.execute(
        delete(RefreshToken)
        .where(
            RefreshToken.user_id == user_id, RefreshToken.expires_at < datetime.now(timezone.utc)
        )
        .execution_options(synchronize_session=False)
    )


def authenticate_user(db: Session, email: str, password: str) -> User:
    """
    Verify email/password credentials.

    Unknown email, wrong password and OAuth-only accounts all produce the same error.

    Raises:
        UnauthorizedError: 401 ``INVALID_CREDENTIALS``.
        ForbiddenError: 403 ``USER_INACTIVE`` if the credentials are valid but the account is
            deactivated.
    """
    user = get_user_by_email(db, email)
    if user is None or not user.hashed_password:
        verify_password(password, _get_dummy_hash())  # equalize response timing
        raise UnauthorizedError(_INVALID_CREDENTIALS_MSG, "INVALID_CREDENTIALS")
    if not verify_password(password, user.hashed_password):
        raise UnauthorizedError(_INVALID_CREDENTIALS_MSG, "INVALID_CREDENTIALS")
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated", "USER_INACTIVE")
    return user


def login(db: Session, data: LoginRequest) -> TokenResponse:
    """Authenticate with email/password and issue a new token pair."""
    user = authenticate_user(db, data.email, data.password)
    logger.info("User id=%s logged in", user.id)
    prune_expired_tokens(db, user.id)
    return issue_tokens(db, user)


def revoke_all_user_tokens(db: Session, user_id: int) -> None:
    """Revoke every refresh token belonging to ``user_id`` (caller commits)."""
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )


def refresh_tokens(db: Session, refresh_token: str) -> TokenResponse:
    """
    Rotate a refresh token: revoke the presented one and issue a fresh pair.

    Presenting an already-revoked token is treated as token theft: every refresh token of that
    user is revoked (reuse detection).

    Raises:
        UnauthorizedError: 401 ``INVALID_REFRESH_TOKEN`` if the token is malformed, unknown,
            revoked, expired, or its user is missing/inactive.
    """
    invalid = UnauthorizedError(_INVALID_REFRESH_MSG, "INVALID_REFRESH_TOKEN")
    payload = decode_token(refresh_token, REFRESH_TOKEN_TYPE)
    if payload is None:
        raise invalid
    user_id = get_user_id_from_payload(payload)
    record = db.scalars(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    ).first()
    if record is None or user_id is None or record.user_id != user_id:
        raise invalid
    if record.revoked:
        logger.warning("Refresh token reuse detected for user id=%s; revoking all", record.user_id)
        revoke_all_user_tokens(db, record.user_id)
        db.commit()
        raise invalid
    if _as_aware(record.expires_at) <= datetime.now(timezone.utc):
        raise invalid
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise invalid
    record.revoked = True
    prune_expired_tokens(db, user.id)
    return issue_tokens(db, user)  # commits the revocation together with the new token


def logout(db: Session, refresh_token: str) -> None:
    """Revoke the given refresh token if it exists. Idempotent; never raises for bad tokens."""
    record = db.scalars(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    ).first()
    if record is not None and not record.revoked:
        record.revoked = True
        db.commit()


def update_profile(db: Session, user: User, data: UserUpdate) -> User:
    """
    Apply a partial profile update (only fields present in the request body).

    Args:
        db: Database session
        user: The current user
        data: Validated update payload

    Returns:
        The updated User.
    """
    fields = data.model_fields_set
    if "full_name" in fields:
        user.full_name = data.full_name
    if "default_intensity" in fields and data.default_intensity is not None:
        user.default_intensity = data.default_intensity
    db.commit()
    db.refresh(user)
    return user


def get_or_create_google_user(db: Session, info: google_oauth.GoogleUserInfo) -> User:
    """
    Resolve the local user for a verified Google identity.

    Lookup order: by ``google_id``; else link to an existing account with the same email;
    else create a new verified user.

    Raises:
        GoogleOAuthError: If the email is unverified or already linked to another Google account.
        ForbiddenError: 403 ``USER_INACTIVE`` if the resolved user is deactivated.
    """
    if not info.email_verified:
        raise google_oauth.GoogleOAuthError("Google email is not verified")

    user = db.scalars(select(User).where(User.google_id == info.sub)).first()
    if user is None:
        user = get_user_by_email(db, info.email)
        if user is not None:
            if user.google_id and user.google_id != info.sub:
                raise google_oauth.GoogleOAuthError("Email is linked to another Google account")
            if not user.is_verified:
                # Ownership of this email was never proven, so whoever registered it may not be
                # the Google account owner (account pre-claiming). Google has now proven
                # ownership: drop the unproven password and kill any sessions it created.
                user.hashed_password = None
                revoke_all_user_tokens(db, user.id)
                logger.info("Cleared unverified credentials of user id=%s on Google link", user.id)
            user.google_id = info.sub
            user.oauth_provider = GOOGLE_PROVIDER
            user.is_verified = True
            if not user.avatar_url and info.picture:
                user.avatar_url = info.picture[:500]
            if not user.full_name and info.name:
                user.full_name = info.name.strip()[:100]
            logger.info("Linked Google account to user id=%s", user.id)
        else:
            user = User(
                email=info.email,
                hashed_password=None,
                full_name=info.name.strip()[:100] if info.name else None,
                oauth_provider=GOOGLE_PROVIDER,
                google_id=info.sub,
                avatar_url=info.picture[:500] if info.picture else None,
                is_verified=True,
            )
            db.add(user)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise google_oauth.GoogleOAuthError("Could not create or link Google user") from exc
        db.refresh(user)

    if not user.is_active:
        raise ForbiddenError("This account has been deactivated", "USER_INACTIVE")
    return user


async def complete_google_login(db: Session, code: str) -> TokenResponse:
    """
    Finish the Google OAuth flow: exchange ``code``, fetch userinfo, resolve user, issue tokens.

    Raises:
        GoogleOAuthError: On any Google-side failure or unusable identity.
        ForbiddenError: 403 ``USER_INACTIVE`` if the user is deactivated.
    """
    access_token = await google_oauth.exchange_code_for_token(code)
    info = await google_oauth.fetch_user_info(access_token)
    user = get_or_create_google_user(db, info)
    logger.info("User id=%s logged in via Google", user.id)
    return issue_tokens(db, user)
