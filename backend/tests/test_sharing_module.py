"""Smoke tests for the Sharing module (share links + public roast view).

Self-contained: uses an in-memory SQLite database via a ``get_db`` override and real JWT
access tokens. OpenAI is never called (roasts are inserted directly via the ORM).
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_sharing.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-sharing-module-0123456789")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from collections.abc import Generator  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.auth.security import create_access_token  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.exceptions import AppException  # noqa: E402
from app.models import Roast, RoastIntensity, RoastStatus, ShareLink, SourceType, Submission, User  # noqa: E402
from app.rate_limit import limiter  # noqa: E402
from app.routers import public, share_links  # noqa: E402


def _build_app() -> FastAPI:
    """Minimal app with only the sharing routers, isolated from other (parallel) modules."""
    application = FastAPI()
    application.state.limiter = limiter

    async def _app_exc(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AppException)
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.message, "code": exc.code}
        )

    application.add_exception_handler(AppException, _app_exc)
    application.include_router(share_links.router, prefix="/api/v1")
    application.include_router(public.router, prefix="/api/v1")
    return application


app = _build_app()

CODE = "def add(a, b):\n    return a - b\n"


@pytest.fixture()
def session_factory() -> Generator[sessionmaker[Session], None, None]:
    """Fresh in-memory database per test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def db(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """Session used by tests for direct ORM setup/assertions."""
    session = session_factory()
    yield session
    session.close()


@pytest.fixture()
def client(session_factory: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    """TestClient wired to the test database with rate limiting disabled."""

    def _override_get_db() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    previous = limiter.enabled
    limiter.enabled = False
    with TestClient(app) as test_client:
        yield test_client
    limiter.enabled = previous
    app.dependency_overrides.pop(get_db, None)


def _make_user(db: Session, email: str, full_name: str | None = "Ada Lovelace") -> User:
    user = User(email=email, full_name=full_name, hashed_password=None, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_roast(
    db: Session, user: User, status: RoastStatus = RoastStatus.COMPLETED, title: str = "Calc"
) -> Roast:
    submission = Submission(
        user_id=user.id,
        title=title,
        language="python",
        source_type=SourceType.PASTE,
        code_content=CODE,
    )
    db.add(submission)
    db.commit()
    roast = Roast(
        submission_id=submission.id,
        user_id=user.id,
        intensity=RoastIntensity.SAVAGE,
        status=status,
        score=42 if status == RoastStatus.COMPLETED else None,
        headline="Subtraction is not addition" if status == RoastStatus.COMPLETED else None,
        summary="Bold choice.",
        issues=[
            {
                "file": None,
                "line": 2,
                "severity": "high",
                "category": "bug",
                "message": "Uses minus.",
                "suggested_fix": "Use a + b.",
            }
        ],
        strengths=["Short"],
        model="test-model",
    )
    db.add(roast)
    db.commit()
    db.refresh(roast)
    return roast


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture()
def owner(db: Session) -> User:
    return _make_user(db, "owner@example.com")


@pytest.fixture()
def other(db: Session) -> User:
    return _make_user(db, "other@example.com", full_name=None)


def _share(client: TestClient, user: User, roast_id: int, **body: object):  # noqa: ANN202
    return client.post(f"/api/v1/roasts/{roast_id}/share", json=body, headers=_auth(user))


def test_create_share_link_201(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    resp = _share(client, owner, roast.id)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["roast_id"] == roast.id
    assert data["is_active"] is True
    assert data["show_code"] is False
    assert data["view_count"] == 0
    assert len(data["slug"]) >= 10
    assert data["url"].endswith(f"/r/{data['slug']}")


def test_create_requires_auth(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    assert client.post(f"/api/v1/roasts/{roast.id}/share", json={}).status_code == 401


def test_recreate_reactivates_200(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    first = _share(client, owner, roast.id).json()
    link_id = first["id"]
    patch = client.patch(
        f"/api/v1/share-links/{link_id}", json={"is_active": False}, headers=_auth(owner)
    )
    assert patch.status_code == 200
    assert patch.json()["is_active"] is False

    again = _share(client, owner, roast.id, show_code=True)
    assert again.status_code == 200, again.text
    data = again.json()
    assert data["id"] == link_id
    assert data["slug"] == first["slug"]
    assert data["is_active"] is True
    assert data["show_code"] is True


def test_non_completed_roast_400(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner, status=RoastStatus.FAILED)
    resp = _share(client, owner, roast.id)
    assert resp.status_code == 400
    assert resp.json()["code"] == "ROAST_NOT_COMPLETED"


def test_other_users_roast_404(client: TestClient, db: Session, owner: User, other: User) -> None:
    roast = _make_roast(db, owner)
    resp = _share(client, other, roast.id)
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"


def test_past_expiry_rejected(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    assert _share(client, owner, roast.id, expires_at=past).status_code == 422


def test_list_share_links(client: TestClient, db: Session, owner: User, other: User) -> None:
    r1 = _make_roast(db, owner, title="First")
    r2 = _make_roast(db, owner, title="Second")
    r3 = _make_roast(db, other, title="Theirs")
    _share(client, owner, r1.id)
    _share(client, owner, r2.id)
    _share(client, other, r3.id)

    resp = client.get("/api/v1/share-links", headers=_auth(owner))
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    titles = {item["submission_title"] for item in items}
    assert titles == {"First", "Second"}
    assert all(item["roast_headline"] == "Subtraction is not addition" for item in items)
    assert all("url" in item for item in items)
    # newest first (ids increase with creation)
    assert items[0]["id"] > items[1]["id"]


def test_patch_toggles_and_owner_only(
    client: TestClient, db: Session, owner: User, other: User
) -> None:
    roast = _make_roast(db, owner)
    link_id = _share(client, owner, roast.id).json()["id"]
    url = f"/api/v1/share-links/{link_id}"

    resp = client.patch(url, json={"show_code": True}, headers=_auth(owner))
    assert resp.status_code == 200
    assert resp.json()["show_code"] is True
    assert resp.json()["is_active"] is True

    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    resp = client.patch(url, json={"expires_at": future}, headers=_auth(owner))
    assert resp.json()["expires_at"] is not None
    resp = client.patch(url, json={"expires_at": None}, headers=_auth(owner))
    assert resp.json()["expires_at"] is None

    assert client.patch(url, json={"show_code": False}, headers=_auth(other)).status_code == 404


def test_delete_share_link(client: TestClient, db: Session, owner: User, other: User) -> None:
    roast = _make_roast(db, owner)
    link_id = _share(client, owner, roast.id).json()["id"]
    url = f"/api/v1/share-links/{link_id}"
    assert client.delete(url, headers=_auth(other)).status_code == 404
    assert client.delete(url, headers=_auth(owner)).status_code == 204
    assert client.delete(url, headers=_auth(owner)).status_code == 404
    assert client.get("/api/v1/share-links", headers=_auth(owner)).json() == []


def test_public_view_whitelisted_and_counts(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    slug = _share(client, owner, roast.id).json()["slug"]

    resp = client.get(f"/api/v1/public/roasts/{slug}")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("cache-control") == "no-store"
    data = resp.json()
    assert set(data) == {
        "slug",
        "submission_title",
        "language",
        "intensity",
        "score",
        "headline",
        "summary",
        "issues",
        "strengths",
        "code_content",
        "author_name",
        "created_at",
    }
    for forbidden in ("user_id", "email", "id", "roast_id", "submission_id"):
        assert forbidden not in data
    assert data["author_name"] == "Ada"
    assert data["intensity"] == "savage"
    assert data["score"] == 42
    assert data["code_content"] is None
    assert data["issues"][0]["suggested_fix"] == "Use a + b."

    client.get(f"/api/v1/public/roasts/{slug}")
    links = client.get("/api/v1/share-links", headers=_auth(owner)).json()
    assert links[0]["view_count"] == 2


def test_public_show_code(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    slug = _share(client, owner, roast.id, show_code=True).json()["slug"]
    assert client.get(f"/api/v1/public/roasts/{slug}").json()["code_content"] == CODE


def test_public_missing_and_inactive_404(client: TestClient, db: Session, owner: User) -> None:
    resp = client.get("/api/v1/public/roasts/doesnotexist123")
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"

    roast = _make_roast(db, owner)
    link = _share(client, owner, roast.id).json()
    client.patch(
        f"/api/v1/share-links/{link['id']}", json={"is_active": False}, headers=_auth(owner)
    )
    assert client.get(f"/api/v1/public/roasts/{link['slug']}").status_code == 404


def test_public_expired_404(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    link = ShareLink(
        roast_id=roast.id,
        user_id=owner.id,
        slug="expiredslug1234",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    db.add(link)
    db.commit()
    assert client.get("/api/v1/public/roasts/expiredslug1234").status_code == 404


def test_public_owner_deactivated_404(client: TestClient, db: Session, owner: User) -> None:
    roast = _make_roast(db, owner)
    slug = _share(client, owner, roast.id).json()["slug"]
    owner.is_active = False
    db.commit()
    assert client.get(f"/api/v1/public/roasts/{slug}").status_code == 404
