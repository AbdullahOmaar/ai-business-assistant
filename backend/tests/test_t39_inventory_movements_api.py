"""API coverage for the tenant-scoped stock movement ledger."""
import os
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from test_api import (
    _configure_test_identity,
    _restore_test_identity,
    _sales_return_fixture,
)

from app.main import app
from app.models import (
    AuditEvent,
    Business,
    BusinessMembership,
    MembershipRole,
    Product,
    StockMovement,
)


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
            now = datetime.now(UTC)
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
            second_id = second.id
            foreign_business_id = foreign_business.id

        client = TestClient(app)
        base = f"/api/v1/businesses/{business_id}/inventory/movements"
        page_one = client.get(base, params={"limit": 2, "offset": 0})
        assert page_one.status_code == 200, page_one.text
        body = page_one.json()
        assert len(body["items"]) == 2
        assert body["has_more"] is True
        assert all(row["product"]["id"] in {str(first_id), str(second_id)} for row in body["items"])
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



def test_inventory_movement_ledger_allows_staff_and_get_has_no_side_effects():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        with Session(engine) as session:
            membership = session.query(BusinessMembership).filter_by(
                business_id=business_id, user_subject="test-subject"
            ).one()
            membership.role = MembershipRole.STAFF
            product = Product(
                business_id=business_id, name="Staff ledger item",
                unit_price=Decimal("8.00"), is_stock_tracked=True,
            )
            session.add(product)
            session.flush()
            movement = StockMovement(
                business_id=business_id, product_id=product.id,
                movement_type="opening", quantity_delta=Decimal("4.000"),
                reason="Staff read fixture",
            )
            session.add(movement)
            session.commit()
            movement_id = movement.id
            product_id = product.id
            movement_count = session.query(StockMovement).count()
            audit_count = session.query(AuditEvent).count()

        response = TestClient(app).get(
            f"/api/v1/businesses/{business_id}/inventory/movements"
        )
        assert response.status_code == 200, response.text
        assert any(row["id"] == str(movement_id) for row in response.json()["items"])

        with Session(engine) as session:
            assert session.query(StockMovement).count() == movement_count
            assert session.query(AuditEvent).count() == audit_count
            assert session.get(Product, product_id) is not None
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_inventory_movement_ledger_has_stable_tie_order_and_composed_filters():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        with Session(engine) as session:
            product = Product(
                business_id=business_id, name="Tie order item",
                unit_price=Decimal("9.00"), is_stock_tracked=True,
            )
            session.add(product)
            session.flush()
            timestamp = datetime(2026, 11, 17, 10, 0, tzinfo=UTC)
            movements = [
                StockMovement(
                    business_id=business_id, product_id=product.id,
                    movement_type="adjustment", quantity_delta=Decimal(value),
                    reason=f"tie {index}", reference_type="stock_count",
                    reference_id=uuid4(), created_at=timestamp,
                )
                for index, value in enumerate(("1.000", "2.000", "3.000"))
            ]
            session.add_all(movements)
            session.commit()
            expected_ids = sorted((str(item.id) for item in movements), reverse=True)
            product_id = product.id

        base = f"/api/v1/businesses/{business_id}/inventory/movements"
        response = TestClient(app).get(base, params={
            "product_id": str(product_id),
            "movement_type": "adjustment",
            "reference_type": "stock_count",
            "limit": 2,
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert [row["id"] for row in body["items"]] == expected_ids[:2]
        assert body["has_more"] is True
        assert all(row["product"]["id"] == str(product_id) for row in body["items"])
        assert all(row["reference_type"] == "stock_count" for row in body["items"])
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_inventory_movement_ledger_rejects_pagination_boundaries():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        base = f"/api/v1/businesses/{business_id}/inventory/movements"
        for params in ({"limit": 0}, {"limit": 201}, {"offset": -1}):
            response = client.get(base, params=params)
            assert response.status_code == 422, (params, response.text)
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_inventory_movement_ledger_foreign_or_missing_product_filter_is_empty():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        with Session(engine) as session:
            foreign_business = Business(name="Foreign product tenant", currency_code="EGP")
            session.add(foreign_business)
            session.flush()
            foreign_product = Product(
                business_id=foreign_business.id, name="Foreign product",
                unit_price=Decimal("5.00"), is_stock_tracked=True,
            )
            session.add(foreign_product)
            session.commit()
            foreign_product_id = foreign_product.id

        base = f"/api/v1/businesses/{business_id}/inventory/movements"
        client = TestClient(app)
        for product_id in (foreign_product_id, uuid4()):
            response = client.get(base, params={"product_id": str(product_id)})
            assert response.status_code == 200, response.text
            assert response.json()["items"] == []
            assert response.json()["has_more"] is False
    finally:
        _restore_test_identity(*previous)
        engine.dispose()



def test_inventory_movement_ledger_postgres_tenant_read_only_and_pagination():
    """Exercise tenant joins and read-only ledger behavior on disposable PostgreSQL."""
    if os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true":
        pytest.skip("requires the isolated PostgreSQL CI service")
    database_url = os.getenv("TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    engine = create_engine(database_url, pool_size=3, max_overflow=2, pool_pre_ping=True)
    if engine.dialect.name != "postgresql" or not (engine.url.database or "").endswith("_test"):
        engine.dispose()
        pytest.skip("ledger regression requires a disposable PostgreSQL *_test database")

    previous = None
    try:
        with Session(engine) as session:
            own_business = Business(name="T39 ledger PostgreSQL tenant", currency_code="EGP")
            foreign_business = Business(name="T39 ledger PostgreSQL foreign", currency_code="EGP")
            session.add_all([own_business, foreign_business])
            session.flush()
            session.add(BusinessMembership(
                business_id=own_business.id,
                user_subject="test-subject",
                role=MembershipRole.STAFF,
            ))
            own_product = Product(
                business_id=own_business.id, name="PG ledger own",
                unit_price=Decimal("10.00"), is_stock_tracked=True,
            )
            foreign_product = Product(
                business_id=foreign_business.id, name="PG ledger foreign",
                unit_price=Decimal("10.00"), is_stock_tracked=True,
            )
            session.add_all([own_product, foreign_product])
            session.flush()
            timestamp = datetime(2026, 11, 17, 12, 0, tzinfo=UTC)
            own_movements = [
                StockMovement(
                    business_id=own_business.id, product_id=own_product.id,
                    movement_type="adjustment", quantity_delta=Decimal(value),
                    reason=f"PG tie {index}", reference_type="stock_count",
                    reference_id=uuid4(), created_at=timestamp,
                )
                for index, value in enumerate(("1.000", "2.000", "3.000"))
            ]
            session.add_all(own_movements)
            session.add(StockMovement(
                business_id=foreign_business.id, product_id=foreign_product.id,
                movement_type="opening", quantity_delta=Decimal("99.000"),
                reason="Foreign tenant movement",
            ))
            session.commit()
            own_business_id = own_business.id
            foreign_business_id = foreign_business.id
            own_product_id = own_product.id
            foreign_product_id = foreign_product.id
            expected_ids = sorted((str(item.id) for item in own_movements), reverse=True)

        previous = _configure_test_identity(engine)
        client = TestClient(app)
        base = f"/api/v1/businesses/{own_business_id}/inventory/movements"
        with Session(engine) as session:
            movement_count = session.query(StockMovement).filter_by(
                business_id=own_business_id
            ).count()
            audit_count = session.query(AuditEvent).filter_by(
                business_id=own_business_id
            ).count()

        first = client.get(base, params={
            "product_id": str(own_product_id),
            "movement_type": "adjustment",
            "reference_type": "stock_count",
            "limit": 2,
            "offset": 0,
        })
        assert first.status_code == 200, first.text
        assert [row["id"] for row in first.json()["items"]] == expected_ids[:2]
        assert first.json()["has_more"] is True

        second = client.get(base, params={"limit": 2, "offset": 2})
        assert second.status_code == 200, second.text
        assert len(second.json()["items"]) == 1
        assert second.json()["has_more"] is False

        foreign_product = client.get(base, params={"product_id": str(foreign_product_id)})
        assert foreign_product.status_code == 200, foreign_product.text
        assert foreign_product.json()["items"] == []

        foreign_business = client.get(
            f"/api/v1/businesses/{foreign_business_id}/inventory/movements"
        )
        assert foreign_business.status_code == 403, foreign_business.text

        with Session(engine) as session:
            assert session.query(StockMovement).filter_by(
                business_id=own_business_id
            ).count() == movement_count
            assert session.query(AuditEvent).filter_by(
                business_id=own_business_id
            ).count() == audit_count
    finally:
        if previous is not None:
            _restore_test_identity(*previous)
        engine.dispose()
