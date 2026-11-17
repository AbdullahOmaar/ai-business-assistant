"""PostgreSQL-only persistence contract checks for T39 receipt idempotency.

These tests target the disposable *_test database provisioned by CI. They never
create or upgrade schema and are skipped outside the explicitly enabled job.
"""
import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Business,
    PurchaseOrder,
    PurchaseReceiptIdempotency,
    Supplier,
)


def _postgres_test_engine():
    if os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true":
        pytest.skip("requires the isolated PostgreSQL CI service")
    database_url = os.getenv("TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    engine = create_engine(database_url, pool_size=3, max_overflow=2, pool_pre_ping=True)
    if engine.dialect.name != "postgresql" or not (engine.url.database or "").endswith("_test"):
        engine.dispose()
        pytest.skip("schema regression requires a disposable PostgreSQL *_test database")
    return engine


def test_receipt_idempotency_postgres_enforces_scope_fk_and_unique_key():
    engine = _postgres_test_engine()
    try:
        suffix = uuid4().hex[:12]
        with Session(engine) as session:
            business_a = Business(name=f"T39 idem A {suffix}", currency_code="EGP")
            business_b = Business(name=f"T39 idem B {suffix}", currency_code="EGP")
            session.add_all([business_a, business_b])
            session.flush()
            supplier_a = Supplier(business_id=business_a.id, name=f"T39 supplier A {suffix}")
            supplier_b = Supplier(business_id=business_b.id, name=f"T39 supplier B {suffix}")
            session.add_all([supplier_a, supplier_b])
            session.flush()
            order_a = PurchaseOrder(
                business_id=business_a.id, supplier_id=supplier_a.id,
                order_number=f"T39-IDA-{suffix}", status="approved",
                currency_code="EGP", total=0,
            )
            order_b = PurchaseOrder(
                business_id=business_b.id, supplier_id=supplier_b.id,
                order_number=f"T39-IDB-{suffix}", status="approved",
                currency_code="EGP", total=0,
            )
            order_c = PurchaseOrder(
                business_id=business_a.id, supplier_id=supplier_a.id,
                order_number=f"T39-IDC-{suffix}", status="approved",
                currency_code="EGP", total=0,
            )
            session.add_all([order_a, order_b, order_c])
            session.flush()
            business_a_id, business_b_id = business_a.id, business_b.id
            order_a_id, order_b_id, order_c_id = order_a.id, order_b.id, order_c.id

            session.add(PurchaseReceiptIdempotency(
                business_id=business_a_id, purchase_order_id=order_a_id,
                idempotency_key="11111111-1111-4111-8111-111111111111",
                request_hash="a" * 64, response_snapshot={"status": "received"},
            ))
            session.commit()

        # The PO/business composite FK must reject a foreign tenant PO even
        # when business_id itself references a real, valid business.
        with Session(engine) as session:
            session.add(PurchaseReceiptIdempotency(
                business_id=business_a_id, purchase_order_id=order_b_id,
                idempotency_key="22222222-2222-4222-8222-222222222222",
                request_hash="b" * 64, response_snapshot={"status": "received"},
            ))
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

        # The operation key is unique within a business + PO, but reusable for
        # another PO in the same business and another business.
        with Session(engine) as session:
            session.add_all([
                PurchaseReceiptIdempotency(
                    business_id=business_a_id, purchase_order_id=order_a_id,
                    idempotency_key="11111111-1111-4111-8111-111111111111",
                    request_hash="c" * 64, response_snapshot={"status": "replay"},
                ),
            ])
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()
            session.add_all([
                PurchaseReceiptIdempotency(
                    business_id=business_a_id, purchase_order_id=order_a_id,
                    idempotency_key="33333333-3333-4333-8333-333333333333",
                    request_hash="d" * 64, response_snapshot={"status": "received"},
                ),
                PurchaseReceiptIdempotency(
                    business_id=business_a_id, purchase_order_id=order_c_id,
                    idempotency_key="11111111-1111-4111-8111-111111111111",
                    request_hash="e" * 64, response_snapshot={"status": "received"},
                ),
                PurchaseReceiptIdempotency(
                    business_id=business_b_id, purchase_order_id=order_b_id,
                    idempotency_key="11111111-1111-4111-8111-111111111111",
                    request_hash="f" * 64, response_snapshot={"status": "received"},
                ),
            ])
            session.commit()

        # Fixed-width key/hash storage is enforced by DB checks. Canonical UUID
        # syntax is validated at the HTTP boundary, not by the storage schema.
        for key, digest in (
            ("short", "f" * 64),
            ("44444444-4444-4444-8444-444444444444", "short"),
        ):
            with Session(engine) as session:
                session.add(PurchaseReceiptIdempotency(
                    business_id=business_a_id, purchase_order_id=order_a_id,
                    idempotency_key=key, request_hash=digest,
                    response_snapshot={"status": "received"},
                ))
                with pytest.raises(IntegrityError):
                    session.commit()
                session.rollback()
    finally:
        engine.dispose()
