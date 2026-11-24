"""B3 (3A-721): the purge script hard-deletes only businesses whose
retention window expired, children included; a dry run deletes
nothing; a missing DATABASE_URL fails closed."""
import os
import sys
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import purge_deleted_businesses as purge  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models import (  # noqa: E402
    Base,
    Business,
    BusinessMembership,
    Customer,
    MembershipRole,
)


def _seed(database_url: str) -> dict[str, object]:
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    now = datetime.now(UTC)
    ids: dict[str, object] = {}
    with Session(engine) as session:
        for key, name, active, deleted_days_ago in (
            ("old", "Old Deleted", False, 40),
            ("recent", "Recent Deleted", False, 5),
            ("live", "Live", True, None),
        ):
            business = Business(name=name, currency_code="EGP", is_active=active)
            if deleted_days_ago is not None:
                business.deleted_at = now - timedelta(days=deleted_days_ago)
            session.add(business)
            session.flush()
            session.add(BusinessMembership(
                business_id=business.id, user_subject=f"purge-{key}",
                role=MembershipRole.OWNER,
            ))
            session.add(Customer(business_id=business.id, name=f"Customer {key}"))
            ids[key] = business.id
        session.commit()
    engine.dispose()
    return ids


def _business_names(database_url: str) -> list[str]:
    engine = create_engine(database_url)
    with Session(engine) as session:
        names = session.scalars(select(Business.name)).all()
    engine.dispose()
    return sorted(names)


def _child_counts(database_url: str, business_id: object) -> int:
    engine = create_engine(database_url)
    with Session(engine) as session:
        customers = session.scalars(select(Customer).where(
            Customer.business_id == business_id)).all()
        memberships = session.scalars(select(BusinessMembership).where(
            BusinessMembership.business_id == business_id)).all()
    engine.dispose()
    return len(customers) + len(memberships)


class PurgeDeletedBusinessesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.database_url = f"sqlite+pysqlite:///{self.tmp.name}/purge.db"
        self.ids = _seed(self.database_url)
        self.env = {
            "DATABASE_URL": self.database_url,
            "PURGE_RETENTION_DAYS": "30",
        }

    def tearDown(self):
        self.tmp.cleanup()

    def test_dry_run_deletes_nothing(self):
        with patch.dict(os.environ, self.env):
            assert purge.main(["--dry-run"]) == 0
        assert _business_names(self.database_url) == [
            "Live", "Old Deleted", "Recent Deleted",
        ]

    def test_purge_removes_only_the_expired_business_and_its_rows(self):
        with patch.dict(os.environ, self.env):
            assert purge.main([]) == 0
        assert _business_names(self.database_url) == ["Live", "Recent Deleted"]
        assert _child_counts(self.database_url, self.ids["old"]) == 0
        assert _child_counts(self.database_url, self.ids["recent"]) == 2
        assert _child_counts(self.database_url, self.ids["live"]) == 2

    def test_missing_database_url_fails_closed(self):
        env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
        with patch.dict(os.environ, env, clear=True):
            assert purge.main([]) == 2


if __name__ == "__main__":
    unittest.main()
