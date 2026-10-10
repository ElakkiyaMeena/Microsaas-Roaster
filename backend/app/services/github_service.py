"""
GitHub fetching for commits and whole repositories.

- Commits: strict commit-URL parsing, a single REST API call, and conversion of the commit's
  patches into the ``code_content`` text that gets roasted.
- Repositories: three REST API calls (repo, commit SHA, recursive tree), a filtered and ordered
  selection of files, and raw downloads from ``raw.githubusercontent.com`` at the resolved SHA.

Security notes:
- Only ``https://github.com/{owner}/{repo}/commit/{sha}`` (and pull-request commit) links and
  ``https://github.com/{owner}/{repo}[/tree/{ref}]`` links are accepted; owner/repo/sha/ref are
  validated with strict patterns before any request is made. Requests only ever go to
  ``https://api.github.com`` and ``https://raw.githubusercontent.com`` (fixed hosts, never taken
  from API responses) with redirects disabled. Private repositories are refused.
- Commit messages, patches and file contents are untrusted data. They are never executed and,
  like any other submitted code, are wrapped in escaped delimiters by ``roast_service``.
- ``GITHUB_TOKEN`` is never logged.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlsplit

import httpx

from app.config import ALLOWED_EXTENSIONS, settings
from app.exceptions import AppException, BadRequestError, RateLimitError, UpstreamError
from app.services.upload_service import TRUNCATION_MARKER, get_extension

logger = logging.getLogger(__name__)

GITHUB_API_BASE_URL = "https://api.github.com"
GITHUB_WEB_HOST = "github.com"
#: Hosts accepted in pasted links; API requests always go to api.github.com regardless.
GITHUB_WEB_HOSTS = frozenset({"github.com", "www.github.com"})
USER_AGENT = "assignment-roaster"
GITHUB_API_VERSION = "2022-11-28"

GITHUB_RAW_BASE_URL = "https://raw.githubusercontent.com"

MAX_COMMIT_FILES = 50
MAX_TITLE_LENGTH = 200
SHORT_SHA_LENGTH = 7

#: Whole-repository limits.
MAX_REPO_FILES = 40
MAX_STRUCTURE_PATHS = 150
MAX_REPO_PATH_LENGTH = 500
MAX_DESCRIPTION_LENGTH = 300
RAW_CONCURRENCY = 5
SUMMARY_LINE_RESERVE = 100
#: Folders whose contents are never roasted (vendored, generated or tooling files).
IGNORED_DIRS = frozenset(
    {
        "node_modules",
        "dist",
        "build",
        ".git",
        ".next",
        "vendor",
        "venv",
        ".venv",
        "env",
        "__pycache__",
        "coverage",
        "target",
        "out",
        ".idea",
        ".vscode",
    }
)
#: Lowercased lockfile names that are skipped even when their extension is allowed.
LOCKFILE_NAMES = frozenset(
    {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "poetry.lock",
        "pipfile.lock",
        "composer.lock",
        "cargo.lock",
        "go.sum",
    }
)
#: Extension-less (or otherwise unlisted) file names that are still worth roasting.
EXTRA_REPO_FILENAMES = frozenset({"README", "README.md", "Dockerfile", "Makefile"})
#: Documentation / config extensions, ordered after source code.
DOC_EXTENSIONS = frozenset({".md", ".json", ".txt"})

INVALID_URL_MESSAGE = "Paste a GitHub commit link like https://github.com/owner/repo/commit/abc1234"
NOT_FOUND_MESSAGE = "Commit not found. Is the repository public and the link correct?"
RATE_LIMITED_MESSAGE = "GitHub rate limit hit. Try again later."
UNAVAILABLE_MESSAGE = "GitHub is unavailable right now. Please try again in a minute."
NO_PATCH_MESSAGE = "This commit has no text changes to roast."
INVALID_ANY_URL_MESSAGE = (
    "Paste a GitHub repository or commit link, like https://github.com/owner/repo"
)
REPO_NOT_FOUND_MESSAGE = "Repository not found. Is it public and the link correct?"
NO_REPO_FILES_MESSAGE = "This repository has no code files we can roast."

_NAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$")
_SHA_RE = re.compile(r"^[0-9a-fA-F]{7,40}$")
_FULL_SHA_RE = re.compile(r"^[0-9a-f]{40}(?:[0-9a-f]{24})?$")
_REF_RE = re.compile(r"^[A-Za-z0-9._/-]{1,100}$")

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
class RepoRef:
    """A validated reference to a GitHub repository, optionally pinned to a branch/tag/SHA."""

    owner: str
    repo: str
    ref: str | None = None

    @property
    def canonical_url(self) -> str:
        """``https://github.com/{owner}/{repo}`` (plus ``/tree/{ref}`` when a ref was given)."""
        base = f"https://github.com/{self.owner}/{self.repo}"
        return f"{base}/tree/{self.ref}" if self.ref else base


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


def _github_path_segments(url: str) -> list[str] | None:
    """
    Split an untrusted ``https://github.com/...`` link into its path segments.

    The scheme must be ``https``, the host ``github.com`` / ``www.github.com`` (no userinfo or
    port), and the URL at most 500 characters with no whitespace. One trailing slash is
    ignored; the query string and fragment are dropped.

    Args:
        url: Untrusted user-supplied URL.

    Returns:
        The (still percent-encoded) path segments, or ``None`` when the URL is not acceptable.
    """
    candidate = (url or "").strip()
    if not candidate or len(candidate) > 500 or any(c.isspace() for c in candidate):
        return None
    try:
        parts = urlsplit(candidate)
        port = parts.port
    except ValueError:
        return None
    if (
        parts.scheme != "https"
        or parts.netloc.lower() not in GITHUB_WEB_HOSTS
        or parts.username is not None
        or port is not None
    ):
        return None
    path = parts.path
    if path.endswith("/"):
        path = path[:-1]
    segments = path.split("/")
    # A leading "/" gives an empty first segment.
    if not segments or segments[0] != "":
        return None
    return segments[1:]


def _match_commit(segments: list[str]) -> CommitRef | None:
    """Match commit / pull-request-commit path segments; ``None`` if they are not a commit link."""
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
        return None
    if not (_is_valid_name(owner) and _is_valid_name(repo) and _SHA_RE.fullmatch(sha)):
        return None
    return CommitRef(owner=owner, repo=repo, sha=sha.lower())


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
    segments = _github_path_segments(url)
    ref = _match_commit(segments) if segments is not None else None
    if ref is None:
        raise BadRequestError(INVALID_URL_MESSAGE, "INVALID_GITHUB_URL")
    return ref


def is_valid_ref(ref: str) -> bool:
    """
    True if ``ref`` is an acceptable branch / tag / SHA name.

    Allowed: 1-100 characters from ``[A-Za-z0-9._/-]``, no ``..``, no leading ``/`` or ``-``,
    no trailing ``/`` and no empty or ``.`` path components.
    """
    if not _REF_RE.fullmatch(ref) or ".." in ref or ref[0] in "/-" or ref.endswith("/"):
        return False
    return all(part not in {"", "."} for part in ref.split("/"))


def _match_repo(segments: list[str]) -> RepoRef | None:
    """Match repository (optionally ``/tree/{ref}``) path segments; ``None`` otherwise."""
    ref: str | None = None
    if len(segments) == 2:
        owner, repo = segments
        if repo.endswith(".git") and len(repo) > len(".git"):
            repo = repo[: -len(".git")]
    elif len(segments) >= 4 and segments[2] == "tree":
        owner, repo = segments[0], segments[1]
        ref = "/".join(segments[3:])
        if not is_valid_ref(ref):
            return None
    else:
        return None
    if not (_is_valid_name(owner) and _is_valid_name(repo)):
        return None
    return RepoRef(owner=owner, repo=repo, ref=ref)


def parse_github_url(url: str) -> CommitRef | RepoRef:
    """
    Parse a GitHub link that may point at either a commit or a whole repository.

    Commit links use the same patterns as ``parse_commit_url``. Repository links are
    ``https://github.com/{owner}/{repo}`` (optionally ``.git``, trailing slash, query,
    fragment) or ``https://github.com/{owner}/{repo}/tree/{ref}``.

    Args:
        url: Untrusted user-supplied URL.

    Returns:
        A ``CommitRef`` for commit links, otherwise a ``RepoRef``.

    Raises:
        BadRequestError: 400 ``INVALID_GITHUB_URL`` for anything else.
    """
    segments = _github_path_segments(url)
    if segments is not None:
        match = _match_commit(segments) or _match_repo(segments)
        if match is not None:
            return match
    raise BadRequestError(INVALID_ANY_URL_MESSAGE, "INVALID_GITHUB_URL")


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
    not_found = AppException(NOT_FOUND_MESSAGE, "GITHUB_COMMIT_NOT_FOUND", 404)
    async with get_http_client() as client:
        response = await _api_get(
            client, f"/repos/{ref.owner}/{ref.repo}/commits/{ref.sha}", not_found
        )
    return _json_object(response)


def _raise_for_status(
    response: httpx.Response, not_found: AppException, conflict: AppException | None = None
) -> None:
    """
    Map a non-success GitHub API response to the application's error codes.

    Args:
        response: The API response.
        not_found: Raised for 404 / 422.
        conflict: Raised for 409 when given (e.g. an empty repository).

    Raises:
        AppException: ``not_found`` / ``conflict`` as described above.
        RateLimitError: 429 ``GITHUB_RATE_LIMITED`` when GitHub's rate limit is hit.
        UpstreamError: 502 ``GITHUB_UNAVAILABLE`` for auth, redirect, server and other errors.
    """
    status_code = response.status_code
    if 200 <= status_code < 300:
        return
    if status_code in (404, 422):
        raise not_found
    if status_code == 409 and conflict is not None:
        raise conflict
    if status_code in (403, 429) and _is_rate_limited(response):
        logger.warning(
            "GitHub API rate limit hit (status %d); set GITHUB_TOKEN to raise the limit",
            status_code,
        )
        raise RateLimitError(RATE_LIMITED_MESSAGE, "GITHUB_RATE_LIMITED")
    if status_code == 401:
        logger.warning("GitHub rejected the configured credentials (401); check GITHUB_TOKEN")
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE")
    logger.warning("GitHub returned unexpected status %d", status_code)
    raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE")


async def _api_get(
    client: httpx.AsyncClient,
    path: str,
    not_found: AppException,
    *,
    accept: str | None = None,
    params: dict[str, str] | None = None,
    conflict: AppException | None = None,
) -> httpx.Response:
    """
    Perform one GitHub REST API GET and map errors (see ``_raise_for_status``).

    Raises:
        UpstreamError: 502 ``GITHUB_UNAVAILABLE`` on timeouts and transport errors.
    """
    headers = _request_headers()
    if accept is not None:
        headers["Accept"] = accept
    try:
        response = await client.get(path, headers=headers, params=params)
    except httpx.TimeoutException as exc:
        logger.warning("GitHub request timed out")
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE") from exc
    except httpx.HTTPError as exc:
        logger.warning("GitHub request failed: %s", type(exc).__name__)
        raise UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE") from exc
    _raise_for_status(response, not_found, conflict)
    return response


def _json_object(response: httpx.Response) -> dict[str, Any]:
    """Decode a JSON object body; anything else is a 502 ``GITHUB_UNAVAILABLE``."""
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


# --------------------------------------------------------------------------- whole repositories


@dataclass(frozen=True)
class RepoTreeEntry:
    """One blob (file) from a repository's recursive git tree."""

    path: str
    size: int


@dataclass(frozen=True)
class RepoSnapshot:
    """Repository metadata plus its file list at a resolved commit."""

    owner: str
    repo: str
    ref: str
    sha: str
    description: str
    blobs: list[RepoTreeEntry]
    truncated: bool


@dataclass(frozen=True)
class RepoContent:
    """Roastable content built from a repository snapshot."""

    title_default: str
    code_content: str
    language_guess: str
    canonical_url: str
    file_count: int


@dataclass(frozen=True)
class _Download:
    """Outcome of downloading one raw file (``text`` is ``None`` when skipped or failed)."""

    entry: RepoTreeEntry
    text: str | None
    failed: bool


def get_raw_http_client() -> httpx.AsyncClient:
    """
    Build the async HTTP client for raw file downloads. Module-level so tests can monkeypatch it.

    Returns:
        An ``httpx.AsyncClient`` bound to ``https://raw.githubusercontent.com`` with redirects
        disabled (the host is fixed and never derived from API responses).
    """
    return httpx.AsyncClient(
        base_url=GITHUB_RAW_BASE_URL,
        timeout=settings.GITHUB_TIMEOUT_SECONDS,
        follow_redirects=False,
    )


def _raw_headers() -> dict[str, str]:
    """Headers for raw.githubusercontent.com downloads (token only when configured)."""
    headers = {"User-Agent": USER_AGENT}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


def _repo_not_found() -> AppException:
    """The 404 ``GITHUB_REPO_NOT_FOUND`` error (repository, ref or tree missing / private)."""
    return AppException(REPO_NOT_FOUND_MESSAGE, "GITHUB_REPO_NOT_FOUND", 404)


def _no_repo_files() -> BadRequestError:
    """The 400 ``NO_READABLE_FILES`` error for repositories."""
    return BadRequestError(NO_REPO_FILES_MESSAGE, "NO_READABLE_FILES")


def _unavailable() -> UpstreamError:
    """The 502 ``GITHUB_UNAVAILABLE`` error for malformed API data."""
    return UpstreamError(UNAVAILABLE_MESSAGE, "GITHUB_UNAVAILABLE")


def _parse_sha(response: httpx.Response) -> str:
    """Read a full commit SHA from a ``application/vnd.github.sha`` (or JSON) response."""
    sha = response.text.strip().lower()
    if _FULL_SHA_RE.fullmatch(sha):
        return sha
    try:
        data = response.json()
    except ValueError:
        data = None
    sha = str(data.get("sha") or "").lower() if isinstance(data, dict) else ""
    if not _FULL_SHA_RE.fullmatch(sha):
        logger.warning("GitHub returned an unexpected commit SHA body")
        raise _unavailable()
    return sha


def _parse_tree(data: dict[str, Any]) -> list[RepoTreeEntry]:
    """Extract blob entries (path + size) from a recursive git tree response."""
    tree = data.get("tree")
    if not isinstance(tree, list):
        logger.warning("GitHub returned a tree without entries")
        raise _unavailable()
    blobs: list[RepoTreeEntry] = []
    for item in tree:
        if not isinstance(item, dict) or item.get("type") != "blob":
            continue
        path = item.get("path")
        if not isinstance(path, str) or not path or len(path) > MAX_REPO_PATH_LENGTH:
            continue
        blobs.append(RepoTreeEntry(path=path, size=_as_int(item.get("size"))))
    return blobs


async def fetch_repo_snapshot(ref: RepoRef) -> RepoSnapshot:
    """
    Resolve a repository reference to a commit and list its files (exactly 3 API calls).

    1. ``GET /repos/{o}/{r}`` for the default branch, description and visibility.
    2. ``GET /repos/{o}/{r}/commits/{ref}`` (``application/vnd.github.sha``) for the commit SHA.
    3. ``GET /repos/{o}/{r}/git/trees/{sha}?recursive=1`` for the file list.

    Args:
        ref: Validated repository reference.

    Returns:
        The repository snapshot.

    Raises:
        AppException: 404 ``GITHUB_REPO_NOT_FOUND`` when the repo/ref is missing or private.
        BadRequestError: 400 ``NO_READABLE_FILES`` for an empty repository.
        RateLimitError: 429 ``GITHUB_RATE_LIMITED`` when GitHub's rate limit is hit.
        UpstreamError: 502 ``GITHUB_UNAVAILABLE`` for auth, server, timeout or transport errors.
    """
    base = f"/repos/{ref.owner}/{ref.repo}"
    async with get_http_client() as client:
        repo_data = _json_object(await _api_get(client, base, _repo_not_found()))
        if repo_data.get("private") is True:
            # Only public repositories can be roasted, even when a token could read others.
            raise _repo_not_found()
        target = ref.ref or str(repo_data.get("default_branch") or "")
        if not is_valid_ref(target):
            logger.warning("GitHub returned an unusable default branch")
            raise _unavailable()
        sha_response = await _api_get(
            client,
            f"{base}/commits/{target}",
            _repo_not_found(),
            accept="application/vnd.github.sha",
            conflict=_no_repo_files(),
        )
        sha = _parse_sha(sha_response)
        tree_data = _json_object(
            await _api_get(
                client,
                f"{base}/git/trees/{sha}",
                _repo_not_found(),
                params={"recursive": "1"},
            )
        )
    description = repo_data.get("description")
    return RepoSnapshot(
        owner=ref.owner,
        repo=ref.repo,
        ref=target,
        sha=sha,
        description=" ".join(description.split()) if isinstance(description, str) else "",
        blobs=_parse_tree(tree_data),
        truncated=tree_data.get("truncated") is True,
    )


def _in_ignored_dir(path: str) -> bool:
    """True if any directory component of ``path`` is a vendored / build / tooling folder."""
    return any(part in IGNORED_DIRS for part in path.split("/")[:-1])


def _file_category(path: str) -> int:
    """Sort bucket: 0 = source code, 1 = README, 2 = other docs / config."""
    name = path.rsplit("/", 1)[-1]
    if name.upper().startswith("README"):
        return 1
    if get_extension(name) in DOC_EXTENSIONS:
        return 2
    return 0


def is_selectable_file(entry: RepoTreeEntry) -> bool:
    """
    True if a tree blob is worth roasting.

    Requires an allowed extension (zip excluded) or an exact name such as ``README`` /
    ``Dockerfile``; rejects hidden or vendored paths, lockfiles, minified bundles, source maps,
    empty files and files larger than ``MAX_FILE_SIZE_BYTES``.
    """
    parts = entry.path.split("/")
    if any(not part or part.startswith(".") or part in IGNORED_DIRS for part in parts):
        return False
    name = parts[-1]
    lower = name.lower()
    ext = get_extension(name)
    if not ((ext in ALLOWED_EXTENSIONS and ext != ".zip") or name in EXTRA_REPO_FILENAMES):
        return False
    if lower in LOCKFILE_NAMES or lower.endswith((".min.js", ".min.css", ".map")):
        return False
    return 0 < entry.size <= settings.MAX_FILE_SIZE_BYTES


def select_repo_files(blobs: list[RepoTreeEntry]) -> list[RepoTreeEntry]:
    """
    Filter and order the repository files to download (no count/budget cap applied here).

    Order: source code first, then READMEs, then other docs/config; within each group
    shallower paths first, then alphabetical.

    Args:
        blobs: All blobs from the repository tree.

    Returns:
        The eligible files in roast order.
    """
    eligible = [entry for entry in blobs if is_selectable_file(entry)]
    return sorted(
        eligible,
        key=lambda e: (_file_category(e.path), e.path.count("/"), e.path.lower(), e.path),
    )


def _raw_path(snapshot: RepoSnapshot, path: str) -> str:
    """Build the raw.githubusercontent.com path with every segment URL-quoted."""
    segments = [snapshot.owner, snapshot.repo, snapshot.sha, *path.split("/")]
    return "/" + "/".join(quote(segment, safe="") for segment in segments)


def _decode_text(data: bytes) -> str | None:
    """Decode UTF-8 (BOM tolerated) text; ``None`` for binary or undecodable content."""
    if b"\x00" in data:
        return None
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None


async def _download_raw_file(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    snapshot: RepoSnapshot,
    entry: RepoTreeEntry,
) -> _Download:
    """Download one file at the snapshot's commit; failures are reported, never raised."""
    async with semaphore:
        try:
            response = await client.get(_raw_path(snapshot, entry.path), headers=_raw_headers())
        except httpx.HTTPError as exc:
            logger.warning("GitHub raw download failed: %s", type(exc).__name__)
            return _Download(entry=entry, text=None, failed=True)
    if response.status_code != 200:
        logger.warning("GitHub raw download returned status %d", response.status_code)
        return _Download(entry=entry, text=None, failed=True)
    data = response.content
    if len(data) > settings.MAX_FILE_SIZE_BYTES:
        return _Download(entry=entry, text=None, failed=False)
    return _Download(entry=entry, text=_decode_text(data), failed=False)


def _file_block(path: str, text: str) -> str:
    """One ``// ===== FILE: ... =====`` block."""
    return f"// ===== FILE: {path} =====\n{text}\n"


async def download_repo_files(
    snapshot: RepoSnapshot, candidates: list[RepoTreeEntry], budget_chars: int
) -> tuple[list[tuple[str, str]], int]:
    """
    Download candidate files in order until ``MAX_REPO_FILES`` or the character budget is hit.

    Downloads run in small waves with at most ``RAW_CONCURRENCY`` concurrent requests.
    Binary / undecodable files are skipped silently.

    Args:
        snapshot: The repository snapshot (owner/repo/sha).
        candidates: Files in roast order (from ``select_repo_files``).
        budget_chars: Stop adding files once the blocks reach this many characters.

    Returns:
        ``(included, omitted)``: ``(path, text)`` pairs in order, and how many candidates
        were left out because a limit was reached.

    Raises:
        BadRequestError: 400 ``NO_READABLE_FILES`` when no candidate is readable text.
        UpstreamError: 502 ``GITHUB_UNAVAILABLE`` when nothing could be downloaded at all.
    """
    included: list[tuple[str, str]] = []
    used = 0
    processed = 0
    any_failed = False
    semaphore = asyncio.Semaphore(RAW_CONCURRENCY)
    wave_size = RAW_CONCURRENCY * 2
    async with get_raw_http_client() as client:
        while (
            processed < len(candidates) and len(included) < MAX_REPO_FILES and used < budget_chars
        ):
            wave = candidates[processed : processed + wave_size]
            results = await asyncio.gather(
                *(_download_raw_file(client, semaphore, snapshot, entry) for entry in wave)
            )
            for result in results:
                if len(included) >= MAX_REPO_FILES or used >= budget_chars:
                    break
                processed += 1
                any_failed = any_failed or result.failed
                if result.text is None:
                    continue
                included.append((result.entry.path, result.text))
                used += len(_file_block(result.entry.path, result.text)) + 1
    if not included:
        if any_failed:
            raise _unavailable()
        raise _no_repo_files()
    return included, len(candidates) - processed


def _structure_paths(blobs: list[RepoTreeEntry]) -> list[str]:
    """Repository paths shown in the structure listing (vendored/build folders hidden)."""
    return [entry.path for entry in blobs if not _in_ignored_dir(entry.path)]


def _repo_header_lines(snapshot: RepoSnapshot) -> list[str]:
    """Header lines up to and including the structure listing."""
    description = snapshot.description[:MAX_DESCRIPTION_LENGTH] or "-"
    paths = _structure_paths(snapshot.blobs)
    lines = [
        f"// ===== REPOSITORY: {snapshot.owner}/{snapshot.repo}@{snapshot.ref} "
        f"({snapshot.sha[:SHORT_SHA_LENGTH]}) =====",
        f"// Description: {description}",
        f"// Files in repo: {len(snapshot.blobs)}"
        + (" (tree truncated by GitHub)" if snapshot.truncated else ""),
        "// Structure:",
        *(f"//   {path}" for path in paths[:MAX_STRUCTURE_PATHS]),
    ]
    if len(paths) > MAX_STRUCTURE_PATHS:
        lines.append(f"//   ... and {len(paths) - MAX_STRUCTURE_PATHS} more")
    return lines


def build_repo_content(
    snapshot: RepoSnapshot,
    ref: RepoRef,
    included: list[tuple[str, str]],
    omitted: int,
    max_chars: int | None = None,
) -> RepoContent:
    """
    Turn a repository snapshot and its downloaded files into roastable text.

    Args:
        snapshot: The repository snapshot.
        ref: The reference the user asked for (used for the canonical URL).
        included: ``(path, text)`` pairs in roast order.
        omitted: Number of eligible files left out because a limit was reached.
        max_chars: Character limit (defaults to ``settings.MAX_CODE_CHARS``).

    Returns:
        The built content, default title, language guess and canonical repository URL.

    Raises:
        BadRequestError: 400 ``NO_READABLE_FILES`` when ``included`` is empty.
    """
    if not included:
        raise _no_repo_files()
    limit = settings.MAX_CODE_CHARS if max_chars is None else max_chars
    summary = f"// Included below: {len(included)} files"
    if omitted:
        summary += f"; omitted (limit reached): {omitted}"
    header = "\n".join([*_repo_header_lines(snapshot), summary]) + "\n"
    blocks = [_file_block(path, text) for path, text in included]
    return RepoContent(
        title_default=f"{snapshot.owner}/{snapshot.repo}"[:MAX_TITLE_LENGTH],
        code_content=_truncate(header + "\n" + "\n".join(blocks), limit),
        language_guess=guess_language([path for path, _ in included]),
        canonical_url=ref.canonical_url,
        file_count=len(included),
    )


async def fetch_repo_content(ref: RepoRef, max_chars: int | None = None) -> RepoContent:
    """
    Fetch a public repository and build its roastable snapshot text.

    Args:
        ref: Validated repository reference.
        max_chars: Character limit (defaults to ``settings.MAX_CODE_CHARS``).

    Returns:
        The repository content ready to store as a submission.

    Raises:
        AppException: 404 ``GITHUB_REPO_NOT_FOUND``, 400 ``NO_READABLE_FILES``,
            429 ``GITHUB_RATE_LIMITED`` or 502 ``GITHUB_UNAVAILABLE``.
    """
    limit = settings.MAX_CODE_CHARS if max_chars is None else max_chars
    snapshot = await fetch_repo_snapshot(ref)
    candidates = select_repo_files(snapshot.blobs)
    if not candidates:
        raise _no_repo_files()
    # Reserve room for the header and the "Included below" summary line.
    header_chars = len("\n".join(_repo_header_lines(snapshot))) + SUMMARY_LINE_RESERVE
    included, omitted = await download_repo_files(
        snapshot, candidates, max(limit - header_chars, 1)
    )
    return build_repo_content(snapshot, ref, included, omitted, limit)
