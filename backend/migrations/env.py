"""Alembic migration environment."""
from logging.config import fileConfig
import os

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import make_url

from app.models import Base

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"), override=False)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def database_url() -> str:
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
    if url.get_backend_name() != "postgresql" or url.get_driver_name() not in {
        "psycopg",
        "psycopg2",
    }:
        raise RuntimeError(
            "DATABASE_URL must use PostgreSQL with the psycopg or psycopg2 driver."
        )
    return value


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
