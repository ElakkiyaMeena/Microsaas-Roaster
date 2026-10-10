"""Unit tests for ``app/auth/google.py`` (no network: httpx traffic goes to a MockTransport)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from itsdangerous import URLSafeTimedSerializer

from app.auth import google as google_oauth
from app.config import settings

Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "csecret")
    monkeypatch.setattr(settings, "BACKEND_URL", "https://api.example.com/")


@pytest.fixture()
def mock_http(monkeypatch: pytest.MonkeyPatch) -> Callable[[Handler], list[httpx.Request]]:
    """Route every ``httpx.AsyncClient`` created by the module through ``handler``."""

    def install(handler: Handler) -> list[httpx.Request]:
        seen: list[httpx.Request] = []

        def recording(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return handler(request)

        real_client = httpx.AsyncClient

        def factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
            kwargs["transport"] = httpx.MockTransport(recording)
            return real_client(*args, **kwargs)

        monkeypatch.setattr(google_oauth.httpx, "AsyncClient", factory)
        return seen

    return install


# --------------------------------------------------------------------------- config / URL


def test_is_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "x")
    assert google_oauth.is_configured() is False
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "id")
    assert google_oauth.is_configured() is True


def test_build_authorization_url(configured: None) -> None:
    url = google_oauth.build_authorization_url("the-state")
    parsed = urlparse(url)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == google_oauth.GOOGLE_AUTH_URL
    params = parse_qs(parsed.query)
    assert params["client_id"] == ["cid.apps.googleusercontent.com"]
    assert params["redirect_uri"] == ["https://api.example.com/api/v1/auth/google/callback"]
    assert params["response_type"] == ["code"]
    assert params["scope"] == ["openid email profile"]
    assert params["state"] == ["the-state"]
    assert params["prompt"] == ["select_account"]
    assert "client_secret" not in params


def test_cookie_secure_follows_backend_scheme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "BACKEND_URL", "HTTPS://api.example.com")
    assert google_oauth.cookie_secure() is True
    monkeypatch.setattr(settings, "BACKEND_URL", "http://localhost:8000")
    assert google_oauth.cookie_secure() is False


def test_generate_state_is_random_and_long() -> None:
    states = {google_oauth.generate_state() for _ in range(20)}
    assert len(states) == 20
    assert all(len(s) >= 32 for s in states)


# --------------------------------------------------------------------------- state signing


def test_sign_and_verify_state_roundtrip() -> None:
    state = google_oauth.generate_state()
    signed = google_oauth.sign_state(state)
    assert signed != state
    assert google_oauth.verify_state(signed, state) is True


@pytest.mark.parametrize(
    ("cookie", "state"),
    [(None, "s"), ("", "s"), ("cookie", None), ("cookie", "")],
)
def test_verify_state_missing_values(cookie: str | None, state: str | None) -> None:
    assert google_oauth.verify_state(cookie, state) is False


def test_verify_state_mismatch_and_tampered() -> None:
    signed = google_oauth.sign_state("original")
    assert google_oauth.verify_state(signed, "different") is False
    tampered = signed[:-2] + ("AA" if signed[-2:] != "AA" else "BB")
    assert google_oauth.verify_state(tampered, "original") is False
    assert google_oauth.verify_state("not.a.signed.value", "original") is False


def test_verify_state_wrong_key_or_salt(monkeypatch: pytest.MonkeyPatch) -> None:
    foreign = URLSafeTimedSerializer("another-secret-key-entirely", salt="oauth-state")
    assert google_oauth.verify_state(foreign.dumps("s"), "s") is False
    wrong_salt = URLSafeTimedSerializer(settings.SECRET_KEY, salt="something-else")
    assert google_oauth.verify_state(wrong_salt.dumps("s"), "s") is False


def test_verify_state_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    signed = google_oauth.sign_state("old-state")
    monkeypatch.setattr(google_oauth, "STATE_COOKIE_MAX_AGE", -1)
    assert google_oauth.verify_state(signed, "old-state") is False


def test_verify_state_non_string_payload() -> None:
    serializer = URLSafeTimedSerializer(settings.SECRET_KEY, salt="oauth-state")
    assert google_oauth.verify_state(serializer.dumps({"state": "x"}), "x") is False


# --------------------------------------------------------------------------- token exchange


async def test_exchange_code_success(configured: None, mock_http: Any) -> None:
    seen = mock_http(lambda req: httpx.Response(200, json={"access_token": "ya29.token"}))
    token = await google_oauth.exchange_code_for_token("auth-code")
    assert token == "ya29.token"
    assert len(seen) == 1
    req = seen[0]
    assert req.method == "POST"
    assert str(req.url) == google_oauth.GOOGLE_TOKEN_URL
    form = parse_qs(req.content.decode())
    assert form["code"] == ["auth-code"]
    assert form["grant_type"] == ["authorization_code"]
    assert form["client_secret"] == ["csecret"]
    assert form["redirect_uri"] == [settings.google_redirect_uri]


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(400, json={"error": "invalid_grant"}), "HTTP 400"),
        (httpx.Response(200, content=b"<html>nope</html>"), "invalid JSON"),
        (httpx.Response(200, json={"token_type": "Bearer"}), "no access_token"),
        (httpx.Response(200, json={"access_token": ""}), "no access_token"),
        (httpx.Response(200, json=["not", "a", "dict"]), "no access_token"),
    ],
)
async def test_exchange_code_errors(
    configured: None, mock_http: Any, response: httpx.Response, message: str
) -> None:
    mock_http(lambda req: response)
    with pytest.raises(google_oauth.GoogleOAuthError, match=message):
        await google_oauth.exchange_code_for_token("code")


async def test_exchange_code_network_error(configured: None, mock_http: Any) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    mock_http(boom)
    with pytest.raises(google_oauth.GoogleOAuthError, match="ConnectError"):
        await google_oauth.exchange_code_for_token("code")


# --------------------------------------------------------------------------- userinfo


async def test_fetch_user_info_success(mock_http: Any) -> None:
    seen = mock_http(
        lambda req: httpx.Response(
            200,
            json={
                "sub": "1234",
                "email": "  Grace@Example.COM ",
                "email_verified": True,
                "name": "Grace Hopper",
                "picture": "https://example.com/p.png",
            },
        )
    )
    info = await google_oauth.fetch_user_info("tok")
    assert info == google_oauth.GoogleUserInfo(
        sub="1234",
        email="grace@example.com",
        email_verified=True,
        name="Grace Hopper",
        picture="https://example.com/p.png",
    )
    assert seen[0].headers["Authorization"] == "Bearer tok"
    assert str(seen[0].url) == google_oauth.GOOGLE_USERINFO_URL


async def test_fetch_user_info_normalizes_optional_fields(mock_http: Any) -> None:
    mock_http(
        lambda req: httpx.Response(
            200,
            json={
                "sub": "1",
                "email": "a@b.co",
                "email_verified": "true",
                "name": "   ",
                "picture": "",
            },
        )
    )
    info = await google_oauth.fetch_user_info("tok")
    assert info.email_verified is True
    assert info.name is None
    assert info.picture is None


async def test_fetch_user_info_unverified(mock_http: Any) -> None:
    mock_http(lambda req: httpx.Response(200, json={"sub": "1", "email": "a@b.co"}))
    info = await google_oauth.fetch_user_info("tok")
    assert info.email_verified is False


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(401, json={"error": "invalid_token"}), "HTTP 401"),
        (httpx.Response(200, content=b"not-json"), "invalid JSON"),
        (httpx.Response(200, json=[1, 2]), "not an object"),
        (httpx.Response(200, json={"email": "a@b.co"}), "lacks sub or email"),
        (httpx.Response(200, json={"sub": "1"}), "lacks sub or email"),
        (httpx.Response(200, json={"sub": "", "email": "a@b.co"}), "lacks sub or email"),
        (httpx.Response(200, json={"sub": 5, "email": "a@b.co"}), "lacks sub or email"),
    ],
)
async def test_fetch_user_info_errors(
    mock_http: Any, response: httpx.Response, message: str
) -> None:
    mock_http(lambda req: response)
    with pytest.raises(google_oauth.GoogleOAuthError, match=message):
        await google_oauth.fetch_user_info("tok")


async def test_fetch_user_info_network_error(mock_http: Any) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    mock_http(boom)
    with pytest.raises(google_oauth.GoogleOAuthError, match="ReadTimeout"):
        await google_oauth.fetch_user_info("tok")


# --------------------------------------------------------------------------- full callback


@pytest.fixture()
def configured_http(configured: None, monkeypatch: pytest.MonkeyPatch) -> None:
    """Plain-http backend so the (non-Secure) state cookie round-trips in TestClient."""
    monkeypatch.setattr(settings, "BACKEND_URL", "http://testserver")


def test_callback_end_to_end_with_mock_transport(
    client: Any, configured_http: None, mock_http: Any
) -> None:
    """The real exchange + userinfo code paths run against the mock transport."""

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == google_oauth.GOOGLE_TOKEN_URL:
            return httpx.Response(200, json={"access_token": "ya29.abc"})
        return httpx.Response(
            200, json={"sub": "g-77", "email": "new@example.com", "email_verified": True}
        )

    mock_http(handler)
    start = client.get("/api/v1/auth/google", follow_redirects=False)
    assert start.status_code == 307
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    location = resp.headers["location"]
    assert location.startswith(f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback#")
    assert "access_token=" in location and "refresh_token=" in location


def test_callback_upstream_failure_redirects_with_error(
    client: Any, configured_http: None, mock_http: Any
) -> None:
    mock_http(lambda req: httpx.Response(500))
    start = client.get("/api/v1/auth/google", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    resp = client.get(
        "/api/v1/auth/google/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 307
    assert "error=oauth_failed" in resp.headers["location"]


def test_callback_without_code_redirects_with_error(client: Any, configured_http: None) -> None:
    start = client.get("/api/v1/auth/google", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    resp = client.get(
        "/api/v1/auth/google/callback", params={"state": state}, follow_redirects=False
    )
    assert resp.status_code == 307
    assert "error=oauth_failed" in resp.headers["location"]
