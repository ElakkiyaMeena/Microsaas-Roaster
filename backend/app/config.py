"""Application settings loaded from environment variables (and an optional ``.env`` file)."""

from __future__ import annotations

import logging
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEFAULT_SECRET_KEY = "change-me-in-production"

#: Placeholder secrets that must never be used in production.
WEAK_SECRET_KEYS: frozenset[str] = frozenset(
    {
        "change-me",
        "change-me-in-production",
        "your-secret-key-change-in-production",
        "your-secret-key",
    }
)
#: Minimum SECRET_KEY length enforced when ``ENVIRONMENT == "production"``.
MIN_SECRET_KEY_LENGTH = 32

#: File extensions accepted for uploads (lowercase, with leading dot). ``.zip`` is an archive
#: whose members are themselves checked against this set (minus ``.zip``).
ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".py",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".cs",
        ".go",
        ".rb",
        ".php",
        ".html",
        ".css",
        ".sql",
        ".md",
        ".json",
        ".txt",
        ".zip",
    }
)

#: Languages accepted for a submission's ``language`` field.
ALLOWED_LANGUAGES: frozenset[str] = frozenset(
    {
        "python",
        "javascript",
        "typescript",
        "java",
        "c",
        "cpp",
        "csharp",
        "go",
        "ruby",
        "php",
        "html_css",
        "sql",
        "other",
    }
)


class Settings(BaseSettings):
    """Typed application configuration. Every field maps to an env var of the same name."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime environment: "production" enables strict startup checks (e.g. SECRET_KEY).
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/assignment_roaster"

    # Auth
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TIMEOUT_SECONDS: float = 60.0
    OPENAI_MAX_OUTPUT_TOKENS: int = 3000
    ROASTS_PER_DAY: int = 10
    #: Output language of roasts: "tanglish" (Tamil + English, Latin script) or "english".
    ROAST_LANGUAGE: Literal["tanglish", "english"] = "tanglish"

    # Uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_BYTES: int = 1_048_576
    MAX_ZIP_SIZE_BYTES: int = 5_242_880
    MAX_FILES_PER_SUBMISSION: int = 20
    MAX_CODE_CHARS: int = 100_000

    # HTTP
    RATE_LIMIT_ENABLED: bool = True
    #: Hard cap on any request body (bytes); larger requests get 413 before parsing.
    MAX_REQUEST_BYTES: int = 25 * 1024 * 1024
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:5173"
    BACKEND_URL: str = "http://localhost:8000"

    @model_validator(mode="after")
    def _check_production_secret(self) -> Settings:
        """Refuse to start in production with a placeholder or short ``SECRET_KEY``."""
        if self.is_production and self.uses_weak_secret:
            raise ValueError(
                "SECRET_KEY is a placeholder or shorter than "
                f"{MIN_SECRET_KEY_LENGTH} characters; refusing to start with "
                'ENVIRONMENT="production". Generate one with: '
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return self

    @property
    def is_production(self) -> bool:
        """True when ``ENVIRONMENT`` is ``production`` (case-insensitive)."""
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def uses_weak_secret(self) -> bool:
        """True when ``SECRET_KEY`` is a known placeholder or shorter than 32 characters."""
        return self.SECRET_KEY in WEAK_SECRET_KEYS or len(self.SECRET_KEY) < MIN_SECRET_KEY_LENGTH

    @property
    def allowed_origins_list(self) -> list[str]:
        """Return ``ALLOWED_ORIGINS`` split on commas, stripped, without empty entries."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def uses_default_secret(self) -> bool:
        """True when ``SECRET_KEY`` is the built-in default or another known placeholder."""
        return self.SECRET_KEY in WEAK_SECRET_KEYS

    @property
    def google_redirect_uri(self) -> str:
        """OAuth redirect URI registered with Google."""
        return f"{self.BACKEND_URL.rstrip('/')}/api/v1/auth/google/callback"


settings = Settings()


def warn_if_insecure(cfg: Settings | None = None) -> None:
    """Log a WARNING when ``SECRET_KEY`` is a known placeholder or too short (non-production)."""
    cfg = cfg or settings
    if cfg.uses_weak_secret:
        logger.warning(
            "SECRET_KEY is a placeholder or shorter than %d characters; set a strong "
            "SECRET_KEY in the environment.",
            MIN_SECRET_KEY_LENGTH,
        )
