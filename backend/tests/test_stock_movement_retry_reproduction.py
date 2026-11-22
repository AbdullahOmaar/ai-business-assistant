"""INVERTED REPRODUCTION: manual stock movements are idempotency-protected.

This file originally pinned the defect: POST /businesses/{business_id}/
stock-movements accepted no idempotency key and wrote a new row on every
call, so a client retry after a dropped response recorded the same
movement twice and double-counted stock.

The endpoint now follows the purchase-receipt idempotency precedent: it
requires a canonical UUID ``Idempotency-Key`` header, and a retry with
the same key and payload replays the original response without writing a
second movement. This test asserts the fixed behaviour on the same
scenario the reproduction used. The full contract (missing/malformed
key, payload conflict, cross-business scope, key reuse after a rejected
movement) lives in test_stock_movement_idempotency_api.py.
"""

from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from test_api import (
    _configure_test_identity,
    _restore_test_identity,
    _sales_return_fixture,
)

from app.main import app
from app.models import Product, StockMovement


def test_manual_stock_movement_retry_replays_without_duplicating():
    engine, business_id, _, _ = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        with Session(engine) as session:
            product = Product(
                business_id=business_id, name="Repro widget",
                unit_price=Decimal("5.00"), is_stock_tracked=True, is_active=True,
            )
            session.add(product)
            session.commit()
            product_id = product.id

        payload = {
            "product_id": str(product_id),
            "movement_type": "adjustment",
            "quantity_delta": "5.000",
            "reason": "repro retry",
        }
        headers = {"Idempotency-Key": str(uuid4())}
        first = client.post(f"/api/v1/businesses/{business_id}/stock-movements", json=payload, headers=headers)
        assert first.status_code == 201, first.text
        # Identical retry with the same key must replay, not re-record.
        second = client.post(f"/api/v1/businesses/{business_id}/stock-movements", json=payload, headers=headers)
        assert second.status_code == 201, second.text
        assert second.json() == first.json()

        with Session(engine) as session:
            count = session.scalar(
                select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.product_id == product_id,
                )
            )
            total = session.scalar(
                select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                    StockMovement.business_id == business_id,
                    StockMovement.product_id == product_id,
                )
            )
        assert count == 1, "retry must not record a second movement"
        assert Decimal(str(total)) == Decimal("5.000"), "stock must be counted once"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
