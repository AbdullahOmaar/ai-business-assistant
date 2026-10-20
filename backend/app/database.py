"""Database configuration helpers for local development.

No engine is created at import time, so unit tests and API startup do not need
a live PostgreSQL server unless a database operation is explicitly requested.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url

# Load only the backend-local .env file; existing process environment wins.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


def get_database_url() -> str:
    """Return and validate DATABASE_URL without exposing its credentials."""
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and configure "
            "a local PostgreSQL database before running migrations."
        )

    try:
        url = make_url(value)
    except Exception as exc:
        raise RuntimeError("DATABASE_URL is not a valid SQLAlchemy URL.") from exc

    if url.get_backend_name() != "postgresql":
        raise RuntimeError("DATABASE_URL must point to PostgreSQL for this project.")

    if url.get_driver_name() not in {"psycopg", "psycopg2"}:
        raise RuntimeError(
            "Use a supported PostgreSQL driver URL, such as postgresql+psycopg://..."
        )
    return value


def create_database_engine(*, echo: bool = False) -> Engine:
    """Create an engine only when a caller explicitly needs database access."""
    return create_engine(get_database_url(), pool_pre_ping=True, echo=echo)
