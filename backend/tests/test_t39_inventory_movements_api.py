"""API coverage for the tenant-scoped stock movement ledger."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Business, Product, StockMovement
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture


def test_inventory_movement_ledger_is_tenant_scoped_filterable_and_paginated():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        with Session(engine) as session:
            first = Product(
                business_id=business_id, name="Ledger item A",
                unit_price=Decimal("10.00"), is_stock_tracked=True,
            )
            second = Product(
                business_id=business_id, name="Ledger item B",
                unit_price=Decimal("12.00"), is_stock_tracked=True,
            )
            foreign_business = Business(name="Foreign ledger tenant", currency_code="EGP")
            session.add_all([first, second, foreign_business])
            session.flush()
            foreign_product = Product(
                business_id=foreign_business.id, name="Foreign ledger item",
                unit_price=Decimal("5.00"), is_stock_tracked=True,
            )
            session.add(foreign_product)
            session.flush()
            now = datetime.now(timezone.utc)
            session.add_all([
                StockMovement(
                    business_id=business_id, product_id=first.id,
                    movement_type="opening", quantity_delta=Decimal("10.000"),
                    reason="Initial stock", created_at=now - timedelta(minutes=3),
                ),
                StockMovement(
                    business_id=business_id, product_id=first.id,
                    movement_type="receipt", quantity_delta=Decimal("2.000"),
                    reason="PO receipt", reference_type="purchase_order",
                    reference_id=uuid4(), created_at=now - timedelta(minutes=2),
                ),
                StockMovement(
                    business_id=business_id, product_id=second.id,
                    movement_type="adjustment", quantity_delta=Decimal("-1.000"),
                    reason="Count correction", created_at=now - timedelta(minutes=1),
                ),
                StockMovement(
                    business_id=foreign_business.id, product_id=foreign_product.id,
                    movement_type="opening", quantity_delta=Decimal("99.000"),
                    reason="Foreign stock",
                ),
            ])
            session.commit()
            first_id = first.id
            foreign_business_id = foreign_business.id

        client = TestClient(app)
        base = f"/api/v1/businesses/{business_id}/inventory/movements"
        page_one = client.get(base, params={"limit": 2, "offset": 0})
        assert page_one.status_code == 200, page_one.text
        body = page_one.json()
        assert len(body["items"]) == 2
        assert body["has_more"] is True
        assert all(row["product"]["id"] in {str(first_id), str(second.id)} for row in body["items"])
        assert body["items"][0]["movement_type"] == "adjustment"

        page_two = client.get(base, params={"limit": 2, "offset": 2})
        assert page_two.status_code == 200, page_two.text
        assert len(page_two.json()["items"]) == 1
        assert page_two.json()["has_more"] is False

        filtered = client.get(base, params={
            "product_id": str(first_id), "movement_type": "receipt",
            "reference_type": "purchase_order",
        })
        assert filtered.status_code == 200, filtered.text
        assert len(filtered.json()["items"]) == 1
        assert filtered.json()["items"][0]["quantity_delta"] == "2.000"

        invalid = client.get(base, params={"movement_type": "supplier_payment"})
        assert invalid.status_code == 422

        foreign = client.get(
            f"/api/v1/businesses/{foreign_business_id}/inventory/movements"
        )
        assert foreign.status_code == 403
    finally:
        _restore_test_identity(*previous)
        engine.dispose()
