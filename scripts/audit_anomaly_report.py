#!/usr/bin/env python3
"""Audit-log anomaly report (B5, 3A-722's successor task 3A-723).

Reads the AuditEvent rows of a database (never the production one
directly — run it against a dump or an approved copy) and prints the
findings of app.audit_anomaly.detect_anomalies, or "no anomalies".

Usage:
    DATABASE_URL=postgresql://... python3 scripts/audit_anomaly_report.py [--days 7] [--business-id <uuid>]

Exit codes: 0 = report produced (even when findings exist — a
finding is a review item, not a failure); 2 = missing DATABASE_URL
or the database could not be read.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Report audit-log anomalies.")
    parser.add_argument("--days", type=int, default=7, help="Look-back window in days (default 7).")
    parser.add_argument("--business-id", default=None, help="Limit the report to one business.")
    args = parser.parse_args(argv)

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is required (never point this at production directly).", file=sys.stderr)
        return 2

    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    from app.audit_anomaly import detect_anomalies
    from app.models import AuditEvent, Business

    engine = create_engine(database_url)
    cutoff = datetime.now(UTC) - timedelta(days=args.days)
    with Session(engine) as session:
        statement = select(AuditEvent).where(AuditEvent.created_at >= cutoff)
        if args.business_id:
            statement = statement.where(AuditEvent.business_id == args.business_id)
        events = session.scalars(statement.order_by(AuditEvent.created_at)).all()
        timezones = {
            str(business.id): business.timezone
            for business in session.scalars(select(Business)).all()
            if getattr(business, "timezone", None)
        }

    findings = detect_anomalies(events, business_timezones=timezones)
    print(f"AUDIT ANOMALY: {len(events)} events in the last {args.days} day(s), {len(findings)} finding(s)")
    for finding in findings:
        print(
            f"  {finding['rule']} actor={finding['actor_subject']} "
            f"count={finding['count']} window={finding['window_start']}..{finding['window_end']} "
            f"businesses={','.join(finding['business_ids'])}"
        )
    if not findings:
        print("  no anomalies")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
