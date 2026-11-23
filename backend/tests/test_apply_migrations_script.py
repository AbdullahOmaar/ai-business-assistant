"""Fail-closed behaviour of scripts/apply_migrations.py (3A-650 part B).

The script is the release-time migration hook: it must never print the
database URL and must refuse to proceed without one. The happy path
(running Alembic against a real database) is covered by CI's disposable
PostgreSQL migration checks; this test pins only the safety property
that can be checked without a database.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
SCRIPT = BACKEND_DIR / "scripts" / "apply_migrations.py"


def run_script(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
        check=False,
    )


def test_apply_migrations_refuses_without_database_url() -> None:
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    result = run_script(env)
    assert result.returncode != 0
    combined = result.stdout + result.stderr
    assert "DATABASE_URL" in combined
    assert "postgres://" not in combined
    assert "postgresql://" not in combined


@pytest.mark.skipif(
    "DATABASE_URL" in os.environ,
    reason="needs a controlled environment without DATABASE_URL",
)
def test_apply_migrations_refuses_non_postgres_url() -> None:
    env = dict(os.environ)
    env["DATABASE_URL"] = "sqlite:////tmp/aiba-apply-migrations-test.db"
    result = run_script(env)
    assert result.returncode != 0
    assert "DATABASE_URL" in (result.stdout + result.stderr)
