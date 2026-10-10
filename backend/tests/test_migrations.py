"""Alembic migration tests on a temporary SQLite file.

- ``upgrade head`` then ``downgrade base`` (and back up again) must succeed.
- After ``upgrade head`` the schema must match ``Base.metadata`` (an ``alembic check`` equivalent).
"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import Engine

import app.models  # noqa: F401  (registers all tables)
from app.config import settings
from app.database import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture()
def db_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> str:
    url = f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}"
    # alembic/env.py reads the URL from ``settings``.
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    return url


@pytest.fixture()
def alembic_cfg(db_url: str) -> Config:
    # No ini file on purpose: env.py then skips ``fileConfig`` (which would reset test logging).
    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


@pytest.fixture()
def engine(db_url: str) -> Generator[Engine, None, None]:
    eng = create_engine(db_url)
    yield eng
    eng.dispose()


def _app_tables() -> set[str]:
    return set(Base.metadata.tables)


def test_single_head(alembic_cfg: Config) -> None:
    script = ScriptDirectory.from_config(alembic_cfg)
    assert len(script.get_heads()) == 1


def test_upgrade_then_downgrade_roundtrip(alembic_cfg: Config, engine: Engine) -> None:
    command.upgrade(alembic_cfg, "head")
    tables = set(inspect(engine).get_table_names())
    assert _app_tables() <= tables

    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()
    assert current == ScriptDirectory.from_config(alembic_cfg).get_current_head()

    command.downgrade(alembic_cfg, "base")
    remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
    assert remaining == set()

    # And up again (downgrade must leave the database in a re-upgradable state).
    command.upgrade(alembic_cfg, "head")
    assert _app_tables() <= set(inspect(engine).get_table_names())


def test_migrated_schema_matches_models(alembic_cfg: Config, engine: Engine) -> None:
    command.upgrade(alembic_cfg, "head")
    inspector = inspect(engine)

    db_tables = set(inspector.get_table_names()) - {"alembic_version"}
    assert db_tables == _app_tables()

    for name, table in Base.metadata.tables.items():
        db_cols = {c["name"]: c for c in inspector.get_columns(name)}
        assert set(db_cols) == {c.name for c in table.columns}, name
        for column in table.columns:
            assert bool(db_cols[column.name]["nullable"]) == bool(column.nullable), (
                f"{name}.{column.name} nullable mismatch"
            )
        db_fks = {
            (tuple(fk["constrained_columns"]), fk["referred_table"])
            for fk in inspector.get_foreign_keys(name)
        }
        model_fks = {
            (tuple(c.name for c in fk.columns), fk.referred_table.name)
            for fk in table.foreign_key_constraints
        }
        assert db_fks == model_fks, name


def test_alembic_check_equivalent_no_pending_changes(alembic_cfg: Config, engine: Engine) -> None:
    command.upgrade(alembic_cfg, "head")
    with engine.connect() as conn:
        context = MigrationContext.configure(conn, opts={"compare_type": True})
        diff = compare_metadata(context, Base.metadata)
    assert diff == [], f"Models and migrations diverge: {diff}"
