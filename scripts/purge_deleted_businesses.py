#!/usr/bin/env python3
"""Purge soft-deleted businesses after the retention window (B3, 3A-721).

Business deletion in the product is a SOFT delete (is_active=False +
deleted_at stamped; see docs/RETENTION_AND_DELETION.md). This script
is the operations step that makes it final: for every business whose
deleted_at is older than the retention window it deletes all
business-scoped rows (in foreign-key dependency order, derived from
the model metadata — a few business FKs are RESTRICT, so children
must go first) and then the business row itself, printing one
evidence line per business with the per-table counts.

Safety:
- DATABASE_URL is required (fail closed without it, like migrations).
- PURGE_RETENTION_DAYS (default 30) sets the window.
- --dry-run reports what WOULD be purged and deletes nothing.
- One business per transaction: a failure rolls back that business
  only, and the run reports it and exits non-zero.

Usage:
    DATABASE_URL=postgresql://... python scripts/purge_deleted_businesses.py [--dry-run]
"""
from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import create_engine, delete, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models import Base, Business  # noqa: E402

DEFAULT_RETENTION_DAYS = 30


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def qualifying_businesses(session: Session, cutoff: datetime) -> list[Business]:
    """Soft-deleted businesses whose retention window has expired."""
    rows = session.scalars(
        select(Business).where(
            Business.is_active.is_(False), Business.deleted_at.is_not(None)
        )
    ).all()
    return [row for row in rows if _aware(row.deleted_at) < cutoff]


def deletion_order() -> list[str]:
    """Business-scoped table names in FK-safe deletion order.

    Children are deleted before the tables they reference. Derived
    from the model metadata so a new business-scoped table joins the
    purge automatically; alphabetical tie-break keeps it stable.
    """
    scoped = {
        table.name
        for table in Base.metadata.tables.values()
        if "business_id" in table.columns and table.name != "businesses"
    }
    # edges[name] = tables that must be deleted BEFORE name
    must_precede: dict[str, set[str]] = {name: set() for name in scoped}
    for name in scoped:
        table = Base.metadata.tables[name]
        for fk in table.foreign_keys:
            parent = fk.column.table.name
            if parent in scoped:
                must_precede[parent].add(name)
    order: list[str] = []
    remaining = dict(must_precede)
    while remaining:
        ready = sorted(
            name for name, blockers in remaining.items()
            if not (blockers - set(order))
        )
        if not ready:  # a cycle — fall back to alphabetical for the rest
            ready = sorted(remaining)
        name = ready[0]
        order.append(name)
        del remaining[name]
    return order


def purge_business(session: Session, business_id: object) -> dict[str, int]:
    """Delete every business-scoped row, then the business. Returns counts."""
    counts: dict[str, int] = {}
    for name in deletion_order():
        table = Base.metadata.tables[name]
        result = session.execute(
            delete(table).where(table.c.business_id == business_id)
        )
        counts[name] = result.rowcount or 0
    result = session.execute(
        delete(Base.metadata.tables["businesses"]).where(
            Base.metadata.tables["businesses"].c.id == business_id
        )
    )
    counts["businesses"] = result.rowcount or 0
    return counts


def count_business_rows(session: Session, business_id: object) -> dict[str, int]:
    from sqlalchemy import func

    counts: dict[str, int] = {}
    for name in deletion_order():
        table = Base.metadata.tables[name]
        counts[name] = session.scalar(
            select(func.count()).select_from(table).where(
                table.c.business_id == business_id
            )
        ) or 0
    counts["businesses"] = 1
    return counts


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("REFUSED: DATABASE_URL is not set (fail closed).", file=sys.stderr)
        return 2
    try:
        retention_days = int(os.environ.get("PURGE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS))
    except ValueError:
        print("REFUSED: PURGE_RETENTION_DAYS must be an integer.", file=sys.stderr)
        return 2
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    engine = create_engine(database_url)
    failures = 0
    with Session(engine) as session:
        candidates = qualifying_businesses(session, cutoff)
        print(
            f"PURGE {'DRY-RUN' if dry_run else 'RUN'}: retention={retention_days}d "
            f"cutoff={cutoff.isoformat()} candidates={len(candidates)}"
        )
        for business in candidates:
            # Capture the record fields first: after the purge commits,
            # the ORM instance is expired AND its row is gone.
            record = (business.id, business.name, _aware(business.deleted_at))
            try:
                if dry_run:
                    counts = count_business_rows(session, business.id)
                    action = "WOULD PURGE"
                else:
                    counts = purge_business(session, business.id)
                    session.commit()
                    action = "PURGED"
                total = sum(counts.values())
                print(
                    f"{action}: business={record[0]} name={record[1]!r} "
                    f"deleted_at={record[2].isoformat()} rows={total} "
                    f"detail={counts}"
                )
            except Exception as exc:  # one business must not stop the run
                session.rollback()
                failures += 1
                print(f"FAILED: business={business.id} error={exc}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
