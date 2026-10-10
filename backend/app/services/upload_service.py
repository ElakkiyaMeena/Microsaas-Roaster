"""
Upload handling: size-limited reading, extension allow-listing, safe zip extraction,
text decoding, code concatenation and on-disk storage.

Uploaded code is treated strictly as data: it is never executed, imported or evaluated.
"""

from __future__ import annotations

import io
import logging
import mimetypes
import re
import shutil
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from fastapi import UploadFile

from app.config import ALLOWED_EXTENSIONS, settings
from app.exceptions import BadRequestError, PayloadTooLargeError

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024
ZIP_EXTENSION = ".zip"
#: Maximum total uncompressed size of a zip, as a multiple of ``MAX_ZIP_SIZE_BYTES``.
ZIP_UNCOMPRESSED_FACTOR = 10
MAX_FILENAME_LENGTH = 255
FILE_HEADER_TEMPLATE = "// ===== FILE: {name} =====\n{text}\n"
TRUNCATION_MARKER = "\n// [truncated]"

_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._\- ]")
_DRIVE_LETTER = re.compile(r"^[A-Za-z]:")
_WINDOWS_RESERVED = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{i}" for i in range(1, 10)}
    | {f"LPT{i}" for i in range(1, 10)}
)


@dataclass
class ExtractedFile:
    """A readable text file extracted from an upload (direct file or zip member)."""

    name: str
    text: str
    content_type: str
    size_bytes: int


@dataclass
class StoredFile:
    """An extracted file persisted to disk; ``storage_path`` is relative to ``UPLOAD_DIR``."""

    file: ExtractedFile
    storage_path: str


@dataclass
class _Candidate:
    """Raw bytes of an allowed file awaiting decoding."""

    name: str
    data: bytes


def get_extension(filename: str) -> str:
    """Return the lowercase extension (with leading dot) of the last path component."""
    return PurePosixPath(filename.replace("\\", "/")).suffix.lower()


def is_allowed_text_extension(filename: str) -> bool:
    """True if ``filename`` has an allowed, non-archive extension."""
    ext = get_extension(filename)
    return ext in ALLOWED_EXTENSIONS and ext != ZIP_EXTENSION


def _sanitize_component(part: str) -> str:
    """Sanitize a single path component; returns an empty string if nothing usable remains."""
    cleaned = _UNSAFE_CHARS.sub("_", part).strip(" ")
    if cleaned in {"", ".", ".."}:
        return ""
    stem = cleaned.split(".", 1)[0].upper()
    if stem in _WINDOWS_RESERVED:
        cleaned = f"_{cleaned}"
    return cleaned


def sanitize_filename(name: str, keep_dirs: bool = True) -> str:
    """
    Turn an untrusted filename into a safe relative POSIX path.

    Backslashes are treated as separators, ``.``/``..``/empty components are dropped,
    unsafe characters are replaced with ``_`` and the result is capped at 255 characters
    (preserving the extension where possible).

    Args:
        name: Untrusted filename or relative path.
        keep_dirs: Keep directory components (zip members) or only the basename (direct uploads).

    Returns:
        A non-empty safe relative path.
    """
    raw_parts = name.replace("\\", "/").split("/")
    if not keep_dirs:
        raw_parts = raw_parts[-1:]
    parts = [p for p in (_sanitize_component(part) for part in raw_parts) if p]
    safe = "/".join(parts) or "file"
    if len(safe) > MAX_FILENAME_LENGTH:
        ext = get_extension(safe)
        if ext and len(ext) < MAX_FILENAME_LENGTH:
            safe = safe[: MAX_FILENAME_LENGTH - len(ext)] + ext
        else:
            safe = safe[:MAX_FILENAME_LENGTH]
    return safe


def _guess_content_type(filename: str) -> str:
    """Guess a MIME type for a text file (defaults to ``text/plain``)."""
    guessed, _ = mimetypes.guess_type(filename)
    return (guessed or "text/plain")[:100]


async def read_upload_limited(upload: UploadFile, max_bytes: int) -> bytes:
    """
    Read an uploaded file in chunks, enforcing a byte limit (Content-Length is not trusted).

    Args:
        upload: The incoming file.
        max_bytes: Maximum allowed size.

    Returns:
        The file contents.

    Raises:
        PayloadTooLargeError: 413 ``FILE_TOO_LARGE`` if the file exceeds ``max_bytes``.
    """
    buffer = bytearray()
    while True:
        chunk = await upload.read(CHUNK_SIZE)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise PayloadTooLargeError(
                f"File '{sanitize_filename(upload.filename or 'file', keep_dirs=False)}' "
                f"exceeds the {max_bytes} byte limit",
                "FILE_TOO_LARGE",
            )
    return bytes(buffer)


def _validate_member_name(raw_name: str) -> None:
    """Reject zip member names that are absolute or attempt path traversal."""
    normalized = raw_name.replace("\\", "/")
    if normalized.startswith("/") or _DRIVE_LETTER.match(normalized):
        raise BadRequestError("Zip archive contains an absolute path", "INVALID_ZIP")
    if any(part == ".." for part in normalized.split("/")):
        raise BadRequestError("Zip archive contains a path traversal entry", "INVALID_ZIP")


def _is_ignored_member(raw_name: str) -> bool:
    """True for macOS metadata folders and dotfiles/dot-directories."""
    parts = [p for p in raw_name.replace("\\", "/").split("/") if p]
    return any(p == "__MACOSX" or p.startswith(".") for p in parts)


def _too_many_files() -> BadRequestError:
    max_files = settings.MAX_FILES_PER_SUBMISSION
    return BadRequestError(f"At most {max_files} files are allowed", "TOO_MANY_FILES")


def extract_zip(data: bytes, max_files: int | None = None) -> list[_Candidate]:
    """
    Safely list and read the allowed members of a zip archive (nothing is written to disk).

    Args:
        data: Raw zip bytes (already size-limited by the caller).
        max_files: Remaining file budget for the submission; extraction stops with
            ``TOO_MANY_FILES`` as soon as more allowed members than this are found, before
            their contents are decompressed. ``None`` means ``MAX_FILES_PER_SUBMISSION``.

    Returns:
        Candidates for every allowed, non-ignored file member.

    Raises:
        BadRequestError: 400 ``INVALID_ZIP`` for corrupt archives, traversal/absolute paths or
            zip bombs; 400 ``TOO_MANY_FILES`` when the file budget is exceeded.
        PayloadTooLargeError: 413 ``FILE_TOO_LARGE`` if a member exceeds ``MAX_FILE_SIZE_BYTES``.
    """
    budget = settings.MAX_FILES_PER_SUBMISSION if max_files is None else max_files
    max_member = settings.MAX_FILE_SIZE_BYTES
    max_total = settings.MAX_ZIP_SIZE_BYTES * ZIP_UNCOMPRESSED_FACTOR
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            infos = archive.infolist()
            for info in infos:
                _validate_member_name(info.filename)
            if sum(info.file_size for info in infos) > max_total:
                raise BadRequestError(
                    "Zip archive expands to more than the allowed size", "INVALID_ZIP"
                )

            candidates: list[_Candidate] = []
            for info in infos:
                if info.is_dir() or _is_ignored_member(info.filename):
                    continue
                if not is_allowed_text_extension(info.filename):
                    continue
                if len(candidates) >= budget:
                    raise _too_many_files()
                if info.file_size > max_member:
                    raise PayloadTooLargeError(
                        f"Zip member '{sanitize_filename(info.filename)}' exceeds the "
                        f"{max_member} byte limit",
                        "FILE_TOO_LARGE",
                    )
                with archive.open(info) as member:
                    # Read one byte past the limit to detect headers that understate the size.
                    content = member.read(max_member + 1)
                if len(content) > max_member:
                    raise BadRequestError("Zip member size does not match header", "INVALID_ZIP")
                candidates.append(_Candidate(name=info.filename, data=content))
            return candidates
    except (zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError, NotImplementedError) as exc:
        # RuntimeError: encrypted members; NotImplementedError: unsupported compression.
        logger.info("Rejected invalid zip upload: %s", type(exc).__name__)
        raise BadRequestError("Invalid or unsupported zip archive", "INVALID_ZIP") from exc


def decode_text(data: bytes) -> str | None:
    """
    Decode bytes as UTF-8 text.

    Returns:
        The decoded text, or ``None`` for binary (NUL bytes), undecodable or blank content.
    """
    if b"\x00" in data:
        return None
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    return text if text.strip() else None


def _unique_name(name: str, used: set[str]) -> str:
    """Make ``name`` unique within ``used`` by appending ``-N`` before the extension."""
    if name not in used:
        used.add(name)
        return name
    path = PurePosixPath(name)
    counter = 1
    while True:
        candidate = str(path.with_name(f"{path.stem}-{counter}{path.suffix}"))
        if candidate not in used:
            used.add(candidate)
            return candidate
        counter += 1


async def process_uploads(uploads: list[UploadFile]) -> list[ExtractedFile]:
    """
    Validate and read uploaded files (expanding zips) into readable text files.

    Args:
        uploads: The uploaded files (1..N).

    Returns:
        Readable text files with sanitized, unique names.

    Raises:
        BadRequestError: ``UNSUPPORTED_FILE_TYPE``, ``TOO_MANY_FILES``, ``INVALID_ZIP``,
            ``NO_READABLE_FILES`` (400).
        PayloadTooLargeError: ``FILE_TOO_LARGE`` (413).
    """
    max_files = settings.MAX_FILES_PER_SUBMISSION
    if not uploads:
        raise BadRequestError("At least one file is required", "NO_READABLE_FILES")
    if len(uploads) > max_files:
        raise BadRequestError(f"At most {max_files} files are allowed", "TOO_MANY_FILES")

    # Validate every extension before reading anything.
    for upload in uploads:
        ext = get_extension(upload.filename or "")
        if ext not in ALLOWED_EXTENSIONS:
            safe = sanitize_filename(upload.filename or "file", keep_dirs=False)
            raise BadRequestError(f"File type not allowed: '{safe}'", "UNSUPPORTED_FILE_TYPE")

    candidates: list[_Candidate] = []
    for upload in uploads:
        filename = upload.filename or "file"
        if get_extension(filename) == ZIP_EXTENSION:
            data = await read_upload_limited(upload, settings.MAX_ZIP_SIZE_BYTES)
            members = extract_zip(data, max_files=max_files - len(candidates))
            candidates.extend(
                _Candidate(name=sanitize_filename(m.name, keep_dirs=True), data=m.data)
                for m in members
            )
        else:
            data = await read_upload_limited(upload, settings.MAX_FILE_SIZE_BYTES)
            candidates.append(
                _Candidate(name=sanitize_filename(filename, keep_dirs=False), data=data)
            )
        if len(candidates) > max_files:
            raise _too_many_files()

    used: set[str] = set()
    extracted: list[ExtractedFile] = []
    for candidate in candidates:
        text = decode_text(candidate.data)
        if text is None:
            logger.debug("Skipping unreadable upload member")
            continue
        name = _unique_name(candidate.name, used)
        extracted.append(
            ExtractedFile(
                name=name,
                text=text,
                content_type=_guess_content_type(name),
                size_bytes=len(candidate.data),
            )
        )

    if not extracted:
        raise BadRequestError("No readable text files were found", "NO_READABLE_FILES")
    return extracted


def build_code_content(files: list[ExtractedFile], max_chars: int | None = None) -> str:
    """
    Concatenate files with ``// ===== FILE: name =====`` headers, truncated to ``max_chars``.

    Args:
        files: Extracted text files in order.
        max_chars: Character limit (defaults to ``settings.MAX_CODE_CHARS``).

    Returns:
        The combined code, ending with ``// [truncated]`` if it had to be cut.
    """
    limit = settings.MAX_CODE_CHARS if max_chars is None else max_chars
    combined = "\n".join(FILE_HEADER_TEMPLATE.format(name=f.name, text=f.text) for f in files)
    if len(combined) <= limit:
        return combined
    return combined[: max(limit - len(TRUNCATION_MARKER), 0)] + TRUNCATION_MARKER


def get_upload_root() -> Path:
    """Return the resolved ``UPLOAD_DIR`` path."""
    return Path(settings.UPLOAD_DIR).resolve()


def save_files(user_id: int, files: list[ExtractedFile]) -> tuple[Path, list[StoredFile]]:
    """
    Write extracted text files to ``UPLOAD_DIR/<user_id>/<uuid4>/<safe_path>``.

    Args:
        user_id: Owner of the submission.
        files: Files to write (names already sanitized).

    Returns:
        The submission directory and the stored files (paths relative to ``UPLOAD_DIR``).

    Raises:
        BadRequestError: ``INVALID_FILENAME`` if a path would escape the submission directory.
    """
    root = get_upload_root()
    submission_dir = root / str(user_id) / uuid.uuid4().hex
    submission_dir.mkdir(parents=True, exist_ok=False)
    stored: list[StoredFile] = []
    try:
        for extracted in files:
            target = (submission_dir / extracted.name).resolve()
            if not target.is_relative_to(submission_dir):
                raise BadRequestError("Invalid file name", "INVALID_FILENAME")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(extracted.text.encode("utf-8"))
            stored.append(
                StoredFile(file=extracted, storage_path=target.relative_to(root).as_posix())
            )
    except Exception:
        remove_directory(submission_dir)
        raise
    return submission_dir, stored


def remove_directory(directory: Path) -> bool:
    """
    Recursively delete ``directory`` only if it lies strictly inside ``UPLOAD_DIR``.

    Returns:
        True if a directory was removed.
    """
    root = get_upload_root()
    resolved = directory.resolve()
    if resolved == root or not resolved.is_relative_to(root):
        logger.warning("Refusing to delete directory outside UPLOAD_DIR")
        return False
    if not resolved.is_dir():
        return False
    shutil.rmtree(resolved, ignore_errors=True)
    return True


def submission_dir_from_storage_path(storage_path: str) -> Path | None:
    """
    Derive the per-submission directory (``<user_id>/<uuid>``) from a stored file path.

    Returns:
        The absolute directory, or ``None`` if the path does not have the expected shape.
    """
    parts = PurePosixPath(storage_path).parts
    if (
        len(parts) < 3
        or any(p in {"..", ""} for p in parts)
        or PurePosixPath(storage_path).is_absolute()
    ):
        return None
    return get_upload_root() / parts[0] / parts[1]
