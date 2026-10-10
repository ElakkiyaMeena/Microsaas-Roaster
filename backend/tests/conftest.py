"""Shared pytest fixtures for the Assignment Roaster backend.

- In-memory SQLite (``StaticPool`` + ``PRAGMA foreign_keys=ON``) via a ``get_db`` override.
- User / admin factories and ``Authorization`` header helpers using real JWTs.
- A fake OpenAI client (``fake_openai``): OpenAI is NEVER called from tests.
- A per-test temporary ``UPLOAD_DIR``.

The pre-existing ``test_*_module.py`` files define their own same-named fixtures, which take
precedence over these inside those modules.
"""

from __future__ import annotations

import os

# Must run before ``app`` is imported anywhere (settings are read at import time).
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-the-shared-conftest-0123456789")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import json  # noqa: E402
from collections.abc import Callable, Generator  # noqa: E402
from pathlib import Path  # noqa: E402
from types import SimpleNamespace  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401  (registers all tables)
from app.auth.security import create_access_token, hash_password  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402
from app.models import User  # noqa: E402
from app.rate_limit import limiter  # noqa: E402
from app.services import roast_service  # noqa: E402

DEFAULT_PASSWORD = "correct-horse-battery"

VALID_ROAST_RESULT: dict[str, Any] = {
    "score": 73,
    "headline": "This code works, which is the nicest thing I can say about it.",
    "summary": "Functional but the naming is a crime scene. Fix the bug and it is solid.",
    "issues": [
        {
            "file": None,
            "line": 2,
            "severity": "high",
            "category": "bug",
            "message": "add() subtracts.",
            "suggested_fix": "Use `return a + b`.",
        }
    ],
    "strengths": ["Short and readable."],
}


# --------------------------------------------------------------------------- database


def _enable_sqlite_fks(dbapi_connection: Any, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture()
def engine() -> Generator[Engine, None, None]:
    """A fresh in-memory SQLite engine with all tables and foreign keys enforced."""
    eng = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    event.listen(eng, "connect", _enable_sqlite_fks)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture()
def session_factory(engine: Engine) -> sessionmaker[Session]:
    """Session factory bound to the test engine (same options as production)."""
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def db(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """A database session for arranging and asserting state directly."""
    session = session_factory()
    yield session
    session.close()


@pytest.fixture()
def upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point ``UPLOAD_DIR`` at a per-test temporary directory."""
    directory = tmp_path / "uploads"
    directory.mkdir()
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(directory))
    return directory


@pytest.fixture()
def client(
    session_factory: sessionmaker[Session], upload_dir: Path
) -> Generator[TestClient, None, None]:
    """TestClient over the real app with ``get_db`` overridden and rate limiting disabled."""

    def _override_get_db() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    previous = limiter.enabled
    limiter.enabled = False
    try:
        with TestClient(fastapi_app) as test_client:
            yield test_client
    finally:
        limiter.enabled = previous
        fastapi_app.dependency_overrides.pop(get_db, None)


# --------------------------------------------------------------------------- users / auth


@pytest.fixture()
def make_user(db: Session) -> Callable[..., User]:
    """Factory: ``make_user(email=..., is_admin=..., is_active=..., password=...)``."""
    counter = {"n": 0}

    def _make(
        email: str | None = None,
        *,
        password: str | None = DEFAULT_PASSWORD,
        full_name: str | None = "Ada Lovelace",
        is_admin: bool = False,
        is_active: bool = True,
    ) -> User:
        counter["n"] += 1
        user = User(
            email=email or f"user{counter['n']}@example.com",
            hashed_password=hash_password(password) if password else None,
            full_name=full_name,
            is_admin=is_admin,
            is_active=is_active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return _make


@pytest.fixture()
def user(make_user: Callable[..., User]) -> User:
    """A regular, active user."""
    return make_user("learner@example.com")


@pytest.fixture()
def admin_user(make_user: Callable[..., User]) -> User:
    """An active admin user."""
    return make_user("admin@example.com", is_admin=True, full_name="Admin")


def bearer(user_obj: User) -> dict[str, str]:
    """Build an ``Authorization`` header with a fresh access token for ``user_obj``."""
    return {"Authorization": f"Bearer {create_access_token(user_obj.id)}"}


@pytest.fixture()
def auth_headers(user: User) -> dict[str, str]:
    """Auth headers for the default ``user`` fixture."""
    return bearer(user)


@pytest.fixture()
def admin_headers(admin_user: User) -> dict[str, str]:
    """Auth headers for the ``admin_user`` fixture."""
    return bearer(admin_user)


# --------------------------------------------------------------------------- fake OpenAI


class FakeCompletions:
    """Returns queued outcomes (message content str, or an Exception to raise).

    When the queue is empty, ``default`` content is returned.
    """

    def __init__(self, outcomes: list[str | Exception], default: str) -> None:
        self.outcomes = list(outcomes)
        self.default = default
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome: str | Exception = self.outcomes.pop(0) if self.outcomes else self.default
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(
            model="fake-model-1",
            choices=[SimpleNamespace(message=SimpleNamespace(content=outcome))],
            usage=SimpleNamespace(prompt_tokens=120, completion_tokens=60),
        )


class FakeOpenAI:
    """Minimal stand-in for ``AsyncOpenAI`` exposing ``chat.completions.create``."""

    def __init__(self, outcomes: list[str | Exception] | None = None) -> None:
        self.completions = FakeCompletions(outcomes or [], json.dumps(VALID_ROAST_RESULT))
        self.chat = SimpleNamespace(completions=self.completions)

    def queue(self, *outcomes: str | Exception) -> None:
        """Append outcomes for the next calls."""
        self.completions.outcomes.extend(outcomes)

    @property
    def calls(self) -> list[dict[str, Any]]:
        """Keyword arguments of every ``create`` call so far."""
        return self.completions.calls


@pytest.fixture()
def fake_openai(monkeypatch: pytest.MonkeyPatch) -> FakeOpenAI:
    """Install a fake OpenAI client that returns ``VALID_ROAST_RESULT`` by default."""
    fake = FakeOpenAI()
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test-not-real")
    monkeypatch.setattr(settings, "ROASTS_PER_DAY", 10)
    monkeypatch.setattr(roast_service, "get_openai_client", lambda: fake)
    return fake
