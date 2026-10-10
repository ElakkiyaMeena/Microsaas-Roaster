"""Regression tests for the review fixes (secret checks, quota ledger, body cap, etc.)."""

from __future__ import annotations

import asyncio
import inspect
import io
import json
import logging
import zipfile
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import DEFAULT_PASSWORD, VALID_ROAST_RESULT, FakeOpenAI, bearer
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import main as main_module
from app.auth import google as google_oauth
from app.auth.security import create_refresh_token, hash_token, refresh_token_expires_at
from app.config import Settings, settings, warn_if_insecure
from app.database import _engine_kwargs
from app.exceptions import BadRequestError
from app.main import BodySizeLimitMiddleware
from app.main import app as fastapi_app
from app.models import RefreshToken, Roast, RoastStatus, RoastUsage, Submission, User
from app.models.enums import RoastIntensity, SourceType
from app.schemas.roast import RoastIssue, RoastResult
from app.services import auth_service, roast_service, upload_service

API = "/api/v1"
STRONG_SECRET = "s" * 40


# --------------------------------------------------------------------------- helpers


def _submission(db: Session, owner: User) -> Submission:
    sub = Submission(
        user_id=owner.id,
        title="Calc",
        language="python",
        source_type=SourceType.PASTE,
        code_content="def add(a, b):\n    return a - b\n",
    )
    db.add(sub)
    db.commit()
    return sub


def _response(content: str, finish_reason: str | None = "stop") -> Any:
    return SimpleNamespace(
        model="fake-model-1",
        choices=[
            SimpleNamespace(message=SimpleNamespace(content=content), finish_reason=finish_reason)
        ],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5),
    )


class ScriptedCompletions:
    """Fake ``chat.completions`` returning scripted responses (or raising exceptions)."""

    def __init__(self, outcomes: list[Any], on_call: Callable[[], None] | None = None) -> None:
        self.outcomes = outcomes
        self.calls: list[dict[str, Any]] = []
        self.on_call = on_call

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.on_call is not None:
            self.on_call()
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def _install(monkeypatch: pytest.MonkeyPatch, completions: ScriptedCompletions) -> None:
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test-not-real")
    monkeypatch.setattr(settings, "ROASTS_PER_DAY", 10)
    monkeypatch.setattr(roast_service, "get_openai_client", lambda: client)


# --------------------------------------------------------------------------- 1. SECRET_KEY


@pytest.mark.parametrize(
    "secret",
    ["change-me", "change-me-in-production", "your-secret-key", "short-but-not-placeholder"],
)
def test_production_rejects_weak_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(ENVIRONMENT="production", SECRET_KEY=secret, _env_file=None)


def test_production_accepts_strong_secret() -> None:
    cfg = Settings(ENVIRONMENT="Production", SECRET_KEY=STRONG_SECRET, _env_file=None)
    assert cfg.is_production and not cfg.uses_weak_secret


def test_development_weak_secret_only_warns(caplog: pytest.LogCaptureFixture) -> None:
    cfg = Settings(ENVIRONMENT="development", SECRET_KEY="change-me", _env_file=None)
    assert cfg.uses_default_secret
    with caplog.at_level(logging.WARNING, logger="app.config"):
        warn_if_insecure(cfg)
    assert "SECRET_KEY" in caplog.text


# --------------------------------------------------------------------------- 2. sync endpoints


def test_db_only_endpoints_are_sync() -> None:
    allowed_async = {
        "google_login",
        "google_callback",
        "upload_submission",
        "create_roast",
        "health",
    }
    for route in fastapi_app.routes:
        if isinstance(route, APIRoute):
            endpoint = inspect.unwrap(route.endpoint)
            is_async = inspect.iscoroutinefunction(endpoint)
            assert is_async == (endpoint.__name__ in allowed_async), route.path


def test_postgres_engine_pool_is_bounded() -> None:
    kwargs = _engine_kwargs("postgresql://u:p@db/x")
    assert (kwargs["pool_size"], kwargs["max_overflow"], kwargs["pool_timeout"]) == (10, 20, 10)
    assert "pool_size" not in _engine_kwargs("sqlite://")


async def test_no_transaction_open_during_openai_call(
    db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    sub = _submission(db, user)
    seen: list[bool] = []
    completions = ScriptedCompletions(
        [_response(json.dumps(VALID_ROAST_RESULT))],
        on_call=lambda: seen.append(db.in_transaction()),
    )
    _install(monkeypatch, completions)
    roast = await roast_service.create_roast(db, sub, user)
    assert roast.status == RoastStatus.COMPLETED
    assert seen == [False]


# --------------------------------------------------------------------------- 3. quota ledger


def test_deleting_roasts_does_not_refund_quota(
    client: TestClient, db: Session, user: User, fake_openai: FakeOpenAI
) -> None:
    headers = bearer(user)
    sub = _submission(db, user)
    roast = client.post(f"{API}/submissions/{sub.id}/roasts", json={}, headers=headers).json()
    assert client.delete(f"{API}/roasts/{roast['id']}", headers=headers).status_code == 204
    quota = client.get(f"{API}/roasts/quota", headers=headers).json()
    assert quota["used_today"] == 1
    assert db.scalar(select(RoastUsage.user_id)) == user.id


def test_quota_enforced_after_deletes(
    client: TestClient,
    db: Session,
    user: User,
    fake_openai: FakeOpenAI,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ROASTS_PER_DAY", 1)
    headers = bearer(user)
    sub = _submission(db, user)
    first = client.post(f"{API}/submissions/{sub.id}/roasts", json={}, headers=headers).json()
    client.delete(f"{API}/roasts/{first['id']}", headers=headers)
    second = client.post(f"{API}/submissions/{sub.id}/roasts", json={}, headers=headers)
    assert second.status_code == 429
    assert second.json()["code"] == "ROAST_LIMIT_REACHED"


# --------------------------------------------------------------------------- 5. Google linking


def test_google_link_clears_unverified_password_and_sessions(db: Session) -> None:
    squatter = User(email="victim@example.com", hashed_password="x" * 60, is_verified=False)
    db.add(squatter)
    db.commit()
    token = create_refresh_token(squatter.id)
    db.add(
        RefreshToken(
            user_id=squatter.id, token_hash=hash_token(token), expires_at=refresh_token_expires_at()
        )
    )
    db.commit()

    info = google_oauth.GoogleUserInfo(
        sub="g-victim", email="victim@example.com", email_verified=True
    )
    user = auth_service.get_or_create_google_user(db, info)

    assert user.id == squatter.id
    assert user.hashed_password is None
    assert user.is_verified is True and user.google_id == "g-victim"
    tokens = db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).all()
    assert tokens and all(t.revoked for t in tokens)


def test_google_link_keeps_verified_password(db: Session) -> None:
    owner = User(email="ok@example.com", hashed_password="h" * 60, is_verified=True)
    db.add(owner)
    db.commit()
    info = google_oauth.GoogleUserInfo(sub="g-ok", email="ok@example.com", email_verified=True)
    user = auth_service.get_or_create_google_user(db, info)
    assert user.hashed_password == "h" * 60


# --------------------------------------------------------------------------- 6. body size cap


class _Echo(BaseModel):
    text: str


def _capped_app(max_bytes: int) -> FastAPI:
    application = FastAPI()

    @application.post("/echo")
    async def echo(body: _Echo) -> dict[str, int]:
        return {"length": len(body.text)}

    application.add_exception_handler(
        main_module.StarletteHTTPException, main_module.http_exception_handler
    )
    application.add_middleware(BodySizeLimitMiddleware, max_bytes=max_bytes)
    return application


def test_body_cap_rejects_large_content_length() -> None:
    with TestClient(_capped_app(100)) as tc:
        response = tc.post("/echo", json={"text": "x" * 500})
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"
    assert "detail" in response.json()


def test_body_cap_allows_small_body() -> None:
    with TestClient(_capped_app(100)) as tc:
        response = tc.post("/echo", json={"text": "hi"})
    assert response.status_code == 200 and response.json() == {"length": 2}


def test_body_cap_counts_chunked_bodies() -> None:
    def chunks() -> Any:
        for _ in range(10):
            yield b'{"text": "' + b"y" * 50 + b'"}'

    with TestClient(_capped_app(100)) as tc:
        response = tc.post("/echo", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"


def test_real_app_has_body_cap(client: TestClient) -> None:
    oversized = settings.MAX_REQUEST_BYTES + 1
    response = client.post(
        f"{API}/auth/login",
        content=b"{}",
        headers={"content-type": "application/json", "content-length": str(oversized)},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"


# --------------------------------------------------------------------------- 7. stuck pending


async def test_cancelled_roast_is_marked_failed(
    db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    sub = _submission(db, user)
    _install(monkeypatch, ScriptedCompletions([asyncio.CancelledError()]))
    with pytest.raises(asyncio.CancelledError):
        await roast_service.create_roast(db, sub, user)
    db.expire_all()
    roast = db.scalars(select(Roast)).one()
    assert roast.status == RoastStatus.FAILED
    assert roast.error_message == roast_service.API_FAILURE_MESSAGE


def test_stale_pending_roasts_expire_on_read(client: TestClient, db: Session, user: User) -> None:
    sub = _submission(db, user)
    old = datetime.now(timezone.utc) - timedelta(seconds=2 * settings.OPENAI_TIMEOUT_SECONDS + 60)
    stale = Roast(
        submission_id=sub.id,
        user_id=user.id,
        intensity=RoastIntensity.MEDIUM,
        status=RoastStatus.PENDING,
        created_at=old,
    )
    fresh = Roast(
        submission_id=sub.id,
        user_id=user.id,
        intensity=RoastIntensity.MEDIUM,
        status=RoastStatus.PENDING,
    )
    db.add_all([stale, fresh])
    db.commit()

    body = client.get(f"{API}/roasts/{stale.id}", headers=bearer(user)).json()
    assert body["status"] == "failed"
    assert body["error_message"] == roast_service.API_FAILURE_MESSAGE
    detail = client.get(f"{API}/submissions/{sub.id}", headers=bearer(user)).json()
    statuses = {r["id"]: r["status"] for r in detail["roasts"]}
    assert statuses == {stale.id: "failed", fresh.id: "pending"}


# --------------------------------------------------------------------------- 9. token cap


async def test_max_completion_tokens_and_length_retry(
    db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    sub = _submission(db, user)
    good = json.dumps(VALID_ROAST_RESULT)
    completions = ScriptedCompletions([_response(good, "length"), _response(good)])
    _install(monkeypatch, completions)
    roast = await roast_service.create_roast(db, sub, user)
    assert roast.status == RoastStatus.COMPLETED
    assert len(completions.calls) == 2
    assert all(
        c["max_completion_tokens"] == settings.OPENAI_MAX_OUTPUT_TOKENS for c in completions.calls
    )


async def test_truncated_twice_fails(
    db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    sub = _submission(db, user)
    good = json.dumps(VALID_ROAST_RESULT)
    _install(monkeypatch, ScriptedCompletions([_response(good, "length")] * 2))
    roast = await roast_service.create_roast(db, sub, user)
    assert roast.status == RoastStatus.FAILED
    assert roast.error_message == roast_service.PARSE_FAILURE_MESSAGE
    assert roast.completion_tokens == 10


# --------------------------------------------------------------------------- 10. lenient output


def test_roast_issue_coerces_sloppy_fields() -> None:
    issue = RoastIssue.model_validate(
        {
            "file": "f" * 400,
            "line": 0,
            "severity": "CRITICAL",
            "category": "naming",
            "message": "m",
            "suggested_fix": "s",
        }
    )
    assert issue.file is not None and len(issue.file) == 255
    assert issue.line is None and issue.severity == "medium" and issue.category == "readability"
    assert (
        RoastIssue.model_validate(
            {
                "line": "12",
                "severity": " High ",
                "category": "Bug",
                "message": "m",
                "suggested_fix": "s",
            }
        ).model_dump()["line"]
        is None
    )
    assert (
        RoastIssue.model_validate(
            {
                "line": 3,
                "severity": " High ",
                "category": "Bug",
                "message": "m",
                "suggested_fix": "s",
            }
        ).severity
        == "high"
    )


def test_roast_issue_still_requires_message_and_fix() -> None:
    with pytest.raises(ValidationError):
        RoastIssue.model_validate({"severity": "low", "category": "bug", "message": "m"})


def test_roast_result_truncates_headline() -> None:
    data = {**VALID_ROAST_RESULT, "headline": "h" * 500}
    assert len(RoastResult.model_validate(data).headline) == 280


# --------------------------------------------------------------------------- 11. zip budget


def _zip(n: int) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for i in range(n):
            archive.writestr(f"src/f{i}.py", f"x = {i}\n")
    return buffer.getvalue()


def test_extract_zip_respects_remaining_budget() -> None:
    assert len(upload_service.extract_zip(_zip(3), max_files=3)) == 3
    with pytest.raises(BadRequestError) as excinfo:
        upload_service.extract_zip(_zip(3), max_files=2)
    assert excinfo.value.code == "TOO_MANY_FILES"


def test_upload_zip_over_budget_rejected(client: TestClient, user: User) -> None:
    files = [
        ("files", ("a.py", b"print(1)\n", "text/x-python")),
        ("files", ("b.zip", _zip(settings.MAX_FILES_PER_SUBMISSION), "application/zip")),
    ]
    response = client.post(
        f"{API}/submissions/upload",
        data={"title": "T", "language": "python"},
        files=files,
        headers=bearer(user),
    )
    assert response.status_code == 400
    assert response.json()["code"] == "TOO_MANY_FILES"


# --------------------------------------------------------------------------- 12. generic 500


def test_unhandled_exception_returns_generic_500() -> None:
    application = main_module.create_app()

    @application.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internals")

    with TestClient(application, raise_server_exceptions=False) as tc:
        response = tc.get("/boom")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "INTERNAL_ERROR"}


# --------------------------------------------------------------------------- 13. token pruning


def test_login_prunes_expired_but_keeps_revoked_tokens(
    client: TestClient, db: Session, user: User
) -> None:
    now = datetime.now(timezone.utc)
    db.add_all(
        [
            RefreshToken(user_id=user.id, token_hash="e" * 64, expires_at=now - timedelta(days=1)),
            RefreshToken(
                user_id=user.id,
                token_hash="r" * 64,
                expires_at=now + timedelta(days=1),
                revoked=True,
            ),
        ]
    )
    db.commit()
    response = client.post(
        f"{API}/auth/login", json={"email": user.email, "password": DEFAULT_PASSWORD}
    )
    assert response.status_code == 200
    db.expire_all()
    hashes = set(db.scalars(select(RefreshToken.token_hash).where(RefreshToken.user_id == user.id)))
    assert "e" * 64 not in hashes
    assert "r" * 64 in hashes
    assert len(hashes) == 2  # revoked one + the newly issued one


def test_refresh_reuse_detection_still_works(client: TestClient, user: User) -> None:
    tokens = client.post(
        f"{API}/auth/login", json={"email": user.email, "password": DEFAULT_PASSWORD}
    ).json()
    rotated = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert rotated.status_code == 200
    reused = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reused.status_code == 401
    after = client.post(
        f"{API}/auth/refresh", json={"refresh_token": rotated.json()["refresh_token"]}
    )
    assert after.status_code == 401
