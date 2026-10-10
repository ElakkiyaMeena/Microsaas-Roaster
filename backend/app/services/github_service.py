"""
GitHub commit fetching: strict commit-URL parsing, a single REST API call, and conversion of
the commit's patches into the ``code_content`` text that gets roasted.

Security notes:
- Only ``https://github.com/{owner}/{repo}/commit/{sha}`` (and pull-request commit) links are
  accepted; the owner/repo/sha are validated with strict patterns before any request is made,
  and requests only ever go to ``https://api.github.com`` with redirects disabled.
- Commit messages and patches are untrusted data. They are never executed and, like any other
  submitted code, are wrapped in escaped delimiters by ``roast_service``.
- ``GITHUB_TOKEN`` is never logged.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.config import settings
from app.exceptions import AppException, BadRequestError, RateLimitError, UpstreamError
from app.services.upload_service import TRUNCATION_MARKER, get_extension

logger = logging.getLogger(__name__)

GITHUB_API_BASE_URL = "https://api.github.com"
GITHUB_WEB_HOST = "github.com"
#: Hosts accepted in pasted links; API requests always go to api.github.com regardless.
GITHUB_WEB_HOSTS = frozenset({"github.com", "www.github.com"})
USER_AGENT = "assignment-roaster"
GITHUB_API_VERSION = "2022-11-28"

MAX_COMMIT_FILES = 50
MAX_TITLE_LENGTH = 200
SHORT_SHA_LENGTH = 7

INVALID_URL_MESSAGE = "Paste a GitHub commit link like https://github.com/owner/repo/commit/abc1234"
NOT_FOUND_MESSAGE = "Commit not found. Is the repository public and the link correct?"
RATE_LIMITED_MESSAGE = "GitHub rate limit hit. Try again later."
UNAVAILABLE_MESSAGE = "GitHub is unavailable right now. Please try again in a minute."
NO_PATCH_MESSAGE = "This commit has no text changes to roast."

_NAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$")
_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")

#: File extension (lowercase, with dot) -> value from ``ALLOWED_LANGUAGES``.
EXTENSION_LANGUAGES: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".html": "html_css",
    ".css": "html_css",
    ".scss": "html_css",
    ".sql": "sql",
}


@dataclass(frozen=True)
class CommitRef:
    """A validated reference to a commit in a GitHub repository."""

    owner: str
    repo: str
    sha: str


@dataclass(frozen=True)
class CommitContent:
    """Roastable content built from a GitHub commit API response."""

    title_default: str
    code_content: str
    language_guess: str
    canonical_url: str
    file_count: int


def _is_valid_name(value: str) -> bool:
    """True if ``value`` is a plausible GitHub owner or repository name."""
    return value not in {".", ".."} and _NAME_RE.fullmatch(value) is not None


def parse_commit_url(url: str) -> CommitRef:
    """
    Parse and strictly validate a GitHub commit URL.

    Accepted forms (optional trailing slash, query string and fragment):
    ``https://github.com/{owner}/{repo}/commit/{sha}`` and
    ``https://github.com/{owner}/{repo}/pull/{n}/commits/{sha}``.

    Args:
        url: Untrusted user-supplied URL.

    Returns:
        The owner, repository and commit SHA.

    Raises:
        BadRequestError: 400 ``INVALID_GITHUB_URL`` for anything else.
    """
    invalid = BadRequestError(INVALID_URL_MESSAGE, "INVALID_GITHUB_URL")
    candidate = (url or "").strip()
    if not candidate or len(candidate) > 500 or any(c.isspace() for c in candidate):
        raise invalid
    try:
        parts = urlsplit(candidate)
        port = parts.port
    except ValueError as exc:
        raise invalid from exc
    if (
        parts.scheme != "https"
        or parts.netloc.lower() not in GITHUB_WEB_HOSTS
        or parts.username is not None
        or port is not None
    ):
        raise invalid
    path = parts.path
    if path.endswith("/"):
        path = path[:-1]
    segments = path.split("/")
    # A leading "/" gives an empty first segment.
    if not segments or segments[0] != "":
        raise invalid
    segments = segments[1:]
    if len(segments) == 4 and segments[2] == "commit":
        owner, repo, _, sha = segments
    elif (
        len(segments) == 6
        and segments[2] == "pull"
        and segments[3].isdigit()
        and segments[4] == "commits"
    ):
        owner, repo, _, _, _, sha = segments
    else:
        raise invalid
    if not (_is_valid_name(owner) and _is_valid_name(repo) and _SHA_RE.fullmatch(sha)):
        raise invalid
    return CommitRef(owner=owner, repo=repo, sha=sha.lower())


def get_http_client() -> httpx.AsyncClient:
    """
    Build the async HTTP client for the GitHub API. Module-level so tests can monkeypatch it.

    Returns:
        An ``httpx.AsyncClient`` bound to ``https://api.github.com`` with redirects disabled.
    """
    return httpx.AsyncClient(
        base_url=GITHUB_API_BASE_URL,
        timeout=settings.GITHUB_TIMEOUT_SECONDS,
        follow_redirects=False,
    )


def _request_headers() -> dict[str, str]:
    """Headers for GitHub REST API calls (adds the bearer token only when configured)."""
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
    }
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


def _is_rate_limited(response: httpx.Response) -> bool:
    """True if a 403/429 response from GitHub signals a (primary or secondary) rate limit."""
    if response.status_code == 429:
        return True
    if response.headers.get("x-ratelimit-remaining") == "0":
        return True
    if "retry-after" in response.headers:
        return True
    return "rate limit" in response.text.lower()


async def fetch_commit(ref: CommitRef) -> dict[str, Any]:
    """
    Fetch a commit (with file patches) from the GitHub REST API.

    Args:
        ref: Validated commit reference.

    Returns:
        The decoded JSON body of ``GET /repos/{owner}/{repo}/commits/{sha}``.

    Raises:
        AppException: 404 ``GITHUB_COMMIT_NOT_FOUND`` when the commit/repo is missing or private.
        RateLimitError: 429 ``GITHUB_RATE_LIMITED`` when GitHub's rate limit is hit.
        UpstreamError: 502 ``GITHUB_UNAVAILABLE`` for auth, server, timeout or transport errors.
    """
    path = f"/repos/{ref.owner}/{ref.repo}/commits/{ref.sha}"
    try:
        async with get_http_client() as client:
            response = await client.get(path, headers=_request_headers())
    except httpx.TimeoutException as exc:
        logger.warning("GitHub request timed out for %s/%s", ref.owner, ref.repo)
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE") from exc
    except httpx.HTTPError as exc:
        logger.warning("GitHub request failed: %s", type(exc).__name__)
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE") from exc

    status_code = response.status_code
    if status_code in (404, 422):
        raise AppException(NOT_FOUND_MESSAGE, "GITHUB_COMMIT_NOT_FOUND", 404)
    if status_code in (403, 429) and _is_rate_limited(response):
        logger.warning(
            "GitHub API rate limit hit (status %d); set GITHUB_TOKEN to raise the limit",
            status_code,
        )
        raise RateLimitError(RATE_LIMITED_MESSAGE, "GITHUB_RATE_LIMITED")
    if status_code == 401:
        logger.warning("GitHub rejected the configured credentials (401); check GITHUB_TOKEN")
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE")
    if not 200 <= status_code < 300:
        logger.warning("GitHub returned unexpected status %d", status_code)
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE")
    try:
        data = response.json()
    except ValueError as exc:
        logger.warning("GitHub returned a non-JSON body")
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE") from exc
    if not isinstance(data, dict):
        logger.warning("GitHub returned an unexpected JSON shape")
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE")
    return data


def _as_int(value: Any) -> int:
    """Coerce an API number to ``int`` (anything invalid becomes 0)."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def guess_language(filenames: list[str]) -> str:
    """
    Guess the submission language from the most common recognised extension.

    Args:
        filenames: Changed file paths.

    Returns:
        A value from ``ALLOWED_LANGUAGES`` (``"other"`` when nothing is recognised).
    """
    counts = Counter(
        EXTENSION_LANGUAGES[ext]
        for name in filenames
        if (ext := get_extension(name)) in EXTENSION_LANGUAGES
    )
    if not counts:
        return "other"
    return counts.most_common(1)[0][0]


def _truncate(text: str, limit: int) -> str:
    """Cut ``text`` to ``limit`` characters, ending with the shared truncation marker."""
    if len(text) <= limit:
        return text
    return text[: max(limit - len(TRUNCATION_MARKER), 0)] + TRUNCATION_MARKER


def build_commit_content(
    data: dict[str, Any], ref: CommitRef, max_chars: int | None = None
) -> CommitContent:
    """
    Turn a GitHub commit API response into roastable text.

    The result starts with a ``// ===== COMMIT ... =====`` header (author, message, stats)
    followed by one ``// ===== FILE: ... =====`` block per changed file (max 50) containing
    its unified-diff patch. Files without a patch (binary or too large) are listed as skipped.

    Args:
        data: Decoded JSON from ``fetch_commit``.
        ref: The commit reference the data was fetched for.
        max_chars: Character limit (defaults to ``settings.MAX_CODE_CHARS``).

    Returns:
        The built content, default title, language guess and canonical commit URL.

    Raises:
        BadRequestError: 400 ``NO_READABLE_FILES`` when no file has a textual patch.
    """
    limit = settings.MAX_CODE_CHARS if max_chars is None else max_chars
    sha = str(data.get("sha") or ref.sha).lower()
    if not _SHA_RE.fullmatch(sha):
        sha = ref.sha
    sha7 = sha[:SHORT_SHA_LENGTH]
    commit = data.get("commit") if isinstance(data.get("commit"), dict) else {}
    author = commit.get("author") if isinstance(commit.get("author"), dict) else {}
    author_name = str(author.get("name") or "unknown")
    message = str(commit.get("message") or "").strip()
    raw_files = data.get("files") if isinstance(data.get("files"), list) else []
    files = [f for f in raw_files if isinstance(f, dict)]
    stats = data.get("stats") if isinstance(data.get("stats"), dict) else {}
    additions = _as_int(stats.get("additions"))
    deletions = _as_int(stats.get("deletions"))

    message_lines = message.splitlines() or ["(no message)"]
    header_lines = [
        f"// ===== COMMIT: {ref.owner}/{ref.repo}@{sha7} =====",
        f"// Author: {author_name}",
        "// Message:",
        *(f"// {line}".rstrip() for line in message_lines),
        f"// Stats: {len(files)} files changed, +{additions} -{deletions}",
    ]

    blocks: list[str] = []
    skipped: list[str] = []
    filenames: list[str] = []
    for item in files[:MAX_COMMIT_FILES]:
        filename = str(item.get("filename") or "unknown")
        filenames.append(filename)
        patch = item.get("patch")
        if not isinstance(patch, str) or not patch.strip():
            skipped.append(f"// (skipped: {filename} — binary or too large)")
            continue
        blocks.append(
            f"// ===== FILE: {filename} ({item.get('status') or 'modified'}, "
            f"+{_as_int(item.get('additions'))}/-{_as_int(item.get('deletions'))}) =====\n"
            f"{patch}\n"
        )
    if not blocks:
        raise BadRequestError(NO_PATCH_MESSAGE, "NO_READABLE_FILES")
    if len(files) > MAX_COMMIT_FILES:
        skipped.append(f"// (skipped: {len(files) - MAX_COMMIT_FILES} more files — limit reached)")

    header = "\n".join(header_lines + skipped) + "\n"
    code_content = _truncate(header + "\n" + "\n".join(blocks), limit)

    first_line = message_lines[0].strip() or "(no message)"
    title_default = f"{ref.repo}@{sha7}: {first_line}"[:MAX_TITLE_LENGTH].strip()
    return CommitContent(
        title_default=title_default,
        code_content=code_content,
        language_guess=guess_language(filenames),
        canonical_url=f"https://github.com/{ref.owner}/{ref.repo}/commit/{sha}",
        file_count=len(blocks),
    )
