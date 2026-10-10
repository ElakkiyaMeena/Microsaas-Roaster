"""Smoke tests for the Submissions module (paste CRUD + safe file/zip uploads).

Self-contained: in-memory SQLite via a ``get_db`` override, real JWT access tokens and a
temporary ``UPLOAD_DIR``. Only the submissions router is mounted so the tests are isolated
from other modules.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_submissions.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-submissions-module-0123456789")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")

import io  # noqa: E402
import zipfile  # noqa: E402
from collections.abc import Generator  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event, select  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.auth.security import create_access_token  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.exceptions import AppException  # noqa: E402
from app.models import Roast, RoastIntensity, RoastStatus, SubmissionFile, User  # noqa: E402
from app.routers import submissions  # noqa: E402
from app.services import upload_service  # noqa: E402
from app.services.submission_service import get_owned_submission  # noqa: E402


def _build_app() -> FastAPI:
    """Minimal app with only the submissions router."""
    application = FastAPI()

    async def _app_exc(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AppException)
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.message, "code": exc.code}
        )

    application.add_exception_handler(AppException, _app_exc)
    application.include_router(submissions.router, prefix="/api/v1")
    return application


app = _build_app()
BASE = "/api/v1/submissions"


@pytest.fixture()
def session_factory() -> Generator[sessionmaker[Session], None, None]:
    """Fresh in-memory database per test (foreign keys enforced)."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):  # type: ignore[no-untyped-def]
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def db(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """Session for direct ORM setup/assertions."""
    session = session_factory()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point UPLOAD_DIR at a temp directory and use small limits for fast tests."""
    target = tmp_path / "uploads"
    target.mkdir()
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(target))
    monkeypatch.setattr(settings, "MAX_FILE_SIZE_BYTES", 1000)
    monkeypatch.setattr(settings, "MAX_ZIP_SIZE_BYTES", 4000)
    monkeypatch.setattr(settings, "MAX_FILES_PER_SUBMISSION", 3)
    monkeypatch.setattr(settings, "MAX_CODE_CHARS", 100_000)
    return target


@pytest.fixture()
def client(session_factory: sessionmaker[Session]) -> Generator[TestClient, None, None]:
    """TestClient wired to the test database."""

    def _override_get_db() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _make_user(db: Session, email: str) -> User:
    user = User(email=email, hashed_password="x", full_name="Ada Lovelace")
    db.add(user)
    db.commit()
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture()
def alice(db: Session) -> User:
    return _make_user(db, "alice@example.com")


@pytest.fixture()
def bob(db: Session) -> User:
    return _make_user(db, "bob@example.com")


def _paste(client: TestClient, user: User, **overrides: object) -> dict:
    body = {
        "title": "  FizzBuzz  ",
        "assignment_brief": "Print fizzbuzz",
        "language": "python",
        "code_content": "print('hi')\n",
    }
    body.update(overrides)
    return client.post(BASE, json=body, headers=_auth(user)).json()


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _upload(client: TestClient, user: User, files: list[tuple[str, bytes]], title: str = "Upload"):
    return client.post(
        f"{BASE}/upload",
        data={"title": title, "language": "python"},
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
        headers=_auth(user),
    )


# ---------------------------------------------------------------- paste CRUD


def test_requires_auth(client: TestClient) -> None:
    assert client.get(BASE).status_code == 401


def test_create_and_get_paste(client: TestClient, alice: User) -> None:
    created = _paste(client, alice)
    assert created["title"] == "FizzBuzz"
    assert created["source_type"] == "paste"
    assert created["files"] == [] and created["roasts"] == []
    got = client.get(f"{BASE}/{created['id']}", headers=_auth(alice))
    assert got.status_code == 200
    assert got.json()["code_content"] == "print('hi')\n"


@pytest.mark.parametrize(
    "overrides",
    [
        {"title": "   "},
        {"title": "x" * 201},
        {"language": "cobol"},
        {"code_content": "   \n"},
        {"assignment_brief": "b" * 5001},
    ],
)
def test_create_validation(client: TestClient, alice: User, overrides: dict) -> None:
    body = {"title": "T", "language": "python", "code_content": "x = 1", **overrides}
    assert client.post(BASE, json=body, headers=_auth(alice)).status_code == 422


def test_ownership_returns_404(client: TestClient, db: Session, alice: User, bob: User) -> None:
    created = _paste(client, alice)
    sid = created["id"]
    for method in ("get", "delete"):
        resp = getattr(client, method)(f"{BASE}/{sid}", headers=_auth(bob))
        assert resp.status_code == 404
        assert resp.json()["code"] == "NOT_FOUND"
    resp = client.put(f"{BASE}/{sid}", json={"title": "hack"}, headers=_auth(bob))
    assert resp.status_code == 404
    assert client.get(f"{BASE}/99999", headers=_auth(alice)).status_code == 404
    with pytest.raises(AppException):
        get_owned_submission(db, sid, bob.id)
    assert get_owned_submission(db, sid, alice.id).id == sid


def test_list_pagination_and_aggregates(
    client: TestClient, db: Session, alice: User, bob: User
) -> None:
    ids = [_paste(client, alice, title=f"S{i}")["id"] for i in range(3)]
    _paste(client, bob, title="other")
    db.add_all(
        [
            Roast(
                submission_id=ids[0],
                user_id=alice.id,
                intensity=RoastIntensity.MILD,
                status=RoastStatus.COMPLETED,
                score=40,
            ),
            Roast(
                submission_id=ids[0],
                user_id=alice.id,
                intensity=RoastIntensity.SAVAGE,
                status=RoastStatus.FAILED,
                score=None,
            ),
        ]
    )
    db.commit()

    page1 = client.get(f"{BASE}?page=1&per_page=2", headers=_auth(alice)).json()
    assert page1["total"] == 3 and page1["page"] == 1 and page1["per_page"] == 2
    assert [i["id"] for i in page1["items"]] == [ids[2], ids[1]]
    page2 = client.get(f"{BASE}?page=2&per_page=2", headers=_auth(alice)).json()
    assert [i["id"] for i in page2["items"]] == [ids[0]]
    item = page2["items"][0]
    assert item["roast_count"] == 2
    assert item["latest_score"] == 40
    assert page1["items"][0]["roast_count"] == 0 and page1["items"][0]["latest_score"] is None
    assert "code_content" not in item


def test_update_paste(client: TestClient, alice: User) -> None:
    sid = _paste(client, alice)["id"]
    resp = client.put(
        f"{BASE}/{sid}",
        json={"title": "New", "code_content": "x = 2", "assignment_brief": None},
        headers=_auth(alice),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New" and data["code_content"] == "x = 2"
    assert data["assignment_brief"] is None
    assert data["language"] == "python"


def test_delete_paste(client: TestClient, alice: User) -> None:
    sid = _paste(client, alice)["id"]
    assert client.delete(f"{BASE}/{sid}", headers=_auth(alice)).status_code == 204
    assert client.get(f"{BASE}/{sid}", headers=_auth(alice)).status_code == 404


# ---------------------------------------------------------------- uploads


def test_upload_single_file(client: TestClient, db: Session, alice: User, upload_dir: Path) -> None:
    resp = _upload(client, alice, [("main.PY", b"print('hello')\n")])
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["source_type"] == "upload"
    assert data["code_content"].startswith("// ===== FILE: main.PY =====\nprint('hello')")
    assert len(data["files"]) == 1 and data["files"][0]["filename"] == "main.PY"
    stored = db.scalar(select(SubmissionFile.storage_path))
    assert stored is not None
    path = upload_dir / stored
    assert path.is_file() and path.read_text() == "print('hello')\n"
    assert path.parent.parent.name == str(alice.id)


def test_upload_zip_happy_path(client: TestClient, alice: User) -> None:
    archive = _zip(
        {
            "proj/src/app.py": b"def f():\n    return 1\n",
            "proj/README.md": b"# readme",
            "proj/image.png": b"\x89PNG not allowed ext",
            "__MACOSX/proj/._app.py": b"junk",
            "proj/.env": b"SECRET=1",
            "proj/empty/": b"",
        }
    )
    resp = _upload(client, alice, [("project.zip", archive)])
    assert resp.status_code == 201, resp.text
    names = sorted(f["filename"] for f in resp.json()["files"])
    assert names == ["proj/README.md", "proj/src/app.py"]
    assert "// ===== FILE: proj/src/app.py =====" in resp.json()["code_content"]


@pytest.mark.parametrize(
    "bad_name", ["../evil.py", "a/../../evil.py", "/etc/evil.py", "C:/evil.py", "..\\evil.py"]
)
def test_zip_slip_rejected(
    client: TestClient, alice: User, upload_dir: Path, bad_name: str
) -> None:
    resp = _upload(client, alice, [("bad.zip", _zip({bad_name: b"x = 1", "ok.py": b"y = 2"}))])
    assert resp.status_code == 400
    assert resp.json()["code"] == "INVALID_ZIP"
    assert not any(p.is_file() for p in upload_dir.rglob("*"))


def test_bad_zip(client: TestClient, alice: User) -> None:
    resp = _upload(client, alice, [("bad.zip", b"not a zip at all")])
    assert resp.status_code == 400 and resp.json()["code"] == "INVALID_ZIP"


def test_zip_bomb_rejected(
    client: TestClient, alice: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A highly compressible member whose declared size exceeds 10x the zip limit.
    monkeypatch.setattr(settings, "MAX_FILE_SIZE_BYTES", 1_000_000)
    archive = _zip({"bomb.txt": b"a" * 50_000})
    assert len(archive) < settings.MAX_ZIP_SIZE_BYTES
    resp = _upload(client, alice, [("bomb.zip", archive)])
    assert resp.status_code == 400 and resp.json()["code"] == "INVALID_ZIP"


def test_zip_member_too_large(client: TestClient, alice: User) -> None:
    archive = _zip({"big.py": b"a" * 5000})
    resp = _upload(client, alice, [("big.zip", archive)])
    assert resp.status_code == 413 and resp.json()["code"] == "FILE_TOO_LARGE"


def test_disallowed_extension(client: TestClient, alice: User) -> None:
    resp = _upload(client, alice, [("app.py", b"x = 1"), ("virus.exe", b"MZ")])
    assert resp.status_code == 400
    assert resp.json()["code"] == "UNSUPPORTED_FILE_TYPE"


def test_oversize_file(client: TestClient, alice: User) -> None:
    resp = _upload(client, alice, [("big.py", b"x" * 1001)])
    assert resp.status_code == 413 and resp.json()["code"] == "FILE_TOO_LARGE"


def test_oversize_zip(client: TestClient, alice: User) -> None:
    resp = _upload(client, alice, [("big.zip", os.urandom(4001))])
    assert resp.status_code == 413


def test_too_many_files(client: TestClient, alice: User) -> None:
    archive = _zip({f"f{i}.py": b"x = 1" for i in range(4)})
    resp = _upload(client, alice, [("many.zip", archive)])
    assert resp.status_code == 400 and resp.json()["code"] == "TOO_MANY_FILES"


def test_binary_skipped_and_no_readable_files(client: TestClient, alice: User) -> None:
    resp = _upload(client, alice, [("a.py", b"x = 1"), ("b.txt", b"\x00\x01\x02")])
    assert resp.status_code == 201
    assert [f["filename"] for f in resp.json()["files"]] == ["a.py"]

    resp = _upload(client, alice, [("b.txt", b"bin\x00ary"), ("c.py", b"\xff\xfe\xfa")])
    assert resp.status_code == 400 and resp.json()["code"] == "NO_READABLE_FILES"


def test_upload_code_not_editable(client: TestClient, alice: User) -> None:
    sid = _upload(client, alice, [("a.py", b"x = 1")]).json()["id"]
    resp = client.put(f"{BASE}/{sid}", json={"code_content": "y"}, headers=_auth(alice))
    assert resp.status_code == 400 and resp.json()["code"] == "CODE_NOT_EDITABLE"
    resp = client.put(f"{BASE}/{sid}", json={"title": "Renamed"}, headers=_auth(alice))
    assert resp.status_code == 200 and resp.json()["title"] == "Renamed"


def test_delete_removes_files(client: TestClient, alice: User, upload_dir: Path) -> None:
    sid = _upload(client, alice, [("a.py", b"x = 1"), ("b.py", b"y = 2")]).json()["id"]
    assert len([p for p in upload_dir.rglob("*") if p.is_file()]) == 2
    assert client.delete(f"{BASE}/{sid}", headers=_auth(alice)).status_code == 204
    assert not any(p.is_file() for p in upload_dir.rglob("*"))
    assert (upload_dir / str(alice.id)).is_dir()  # only the submission dir is removed


def test_upload_invalid_language(client: TestClient, alice: User) -> None:
    resp = client.post(
        f"{BASE}/upload",
        data={"title": "x", "language": "klingon"},
        files=[("files", ("a.py", b"x = 1", "text/plain"))],
        headers=_auth(alice),
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------- unit helpers


def test_sanitize_filename() -> None:
    assert upload_service.sanitize_filename("a/../b/c d$.py") == "a/b/c d_.py"
    assert upload_service.sanitize_filename("C:\\fakepath\\x.py", keep_dirs=False) == "x.py"
    assert upload_service.sanitize_filename("con.py") == "_con.py"
    assert upload_service.sanitize_filename("..") == "file"
    long_name = upload_service.sanitize_filename("a" * 400 + ".py")
    assert len(long_name) == 255 and long_name.endswith(".py")


def test_build_code_content_truncates() -> None:
    files = [
        upload_service.ExtractedFile(name="a.py", text="x" * 500, content_type="t", size_bytes=1)
    ]
    out = upload_service.build_code_content(files, max_chars=100)
    assert len(out) <= 100 and out.endswith("// [truncated]")


def test_remove_directory_refuses_outside(tmp_path: Path, upload_dir: Path) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    assert upload_service.remove_directory(outside) is False
    assert upload_service.remove_directory(upload_dir) is False
    assert outside.is_dir() and upload_dir.is_dir()
