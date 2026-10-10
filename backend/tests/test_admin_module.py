"""Smoke tests for the admin module (``/api/v1/admin/*``).

Self-contained: uses its own in-memory SQLite engine and overrides ``get_db``.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_admin_module.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-admin-module-tests-0123456789")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

from collections.abc import Generator  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402, F401 - registers all tables
from app.auth.security import create_access_token  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.enums import RoastIntensity, RoastStatus, SourceType  # noqa: E402
from app.models.roast import Roast  # noqa: E402
from app.models.share_link import ShareLink  # noqa: E402
from app.models.submission import Submission  # noqa: E402
from app.models.user import RefreshToken, User  # noqa: E402

API = "/api/v1/admin"


@pytest.fixture()
def adm_db() -> Generator[Session, None, None]:
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
    session = factory()
    try:
        yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@pytest.fixture()
def adm_client(adm_db: Session) -> TestClient:
    """HTTP client bound to the overridden database."""
    return TestClient(app)


def _user(db: Session, email: str, *, admin: bool = False, name: str | None = None) -> User:
    user = User(email=email, full_name=name, is_admin=admin, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _submission(db: Session, user: User, title: str = "Todo app") -> Submission:
    sub = Submission(
        user_id=user.id,
        title=title,
        language="python",
        source_type=SourceType.PASTE,
        code_content="print('hi')",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _roast(
    db: Session,
    sub: Submission,
    *,
    status: RoastStatus = RoastStatus.COMPLETED,
    created_at: datetime | None = None,
    prompt_tokens: int | None = 100,
    completion_tokens: int | None = 50,
) -> Roast:
    roast = Roast(
        submission_id=sub.id,
        user_id=sub.user_id,
        intensity=RoastIntensity.MEDIUM,
        status=status,
        score=70,
        headline="Spicy",
        summary="ok",
        issues=[],
        strengths=[],
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    if created_at is not None:
        roast.created_at = created_at
    db.add(roast)
    db.commit()
    db.refresh(roast)
    return roast


def test_non_admin_gets_403(adm_client: TestClient, adm_db: Session) -> None:
    user = _user(adm_db, "user@example.com")
    for method, path in [
        ("get", "/users"),
        ("put", f"/users/{user.id}"),
        ("get", "/stats"),
        ("get", "/share-links"),
        ("delete", "/share-links/1"),
    ]:
        kwargs = {"json": {"is_active": False}} if method == "put" else {}
        resp = adm_client.request(method.upper(), API + path, headers=_auth(user), **kwargs)
        assert resp.status_code == 403, path
        assert resp.json()["code"] == "FORBIDDEN"


def test_unauthenticated_gets_401(adm_client: TestClient) -> None:
    assert adm_client.get(f"{API}/stats").status_code == 401


def test_list_users_with_counts_and_search(adm_client: TestClient, adm_db: Session) -> None:
    admin = _user(adm_db, "admin@example.com", admin=True, name="Root")
    ada = _user(adm_db, "ada@example.com", name="Ada Lovelace")
    _user(adm_db, "under_score@example.com", name="Bob")
    sub1 = _submission(adm_db, ada)
    _submission(adm_db, ada, "Second")
    _roast(adm_db, sub1)
    _roast(adm_db, sub1)
    _roast(adm_db, sub1)

    resp = adm_client.get(f"{API}/users", headers=_auth(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert body["page"] == 1 and body["per_page"] == 20
    by_email = {u["email"]: u for u in body["items"]}
    assert by_email["ada@example.com"]["submission_count"] == 2
    assert by_email["ada@example.com"]["roast_count"] == 3
    assert by_email["admin@example.com"]["submission_count"] == 0
    assert "hashed_password" not in by_email["ada@example.com"]

    resp = adm_client.get(f"{API}/users", params={"search": "LOVELACE"}, headers=_auth(admin))
    assert [u["email"] for u in resp.json()["items"]] == ["ada@example.com"]

    # "_" is escaped: it must match literally, not as a single-char wildcard.
    resp = adm_client.get(f"{API}/users", params={"search": "a_a"}, headers=_auth(admin))
    assert resp.json()["total"] == 0
    resp = adm_client.get(f"{API}/users", params={"search": "under_"}, headers=_auth(admin))
    assert resp.json()["total"] == 1

    resp = adm_client.get(f"{API}/users", params={"per_page": 1, "page": 2}, headers=_auth(admin))
    assert resp.json()["total"] == 3 and len(resp.json()["items"]) == 1


def test_update_user_toggles_and_revokes_tokens(adm_client: TestClient, adm_db: Session) -> None:
    admin = _user(adm_db, "admin@example.com", admin=True)
    target = _user(adm_db, "target@example.com")
    adm_db.add(
        RefreshToken(
            user_id=target.id,
            token_hash="a" * 64,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    adm_db.commit()

    resp = adm_client.put(f"{API}/users/{target.id}", json={"is_admin": True}, headers=_auth(admin))
    assert resp.status_code == 200
    assert resp.json()["is_admin"] is True and resp.json()["is_active"] is True

    resp = adm_client.put(
        f"{API}/users/{target.id}", json={"is_active": False}, headers=_auth(admin)
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    adm_db.expire_all()
    tokens = adm_db.scalars(select(RefreshToken).where(RefreshToken.user_id == target.id)).all()
    assert tokens and all(t.revoked for t in tokens)

    resp = adm_client.put(f"{API}/users/9999", json={"is_active": True}, headers=_auth(admin))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "User not found"


def test_admin_cannot_modify_self(adm_client: TestClient, adm_db: Session) -> None:
    admin = _user(adm_db, "admin@example.com", admin=True)
    for payload in ({"is_active": False}, {"is_admin": False}):
        resp = adm_client.put(f"{API}/users/{admin.id}", json=payload, headers=_auth(admin))
        assert resp.status_code == 400
        assert resp.json()["code"] == "CANNOT_MODIFY_SELF"
    # No-op self update is allowed.
    resp = adm_client.put(f"{API}/users/{admin.id}", json={"is_active": True}, headers=_auth(admin))
    assert resp.status_code == 200


def test_stats_shape_and_zero_filled_days(adm_client: TestClient, adm_db: Session) -> None:
    admin = _user(adm_db, "admin@example.com", admin=True)
    inactive = _user(adm_db, "gone@example.com")
    inactive.is_active = False
    adm_db.commit()
    sub = _submission(adm_db, admin)
    now = datetime.now(timezone.utc)
    _roast(adm_db, sub, created_at=now)
    _roast(adm_db, sub, created_at=now - timedelta(days=2), status=RoastStatus.FAILED)
    _roast(adm_db, sub, created_at=now - timedelta(days=30), prompt_tokens=None)
    roast = _roast(adm_db, sub)
    adm_db.add(ShareLink(roast_id=roast.id, user_id=admin.id, slug="activeslug123"))
    adm_db.commit()

    resp = adm_client.get(f"{API}/stats", headers=_auth(admin))
    assert resp.status_code == 200
    stats = resp.json()
    assert stats["total_users"] == 2
    assert stats["active_users"] == 1
    assert stats["total_submissions"] == 1
    assert stats["total_roasts"] == 4
    assert stats["failed_roasts"] == 1
    assert stats["total_prompt_tokens"] == 300
    assert stats["total_completion_tokens"] == 200
    assert stats["active_share_links"] == 1

    days = stats["roasts_last_7_days"]
    assert len(days) == 7
    today = now.date()
    assert [d["date"] for d in days] == [
        (today - timedelta(days=6 - i)).isoformat() for i in range(7)
    ]
    assert days[-1]["count"] == 2
    assert days[-3]["count"] == 1
    assert sum(d["count"] for d in days) == 3


def test_stats_empty_database(adm_client: TestClient, adm_db: Session) -> None:
    admin = _user(adm_db, "admin@example.com", admin=True)
    stats = adm_client.get(f"{API}/stats", headers=_auth(admin)).json()
    assert stats["total_roasts"] == 0
    assert stats["total_prompt_tokens"] == 0
    assert [d["count"] for d in stats["roasts_last_7_days"]] == [0] * 7


def test_share_links_list_and_delete(adm_client: TestClient, adm_db: Session) -> None:
    admin = _user(adm_db, "admin@example.com", admin=True)
    owner = _user(adm_db, "owner@example.com")
    sub = _submission(adm_db, owner, "Calculator")
    roast = _roast(adm_db, sub)
    link = ShareLink(roast_id=roast.id, user_id=owner.id, slug="slug-abcdef12", show_code=True)
    adm_db.add(link)
    adm_db.commit()
    adm_db.refresh(link)
    link_id = link.id

    resp = adm_client.get(f"{API}/share-links", headers=_auth(admin))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["owner_email"] == "owner@example.com"
    assert item["submission_title"] == "Calculator"
    assert item["roast_headline"] == "Spicy"
    assert item["slug"] == "slug-abcdef12"
    assert item["url"].endswith("/r/slug-abcdef12")
    assert item["show_code"] is True

    resp = adm_client.delete(f"{API}/share-links/{link_id}", headers=_auth(admin))
    assert resp.status_code == 204
    assert adm_db.scalar(select(ShareLink.id).where(ShareLink.id == link_id)) is None

    resp = adm_client.delete(f"{API}/share-links/{link_id}", headers=_auth(admin))
    assert resp.status_code == 404
