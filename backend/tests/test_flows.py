"""End-to-end API flow tests mapped to the INITIAL.md ACCEPTANCE CRITERIA.

Each test drives the real FastAPI app over HTTP (shared fixtures from ``conftest.py``).
OpenAI is replaced by the ``fake_openai`` fixture; nothing leaves the process.
"""

from __future__ import annotations

import io
import json
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from conftest import DEFAULT_PASSWORD, VALID_ROAST_RESULT, FakeOpenAI, bearer
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ShareLink, User

API = "/api/v1"
CODE = "def add(a, b):\n    return a - b\n"


# --------------------------------------------------------------------------- helpers


def _register_and_login(
    client: TestClient, email: str = "Flow@Example.com", password: str = DEFAULT_PASSWORD
) -> dict[str, str]:
    resp = client.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "full_name": "Grace Hopper"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["email"] == email.lower()
    assert "hashed_password" not in resp.json()

    resp = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    tokens = resp.json()
    assert tokens["token_type"] == "bearer"
    return tokens


def _h(tokens: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _paste(client: TestClient, headers: dict[str, str], title: str = "Calculator") -> int:
    resp = client.post(
        f"{API}/submissions",
        json={
            "title": title,
            "language": "python",
            "assignment_brief": "Write add(a, b).",
            "code_content": CODE,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["source_type"] == "paste"
    return int(body["id"])


def _roast(
    client: TestClient, headers: dict[str, str], submission_id: int, intensity: str = "savage"
) -> dict[str, Any]:
    resp = client.post(
        f"{API}/submissions/{submission_id}/roasts", json={"intensity": intensity}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _zip_bytes(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


# --------------------------------------------------------------------------- happy path


def test_full_paste_roast_share_revoke_flow(client: TestClient, fake_openai: FakeOpenAI) -> None:
    """register -> login -> paste -> roast -> share -> public view -> revoke -> 404."""
    tokens = _register_and_login(client)
    headers = _h(tokens)

    me = client.get(f"{API}/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "flow@example.com"

    submission_id = _paste(client, headers)

    roast = _roast(client, headers, submission_id)
    assert roast["status"] == "completed"
    assert roast["intensity"] == "savage"
    assert 0 <= roast["score"] <= 100
    assert roast["score"] == VALID_ROAST_RESULT["score"]
    assert roast["headline"] and roast["summary"]
    assert roast["strengths"] == VALID_ROAST_RESULT["strengths"]
    assert all(issue["suggested_fix"] for issue in roast["issues"])
    assert len(fake_openai.calls) == 1
    # Prompt-injection defense: submitted code is wrapped in delimiters inside the user message.
    user_message = fake_openai.calls[0]["messages"][-1]["content"]
    assert "<submitted_code" in user_message and CODE.strip() in user_message

    detail = client.get(f"{API}/submissions/{submission_id}", headers=headers)
    assert detail.status_code == 200
    assert [r["id"] for r in detail.json()["roasts"]] == [roast["id"]]

    quota = client.get(f"{API}/roasts/quota", headers=headers).json()
    assert quota == {"limit": 10, "used_today": 1, "remaining": 9}

    share = client.post(f"{API}/roasts/{roast['id']}/share", json={}, headers=headers)
    assert share.status_code == 201, share.text
    link = share.json()
    assert len(link["slug"]) >= 10
    assert link["url"].endswith(f"/r/{link['slug']}")
    assert link["show_code"] is False

    # Logged out: no Authorization header at all.
    public = client.get(f"{API}/public/roasts/{link['slug']}")
    assert public.status_code == 200, public.text
    body = public.json()
    assert body["headline"] == roast["headline"]
    assert body["score"] == roast["score"]
    assert body["code_content"] is None
    assert body["author_name"] == "Grace"
    serialized = json.dumps(body)
    assert "flow@example.com" not in serialized
    assert "user_id" not in body and "email" not in body
    assert public.headers["cache-control"] == "no-store"

    client.get(f"{API}/public/roasts/{link['slug']}")
    links = client.get(f"{API}/share-links", headers=headers).json()
    assert links[0]["view_count"] == 2
    assert links[0]["submission_title"] == "Calculator"

    # Enable show_code -> code becomes visible publicly.
    patched = client.patch(
        f"{API}/share-links/{link['id']}", json={"show_code": True}, headers=headers
    )
    assert patched.status_code == 200
    assert client.get(f"{API}/public/roasts/{link['slug']}").json()["code_content"] == CODE

    # Revoke -> 404.
    revoked = client.patch(
        f"{API}/share-links/{link['id']}", json={"is_active": False}, headers=headers
    )
    assert revoked.status_code == 200
    assert revoked.json()["is_active"] is False
    gone = client.get(f"{API}/public/roasts/{link['slug']}")
    assert gone.status_code == 404
    assert gone.json()["code"]

    # Re-sharing reactivates the same link (200, same slug).
    again = client.post(f"{API}/roasts/{roast['id']}/share", json={}, headers=headers)
    assert again.status_code == 200
    assert again.json()["slug"] == link["slug"]
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 200

    # Hard delete -> 404 forever.
    assert client.delete(f"{API}/share-links/{link['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 404


def test_upload_zip_flow_then_roast(
    client: TestClient, fake_openai: FakeOpenAI, upload_dir: Path
) -> None:
    headers = _h(_register_and_login(client))
    archive = _zip_bytes(
        {
            "project/main.py": "print('hi')\n",
            "project/utils/helpers.js": "export const x = 1;\n",
            "project/logo.png": "\x89PNG not really",
            "__MACOSX/._main.py": "junk",
        }
    )
    resp = client.post(
        f"{API}/submissions/upload",
        data={"title": "Zip project", "language": "python", "assignment_brief": "Say hi"},
        files=[("files", ("project.zip", archive, "application/zip"))],
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["source_type"] == "upload"
    names = sorted(f["filename"] for f in body["files"])
    assert any(n.endswith("main.py") for n in names)
    assert any(n.endswith("helpers.js") for n in names)
    assert not any(n.endswith(".png") or "MACOSX" in n for n in names)
    stored = [p for p in upload_dir.rglob("*") if p.is_file()]
    assert len(stored) == len(names)

    roast = _roast(client, headers, int(body["id"]), intensity="mild")
    assert roast["status"] == "completed"
    assert roast["intensity"] == "mild"
    sent = fake_openai.calls[0]["messages"][-1]["content"]
    assert "print('hi')" in sent and "export const x = 1;" in sent

    # Deleting the submission removes its files from disk.
    assert client.delete(f"{API}/submissions/{body['id']}", headers=headers).status_code == 204
    assert [p for p in upload_dir.rglob("*") if p.is_file()] == []


def test_upload_rejects_traversal_and_bad_types(client: TestClient, upload_dir: Path) -> None:
    headers = _h(_register_and_login(client))
    evil = _zip_bytes({"../evil.py": "import os\n"})
    resp = client.post(
        f"{API}/submissions/upload",
        data={"title": "Evil", "language": "python"},
        files=[("files", ("evil.zip", evil, "application/zip"))],
        headers=headers,
    )
    assert resp.status_code == 400, resp.text

    resp = client.post(
        f"{API}/submissions/upload",
        data={"title": "Binary", "language": "other"},
        files=[("files", ("tool.exe", b"MZ\x00\x00", "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"]
    assert [p for p in upload_dir.rglob("*") if p.is_file()] == []


def test_failed_ai_output_marks_roast_failed(client: TestClient, fake_openai: FakeOpenAI) -> None:
    headers = _h(_register_and_login(client))
    submission_id = _paste(client, headers)
    fake_openai.queue("not json at all", '{"score": 500}')
    roast = _roast(client, headers, submission_id)
    assert roast["status"] == "failed"
    assert roast["error_message"]
    assert len(fake_openai.calls) == 2  # one retry then give up

    share = client.post(f"{API}/roasts/{roast['id']}/share", json={}, headers=headers)
    assert share.status_code in (400, 409)


# --------------------------------------------------------------------------- limits / isolation


def test_daily_roast_limit_returns_429(
    client: TestClient, fake_openai: FakeOpenAI, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ROASTS_PER_DAY", 2)
    headers = _h(_register_and_login(client))
    submission_id = _paste(client, headers)
    _roast(client, headers, submission_id)
    _roast(client, headers, submission_id)

    resp = client.post(
        f"{API}/submissions/{submission_id}/roasts", json={"intensity": "mild"}, headers=headers
    )
    assert resp.status_code == 429
    assert resp.json()["code"] == "ROAST_LIMIT_REACHED"
    assert len(fake_openai.calls) == 2
    quota = client.get(f"{API}/roasts/quota", headers=headers).json()
    assert quota == {"limit": 2, "used_today": 2, "remaining": 0}


def test_users_cannot_see_each_others_data(
    client: TestClient, fake_openai: FakeOpenAI, make_user: Callable[..., User]
) -> None:
    owner = make_user("owner@example.com")
    other = make_user("other@example.com")
    submission_id = _paste(client, bearer(owner))
    roast = _roast(client, bearer(owner), submission_id)

    for method, url in (
        ("get", f"{API}/submissions/{submission_id}"),
        ("delete", f"{API}/submissions/{submission_id}"),
        ("get", f"{API}/roasts/{roast['id']}"),
        ("post", f"{API}/submissions/{submission_id}/roasts"),
        ("post", f"{API}/roasts/{roast['id']}/share"),
    ):
        resp = client.request(method, url, headers=bearer(other), json={})
        assert resp.status_code == 404, (method, url, resp.status_code)
    listed = client.get(f"{API}/submissions", headers=bearer(other)).json()
    assert listed["total"] == 0 and listed["items"] == []


# --------------------------------------------------------------------------- admin / auth


def test_admin_takedown_makes_public_link_404(
    client: TestClient,
    fake_openai: FakeOpenAI,
    user: User,
    auth_headers: dict[str, str],
    admin_headers: dict[str, str],
) -> None:
    submission_id = _paste(client, auth_headers)
    roast = _roast(client, auth_headers, submission_id)
    link = client.post(f"{API}/roasts/{roast['id']}/share", json={}, headers=auth_headers).json()
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 200

    # Regular users are forbidden from the admin API.
    assert client.get(f"{API}/admin/share-links", headers=auth_headers).status_code == 403
    assert client.get(f"{API}/admin/stats").status_code == 401

    listing = client.get(f"{API}/admin/share-links", headers=admin_headers)
    assert listing.status_code == 200
    item = listing.json()["items"][0]
    assert item["slug"] == link["slug"]
    assert item["owner_email"] == user.email

    resp = client.delete(f"{API}/admin/share-links/{link['id']}", headers=admin_headers)
    assert resp.status_code == 204
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 404
    again = client.delete(f"{API}/admin/share-links/{link['id']}", headers=admin_headers)
    assert again.status_code == 404

    stats = client.get(f"{API}/admin/stats", headers=admin_headers).json()
    assert stats["total_roasts"] == 1
    assert stats["total_prompt_tokens"] == 120
    assert stats["active_share_links"] == 0


def test_deactivated_user_cannot_login_and_tokens_refused(
    client: TestClient, admin_headers: dict[str, str], fake_openai: FakeOpenAI, db: Session
) -> None:
    tokens = _register_and_login(client, "victim@example.com")
    headers = _h(tokens)
    submission_id = _paste(client, headers)
    roast = _roast(client, headers, submission_id)
    link = client.post(f"{API}/roasts/{roast['id']}/share", json={}, headers=headers).json()
    me = client.get(f"{API}/auth/me", headers=headers).json()

    resp = client.put(
        f"{API}/admin/users/{me['id']}", json={"is_active": False}, headers=admin_headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is False

    # Existing access token refused.
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401
    # Refresh token refused.
    refreshed = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 401
    # Login refused with a clear 403.
    login = client.post(
        f"{API}/auth/login", json={"email": "victim@example.com", "password": DEFAULT_PASSWORD}
    )
    assert login.status_code == 403
    assert login.json()["code"] == "USER_INACTIVE"
    # Their public share links disappear too.
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 404

    # Reactivation restores login.
    client.put(f"{API}/admin/users/{me['id']}", json={"is_active": True}, headers=admin_headers)
    login = client.post(
        f"{API}/auth/login", json={"email": "victim@example.com", "password": DEFAULT_PASSWORD}
    )
    assert login.status_code == 200


def test_admin_cannot_deactivate_self(
    client: TestClient, admin_user: User, admin_headers: dict[str, str]
) -> None:
    resp = client.put(
        f"{API}/admin/users/{admin_user.id}", json={"is_active": False}, headers=admin_headers
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "CANNOT_MODIFY_SELF"


def test_refresh_rotation_and_reuse_detection(client: TestClient) -> None:
    first = _register_and_login(client)
    resp = client.post(f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert resp.status_code == 200
    second = resp.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert client.get(f"{API}/auth/me", headers=_h(second)).status_code == 200

    # Old token is now revoked; replaying it is treated as theft and revokes the new one too.
    replay = client.post(f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status_code == 401
    stolen = client.post(f"{API}/auth/refresh", json={"refresh_token": second["refresh_token"]})
    assert stolen.status_code == 401

    # An access token is not accepted as a refresh token.
    third = client.post(
        f"{API}/auth/login", json={"email": "flow@example.com", "password": DEFAULT_PASSWORD}
    ).json()
    wrong = client.post(f"{API}/auth/refresh", json={"refresh_token": third["access_token"]})
    assert wrong.status_code == 401

    # Logout revokes the refresh token.
    assert (
        client.post(
            f"{API}/auth/logout", json={"refresh_token": third["refresh_token"]}
        ).status_code
        == 204
    )
    after = client.post(f"{API}/auth/refresh", json={"refresh_token": third["refresh_token"]})
    assert after.status_code == 401


def test_protected_endpoints_require_auth(client: TestClient) -> None:
    for method, url in (
        ("get", f"{API}/auth/me"),
        ("get", f"{API}/submissions"),
        ("post", f"{API}/submissions"),
        ("get", f"{API}/share-links"),
        ("get", f"{API}/roasts/quota"),
        ("get", f"{API}/admin/users"),
    ):
        resp = client.request(method, url, json={})
        assert resp.status_code == 401, (method, url)
        assert resp.headers.get("www-authenticate") == "Bearer"
    bad = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert bad.status_code == 401


def test_expired_share_link_returns_404(
    client: TestClient, fake_openai: FakeOpenAI, auth_headers: dict[str, str], db: Session
) -> None:
    from datetime import datetime, timedelta, timezone

    submission_id = _paste(client, auth_headers)
    roast = _roast(client, auth_headers, submission_id)
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    link = client.post(
        f"{API}/roasts/{roast['id']}/share", json={"expires_at": future}, headers=auth_headers
    ).json()
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 200

    record = db.scalar(select(ShareLink).where(ShareLink.id == link["id"]))
    assert record is not None
    record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    assert client.get(f"{API}/public/roasts/{link['slug']}").status_code == 404
    assert client.get(f"{API}/public/roasts/does-not-exist-slug").status_code == 404
    assert client.get(f"{API}/public/roasts/{'x' * 100}").status_code == 404


# --------------------------------------------------------------------------- platform


def test_openapi_schema_lists_all_paths(client: TestClient) -> None:
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert schema["info"]["title"] == "Assignment Roaster API"
    paths = set(schema["paths"])
    expected = {
        "/health",
        f"{API}/auth/register",
        f"{API}/auth/login",
        f"{API}/auth/refresh",
        f"{API}/auth/logout",
        f"{API}/auth/me",
        f"{API}/auth/google",
        f"{API}/auth/google/callback",
        f"{API}/submissions",
        f"{API}/submissions/upload",
        f"{API}/submissions/{{submission_id}}",
        f"{API}/submissions/{{submission_id}}/roasts",
        f"{API}/roasts/quota",
        f"{API}/roasts/{{roast_id}}",
        f"{API}/roasts/{{roast_id}}/share",
        f"{API}/share-links",
        f"{API}/share-links/{{link_id}}",
        f"{API}/public/roasts/{{slug}}",
        f"{API}/admin/users",
        f"{API}/admin/users/{{user_id}}",
        f"{API}/admin/stats",
        f"{API}/admin/share-links",
        f"{API}/admin/share-links/{{link_id}}",
    }
    assert expected <= paths, expected - paths
    # Every non-health path is versioned.
    assert all(p.startswith(f"{API}/") for p in paths - {"/health"})
    # Every operation is documented with a summary/description and at least one response.
    for path, ops in schema["paths"].items():
        for method, op in ops.items():
            assert op.get("responses"), (path, method)
    assert client.get("/docs").status_code == 200


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "healthy"}


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    resp = client.get(f"{API}/nope")
    assert resp.status_code == 404
    assert set(resp.json()) >= {"detail", "code"}


def test_validation_error_envelope(client: TestClient) -> None:
    resp = client.post(f"{API}/auth/register", json={"email": "bad", "password": "x"})
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["errors"]


def test_conftest_user_fixture_can_login(client: TestClient, user: User, db: Session) -> None:
    resp = client.post(
        f"{API}/auth/login", json={"email": user.email, "password": DEFAULT_PASSWORD}
    )
    assert resp.status_code == 200
    assert db.get(User, user.id) is not None
