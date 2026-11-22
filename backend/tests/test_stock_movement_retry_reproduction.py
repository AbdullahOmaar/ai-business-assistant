"""REPRODUCTION ONLY: manual stock movements have no idempotency protection.

POST /businesses/{business_id}/stock-movements accepts no idempotency key
(``StockMovementInput`` has no such field) and ``record_stock_movement``
writes a new row on every call. A client retry after a dropped response
therefore records the same movement twice and double-counts stock.

This test pins the CURRENT behaviour so the gap is visible in the suite.
It must be inverted (assert one movement plus a replayed result) when the
idempotency design in the stock-movement retry note under
~/workspace/your_files/ is approved and implemented. No schema or behaviour
change is made here; the test runs locally against SQLite fixtures only.
"""

from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import Product, StockMovement
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture


def test_manual_stock_movement_retry_duplicates_without_idempotency_key():
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
        first = client.post(f"/api/v1/businesses/{business_id}/stock-movements", json=payload)
        assert first.status_code == 201, first.text
        # Identical retry (same payload; there is no idempotency key to send).
        second = client.post(f"/api/v1/businesses/{business_id}/stock-movements", json=payload)
        assert second.status_code == 201, second.text

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
        assert count == 2, "retry recorded a second identical movement"
        assert Decimal(str(total)) == Decimal("10.000"), "stock was double-counted by the retry"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
