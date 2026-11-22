"""PostgreSQL-only persistence contract checks for stock-movement idempotency.

Mirrors the T39 receipt-idempotency schema test: these target the
disposable *_test database provisioned by CI, never create or upgrade
schema, and are skipped outside the explicitly enabled job.
"""
import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Business, StockMovementIdempotency


def _postgres_test_engine():
    if os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true":
        pytest.skip("requires the isolated PostgreSQL CI service")
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    engine = create_engine(database_url, pool_size=3, max_overflow=2, pool_pre_ping=True)
    if engine.dialect.name != "postgresql" or not (engine.url.database or "").endswith("_test"):
        engine.dispose()
        pytest.skip("schema regression requires a disposable PostgreSQL *_test database")
    return engine


def _claim(business_id, key, request_hash="a" * 64):
    return StockMovementIdempotency(
        business_id=business_id,
        idempotency_key=key,
        request_hash=request_hash,
        response_snapshot={"status": "recorded"},
    )


def test_stock_movement_idempotency_postgres_enforces_scope_and_unique_key():
    engine = _postgres_test_engine()
    try:
        suffix = uuid4().hex[:12]
        with Session(engine) as session:
            business_a = Business(name=f"Stock idem A {suffix}", currency_code="EGP")
            business_b = Business(name=f"Stock idem B {suffix}", currency_code="EGP")
            session.add_all([business_a, business_b])
            session.commit()
            business_a_id, business_b_id = business_a.id, business_b.id

        key = "11111111-1111-4111-8111-111111111111"
        with Session(engine) as session:
            session.add(_claim(business_a_id, key))
            session.commit()

        # Same business + same key violates the unique scope constraint.
        with Session(engine) as session:
            session.add(_claim(business_a_id, key))
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

        # The same key under a different business is an independent claim.
        with Session(engine) as session:
            session.add(_claim(business_b_id, key))
            session.commit()

        # A key that is not a canonical 36-char UUID violates the check.
        with Session(engine) as session:
            session.add(_claim(business_a_id, "short-key"))
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

        # An unknown business violates the foreign key.
        with Session(engine) as session:
            session.add(_claim(uuid4(), "22222222-2222-4222-8222-222222222222"))
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()
    finally:
        engine.dispose()
