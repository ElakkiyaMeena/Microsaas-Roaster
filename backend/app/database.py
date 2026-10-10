"""Database engine, session factory and declarative base."""

from __future__ import annotations

import logging
from collections.abc import Generator
from typing import Any

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger(__name__)

# Deterministic constraint/index names keep Alembic migrations stable across dialects.
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base class for all ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _engine_kwargs(database_url: str) -> dict[str, Any]:
    """Build engine keyword arguments appropriate for the given database URL."""
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Sync endpoints run in FastAPI's threadpool (40 threads by default); size the pool so
        # bursts queue briefly and then fail fast instead of hanging on pool checkout.
        kwargs.update(pool_size=10, max_overflow=20, pool_timeout=10)
    return kwargs


engine = create_engine(settings.DATABASE_URL, **_engine_kwargs(settings.DATABASE_URL))
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """
    Yield a database session and always close it afterwards.

    Intended for use as a FastAPI dependency: ``db: Session = Depends(get_db)``.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
