"""Tests for the audit-anomaly report script (B5, 3A-723).

The script is exercised end-to-end against a disposable SQLite
database seeded with synthetic audit events: a destructive burst
is reported, a clean database reports "no anomalies", and a missing
DATABASE_URL exits 2 without touching anything.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import audit_anomaly_report as report


def _seed(db_path: Path, *, burst: bool) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.models import AuditEvent, Base, Business

    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    now = datetime.now(UTC)
    with Session(engine) as session:
        business = Business(
            name="Anomaly Test Co", currency_code="EGP", locale="en", timezone="UTC"
        )
        session.add(business)
        session.flush()
        actions = (
            ["customer.deactivated", "product.deactivated", "invoice.voided"]
            if burst
            else ["invoice.created", "payment.recorded"]
        )
        for index, action in enumerate(actions):
            session.add(AuditEvent(
                business_id=business.id,
                actor_subject="actor-1",
                action=action,
                target_type="business",
                target_id=str(business.id),
                change_summary=f"synthetic {action}",
                created_at=now - timedelta(minutes=10 - index * 3),
            ))
        session.commit()


class TestAuditAnomalyReport(unittest.TestCase):
    def test_burst_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "anomaly.db"
            _seed(db_path, burst=True)
            os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
            try:
                import io
                from contextlib import redirect_stdout

                out = io.StringIO()
                with redirect_stdout(out):
                    code = report.main(["--days", "7"])
                self.assertEqual(code, 0)
                self.assertIn("R1-destructive-burst", out.getvalue())
            finally:
                del os.environ["DATABASE_URL"]

    def test_clean_database_reports_no_anomalies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "anomaly.db"
            _seed(db_path, burst=False)
            os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
            try:
                import io
                from contextlib import redirect_stdout

                out = io.StringIO()
                with redirect_stdout(out):
                    code = report.main(["--days", "7"])
                self.assertEqual(code, 0)
                self.assertIn("no anomalies", out.getvalue())
            finally:
                del os.environ["DATABASE_URL"]

    def test_missing_database_url_exits_two(self) -> None:
        os.environ.pop("DATABASE_URL", None)
        self.assertEqual(report.main(["--days", "7"]), 2)


if __name__ == "__main__":
    unittest.main()
