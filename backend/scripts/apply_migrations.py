#!/usr/bin/env python3
"""Apply pending Alembic migrations (release-time step, 3A-650 part B).

Runs ``alembic upgrade head`` from the backend directory. This script is
meant to be called from the Vercel API project's Build Command, which is
the only place that holds the decrypted production ``DATABASE_URL`` —
GitHub CI must never receive production secrets, and the app does not
auto-run migrations at startup, so the build step is the release-time
migration hook.

Safety properties (fail-closed):
- Without ``DATABASE_URL`` set, Alembic itself refuses to run (see
  ``migrations/env.py``) and this script exits non-zero before doing
  anything. The URL value is never printed or logged.
- Only ``upgrade head`` is ever run: no downgrade, no revision argument,
  no other Alembic command. Additive-only migrations are the project
  rule; a destructive migration must never be applied through this path.
- A failed migration exits non-zero, which fails the Vercel build, so a
  bad migration blocks the deploy instead of shipping beside it.
- Previews are disabled for the API project, so this only runs on
  production builds.

Usage (from the Vercel Build Command, project root ``backend``)::

    python scripts/apply_migrations.py && <existing build command>

The script changes into the backend directory itself, so it also works
when invoked from the repository root as
``python backend/scripts/apply_migrations.py``.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def run(*args: str) -> None:
    print(f"$ {' '.join(args)}", flush=True)
    result = subprocess.run(args, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> int:
    backend_dir = Path(__file__).resolve().parent.parent
    try:
        import os

        os.chdir(backend_dir)
        print(f"apply_migrations: backend directory is {backend_dir}", flush=True)
        run(sys.executable, "-m", "alembic", "current")
        run(sys.executable, "-m", "alembic", "upgrade", "head")
        run(sys.executable, "-m", "alembic", "current")
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        print(f"apply_migrations: FAILED (exit {code}) — deploy must stop here.",
              file=sys.stderr, flush=True)
        return code
    print("apply_migrations: done — database is at head.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
