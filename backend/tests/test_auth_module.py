"""Smoke tests for the authentication module (``/api/v1/auth/*``).

Self-contained: uses its own in-memory SQLite engine and overrides ``get_db``. Google HTTP calls
are replaced via monkeypatch; nothing touches the network.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_auth_module.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-auth-module-tests-0123456789")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from collections.abc import Generator  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from urllib.parse import parse_qs, urlparse  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402, F401 - registers all tables
from app.auth import google as google_oauth  # noqa: E402
from app.auth.security import hash_password, hash_token  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import RefreshToken, User  # noqa: E402
from app.rate_limit import limiter  # noqa: E402

API = "/api/v1/auth"
PASSWORD = "correct-horse-battery"


@pytest.fixture()
def auth_db() -> Generator[Session, None, None]:
    """Fresh in-memory database per test, wired into the app via dependency override."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _override() -> Generator[Session, None, None]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    previous_enabled = limiter.enabled
    limiter.enabled = False
    session = factory()
    try:
        yield session
    finally:
        session.close()
        limiter.enabled = previous_enabled
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@pytest.fixture()
def client(auth_db: Session) -> TestClient:
    """HTTP client bound to the overridden database (redirects not followed)."""
    return TestClient(app, follow_redirects=False)


@pytest.fixture()
def google_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pretend Google OAuth credentials are configured."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "client-secret")


def _register(client: TestClient, email: str = "Ada@Example.com", **extra: str) -> dict:
    body = {"email": email, "password": PASSWORD, "full_name": "Ada Lovelace", **extra}
    resp = client.post(f"{API}/register", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _login(client: TestClient, email: str = "ada@example.com") -> dict:
    resp = client.post(f"{API}/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()


# --------------------------------------------------------------------------- register / login


def test_register_creates_user_with_lowercased_email(client: TestClient) -> None:
    data = _register(client)
    assert data["email"] == "ada@example.com"
    assert data["full_name"] == "Ada Lovelace"
    assert data["default_intensity"] == "medium"
    assert data["is_admin"] is False and data["is_verified"] is False
    assert "hashed_password" not in data
    assert set(data) == {
        "id",
        "email",
        "full_name",
        "is_active",
        "is_verified",
        "is_admin",
        "oauth_provider",
        "avatar_url",
        "default_intensity",
        "created_at",
    }


def test_register_duplicate_email_conflict(client: TestClient) -> None:
    _register(client)
    resp = client.post(f"{API}/register", json={"email": "ADA@example.com", "password": PASSWORD})
    assert resp.status_code == 409
    assert resp.json()["code"] == "EMAIL_EXISTS"


@pytest.mark.parametrize(
    "password",
    ["short", "x" * 129, "é" * 40],  # too short, too long, > 72 UTF-8 bytes
)
def test_register_rejects_bad_passwords(client: TestClient, password: str) -> None:
    resp = client.post(f"{API}/register", json={"email": "a@example.com", "password": password})
    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


def test_login_success_stores_refresh_hash(client: TestClient, auth_db: Session) -> None:
    _register(client)
    tokens = _login(client, "ADA@example.com")
    assert tokens["token_type"] == "bearer"
    record = auth_db.scalars(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(tokens["refresh_token"]))
    ).first()
    assert record is not None and record.revoked is False


def test_login_errors_share_message(client: TestClient, auth_db: Session) -> None:
    _register(client)
    auth_db.add(User(email="oauth@example.com", google_id="g-1", oauth_provider="google"))
    auth_db.commit()
    responses = [
        client.post(f"{API}/login", json={"email": "ada@example.com", "password": "wrong-pass"}),
        client.post(f"{API}/login", json={"email": "nobody@example.com", "password": PASSWORD}),
        client.post(f"{API}/login", json={"email": "oauth@example.com", "password": PASSWORD}),
    ]
    for resp in responses:
        assert resp.status_code == 401
        assert resp.json()["code"] == "INVALID_CREDENTIALS"
    assert len({r.json()["detail"] for r in responses}) == 1


def test_login_inactive_user_forbidden(client: TestClient, auth_db: Session) -> None:
    auth_db.add(
        User(email="off@example.com", hashed_password=hash_password(PASSWORD), is_active=False)
    )
    auth_db.commit()
    resp = client.post(f"{API}/login", json={"email": "off@example.com", "password": PASSWORD})
    assert resp.status_code == 403
    assert resp.json()["code"] == "USER_INACTIVE"


# --------------------------------------------------------------------------- refresh / logout


def test_refresh_rotates_tokens(client: TestClient) -> None:
    _register(client)
    first = _login(client)
    resp = client.post(f"{API}/refresh", json={"refresh_token": first["refresh_token"]})
    assert resp.status_code == 200, resp.text
    second = resp.json()
    assert second["refresh_token"] != first["refresh_token"]
    me = client.get(f"{API}/me", headers={"Authorization": f"Bearer {second['access_token']}"})
    assert me.status_code == 200


def test_refresh_reuse_revokes_all_tokens(client: TestClient, auth_db: Session) -> None:
    _register(client)
    first = _login(client)
    second = client.post(f"{API}/refresh", json={"refresh_token": first["refresh_token"]}).json()
    reuse = client.post(f"{API}/refresh", json={"refresh_token": first["refresh_token"]})
    assert reuse.status_code == 401
    assert reuse.json()["code"] == "INVALID_REFRESH_TOKEN"
    # The legitimately rotated token is now revoked too.
    after = client.post(f"{API}/refresh", json={"refresh_token": second["refresh_token"]})
    assert after.status_code == 401
    assert all(t.revoked for t in auth_db.scalars(select(RefreshToken)).all())


def test_refresh_rejects_garbage_access_and_expired(client: TestClient, auth_db: Session) -> None:
    _register(client)
    tokens = _login(client)
    for bad in ("not-a-jwt", tokens["access_token"]):
        resp = client.post(f"{API}/refresh", json={"refresh_token": bad})
        assert resp.status_code == 401
        assert resp.json()["code"] == "INVALID_REFRESH_TOKEN"
    record = auth_db.scalars(select(RefreshToken)).one()
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    auth_db.commit()
    resp = client.post(f"{API}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 401


def test_logout_revokes_and_is_idempotent(client: TestClient) -> None:
    _register(client)
    tokens = _login(client)
    for _ in range(2):
        resp = client.post(f"{API}/logout", json={"refresh_token": tokens["refresh_token"]})
        assert resp.status_code == 204
        assert resp.content == b""
    assert client.post(f"{API}/logout", json={"refresh_token": "unknown"}).status_code == 204
    resp = client.post(f"{API}/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 401


# --------------------------------------------------------------------------- profile


def test_me_requires_auth(client: TestClient) -> None:
    resp = client.get(f"{API}/me")
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_TOKEN"


def test_update_me(client: TestClient) -> None:
    _register(client)
    headers = {"Authorization": f"Bearer {_login(client)['access_token']}"}
    resp = client.put(f"{API}/me", json={"default_intensity": "savage"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_intensity"] == "savage"
    assert resp.json()["full_name"] == "Ada Lovelace"  # untouched
    resp = client.put(f"{API}/me", json={"full_name": "  Grace  "}, headers=headers)
    assert resp.json()["full_name"] == "Grace"
    assert resp.json()["default_intensity"] == "savage"
    bad = client.put(f"{API}/me", json={"default_intensity": "nuclear"}, headers=headers)
    assert bad.status_code == 422


# --------------------------------------------------------------------------- Google OAuth


def test_google_not_configured(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    resp = client.get(f"{API}/google")
    assert resp.status_code == 503
    assert resp.json()["code"] == "OAUTH_NOT_CONFIGURED"


def test_google_redirect_sets_state_cookie(client: TestClient, google_configured: None) -> None:
    resp = client.get(f"{API}/google")
    assert resp.status_code == 307
    location = urlparse(resp.headers["location"])
    params = parse_qs(location.query)
    assert location.netloc == "accounts.google.com"
    assert params["scope"] == ["openid email profile"]
    assert params["redirect_uri"] == [settings.google_redirect_uri]
    assert params["prompt"] == ["select_account"]
    set_cookie = resp.headers["set-cookie"].lower()
    assert "oauth_state=" in set_cookie and "httponly" in set_cookie
    assert "samesite=lax" in set_cookie and "max-age=600" in set_cookie
    assert google_oauth.verify_state(resp.cookies.get("oauth_state"), params["state"][0])


def test_google_callback_state_mismatch(client: TestClient, google_configured: None) -> None:
    client.get(f"{API}/google")
    resp = client.get(f"{API}/google/callback", params={"code": "c", "state": "forged"})
    assert resp.status_code == 307
    assert resp.headers["location"] == f"{settings.FRONTEND_URL}/login?error=oauth_state"


def _start_flow(client: TestClient) -> str:
    resp = client.get(f"{API}/google")
    return parse_qs(urlparse(resp.headers["location"]).query)["state"][0]


def _mock_google(monkeypatch: pytest.MonkeyPatch, info: google_oauth.GoogleUserInfo) -> None:
    async def fake_exchange(code: str) -> str:
        assert code == "auth-code"
        return "google-access-token"

    async def fake_userinfo(access_token: str) -> google_oauth.GoogleUserInfo:
        assert access_token == "google-access-token"
        return info

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", fake_exchange)
    monkeypatch.setattr(google_oauth, "fetch_user_info", fake_userinfo)


def test_google_callback_creates_user_and_redirects_with_tokens(
    client: TestClient,
    auth_db: Session,
    google_configured: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_google(
        monkeypatch,
        google_oauth.GoogleUserInfo(
            sub="google-123", email="grace@example.com", email_verified=True, name="Grace Hopper"
        ),
    )
    state = _start_flow(client)
    resp = client.get(f"{API}/google/callback", params={"code": "auth-code", "state": state})
    assert resp.status_code == 307
    location = urlparse(resp.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == (
        f"{settings.FRONTEND_URL}/auth/callback"
    )
    fragment = parse_qs(location.fragment)
    assert fragment["access_token"] and fragment["refresh_token"]
    assert (
        'oauth_state=""' in resp.headers["set-cookie"]
        or "max-age=0" in resp.headers["set-cookie"].lower()
    )

    user = auth_db.scalars(select(User).where(User.email == "grace@example.com")).one()
    assert user.google_id == "google-123" and user.is_verified and user.oauth_provider == "google"
    me = client.get(f"{API}/me", headers={"Authorization": f"Bearer {fragment['access_token'][0]}"})
    assert me.json()["email"] == "grace@example.com"


def test_google_callback_links_existing_email_user(
    client: TestClient,
    auth_db: Session,
    google_configured: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _register(client)
    _mock_google(
        monkeypatch,
        google_oauth.GoogleUserInfo(sub="g-ada", email="ada@example.com", email_verified=True),
    )
    state = _start_flow(client)
    resp = client.get(f"{API}/google/callback", params={"code": "auth-code", "state": state})
    assert "/auth/callback#" in resp.headers["location"]
    users = auth_db.scalars(select(User)).all()
    assert len(users) == 1
    assert users[0].google_id == "g-ada" and users[0].is_verified is True


def test_google_callback_unverified_email_fails(
    client: TestClient, google_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_google(
        monkeypatch,
        google_oauth.GoogleUserInfo(sub="g-x", email="x@example.com", email_verified=False),
    )
    state = _start_flow(client)
    resp = client.get(f"{API}/google/callback", params={"code": "auth-code", "state": state})
    assert resp.headers["location"] == f"{settings.FRONTEND_URL}/login?error=oauth_failed"


def test_google_callback_inactive_user(
    client: TestClient,
    auth_db: Session,
    google_configured: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    auth_db.add(User(email="off@example.com", google_id="g-off", is_active=False))
    auth_db.commit()
    _mock_google(
        monkeypatch,
        google_oauth.GoogleUserInfo(sub="g-off", email="off@example.com", email_verified=True),
    )
    state = _start_flow(client)
    resp = client.get(f"{API}/google/callback", params={"code": "auth-code", "state": state})
    assert resp.headers["location"] == f"{settings.FRONTEND_URL}/login?error=inactive"


def test_google_exchange_failure_redirects(
    client: TestClient, google_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing_exchange(code: str) -> str:
        raise google_oauth.GoogleOAuthError("boom")

    monkeypatch.setattr(google_oauth, "exchange_code_for_token", failing_exchange)
    state = _start_flow(client)
    resp = client.get(f"{API}/google/callback", params={"code": "auth-code", "state": state})
    assert resp.headers["location"] == f"{settings.FRONTEND_URL}/login?error=oauth_failed"


def test_verify_state_rejects_tampered_cookie() -> None:
    signed = google_oauth.sign_state("abc")
    assert google_oauth.verify_state(signed, "abc")
    assert not google_oauth.verify_state(signed + "x", "abc")
    assert not google_oauth.verify_state(signed, "abd")
    assert not google_oauth.verify_state(None, "abc")
