"""Database engine and session factory — supports SQLite and PostgreSQL.

This module provides the SQLAlchemy engine and session management for
the new domain models (users, subscriptions, payments, etc.).
It coexists with the existing raw-SQL Database facade for legacy tables.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import Settings

# Declarative base for all new domain models
Base = declarative_base()

# Module-level singletons
_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None


def _build_sqlite_url(db_path: str) -> str:
    """Build SQLite URL with WAL mode for better concurrency."""
    path = Path(db_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path}"


def _build_postgresql_url(database_url: str) -> str:
    """Ensure the URL uses a sync driver for migrations/sessions."""
    if "+asyncpg" in database_url:
        return database_url.replace("+asyncpg", "+psycopg2")
    if not database_url.startswith("postgresql"):
        return f"postgresql+psycopg2://{database_url}"
    return database_url


def init_db(settings: Settings) -> Engine:
    """Initialize the database engine and session factory.

    Called once at application startup. Returns the engine.
    """
    global _engine, _SessionLocal

    db_type = settings.storage.db_type
    if db_type == "postgresql":
        database_url = settings.storage.database_url
        if not database_url:
            raise RuntimeError(
                "DB_TYPE=postgresql requires DATABASE_URL or POSTGRES_* "
                "environment variables (including POSTGRES_PASSWORD)."
            )
        url = _build_postgresql_url(database_url)
    else:
        url = _build_sqlite_url(settings.storage.sqlite_path)

    connect_args = {}
    if db_type == "sqlite":
        connect_args["check_same_thread"] = False

    _engine = create_engine(
        url,
        echo=settings.server.debug,
        connect_args=connect_args,
        pool_pre_ping=True,
    )

    # Enable WAL mode and foreign keys for SQLite
    if db_type == "sqlite":

        @event.listens_for(_engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

    return _engine


def get_session() -> Session:
    """Get a new database session. Must be closed by caller."""
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() first")
    return _SessionLocal()


def get_engine() -> Engine:
    """Get the current database engine."""
    if _engine is None:
        raise RuntimeError("Database not initialized — call init_db() first")
    return _engine


def create_all_tables() -> None:
    """Create all tables defined in SQLAlchemy models (dev convenience)."""
    if _engine is None:
        raise RuntimeError("Database not initialized")
    Base.metadata.create_all(bind=_engine)


def drop_all_tables() -> None:
    """Drop all tables (DANGER — dev only)."""
    if _engine is None:
        raise RuntimeError("Database not initialized")
    Base.metadata.drop_all(bind=_engine)
