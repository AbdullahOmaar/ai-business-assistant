"""Payables-aging report (C2, 3A-726): what the business owes suppliers.

The mirror of receivables-aging for the purchase side. Approved and
received purchase orders, summed per supplier and currency, without
cross-currency netting. Outstanding equals received totals because
no supplier-payment records exist yet — that is stated in the
response, not hidden.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.extended_api import _payable_classify, _payable_outstanding
from app.main import app
from app.models import (
    Base,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    Supplier,
)
from app.security import AuthenticatedPrincipal


def _environment():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.session_factory = factory
    subject = {"value": "payables-owner"}

    def resolver(request):
        return AuthenticatedPrincipal(subject["value"])

    app.state.principal_resolver = resolver
    return factory, subject, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def test_payable_classify_by_status() -> None:
    assert _payable_classify("draft") == (False, False)
    assert _payable_classify("approved") == (True, False)
    assert _payable_classify("partially_received") == (True, True)
    assert _payable_classify("received") == (True, True)


def test_payable_outstanding_flags_overpayment() -> None:
    assert _payable_outstanding(Decimal("100.00"), Decimal(0)) == (
        Decimal("100.00"), False
    )
    assert _payable_outstanding(Decimal("100.00"), Decimal("100.00")) == (
        Decimal("0.00"), False
    )
    assert _payable_outstanding(Decimal("100.00"), Decimal("110.00")) == (
        Decimal("-10.00"), True
    )


def _seed(factory, business_id: UUID):
    """One supplier with four orders: draft, approved, partially
    received, received — plus a cancelled order that must not appear."""
    with factory() as session:
        supplier = Supplier(
            business_id=business_id, name="Nile Supplies",
        )
        session.add(supplier)
        session.flush()
        product = Product(
            business_id=business_id, name="Widget", is_active=True,
            is_stock_tracked=False, unit_price=Decimal("5.00"),
        )
        session.add(product)
        session.flush()
        orders = {}
        for status, total in (
            ("draft", "10.00"),
            ("approved", "20.00"),
            ("partially_received", "30.00"),
            ("received", "40.00"),
            ("cancelled", "999.00"),
        ):
            order = PurchaseOrder(
                business_id=business_id, supplier_id=supplier.id,
                order_number=f"PO-{status}", status=status,
                currency_code="EGP", total=Decimal(total),
            )
            session.add(order)
            session.flush()
            session.add(PurchaseOrderLine(
                business_id=business_id, purchase_order_id=order.id,
                product_id=product.id,
                quantity=Decimal(1), unit_cost=Decimal(total),
                received_quantity=Decimal(1) if status == "received" else Decimal(0),
            ))
            orders[status] = order
        session.commit()
        return supplier.id, orders


def test_payables_aging_sums_per_supplier_and_excludes_drafts_and_cancelled():
    factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business = client.post(
            "/api/v1/businesses", json={"name": "Payables Shop", "currency_code": "EGP"}
        )
        assert business.status_code == 201, business.text
        business_id = UUID(business.json()["id"])
        supplier_id, _orders = _seed(factory, business_id)

        response = client.get(f"/api/v1/businesses/{business_id}/reports/payables-aging")
        assert response.status_code == 200, response.text
        body = response.json()
        # Draft (10) and cancelled (999) contribute nothing; approved
        # (20) counts as ordered only; partially received (30) and
        # received (40) count as ordered and received.
        assert body["order_count"] == 3
        assert len(body["by_supplier"]) == 1
        summary = body["by_supplier"][0]
        assert summary["supplier_id"] == str(supplier_id)
        assert summary["supplier_name"] == "Nile Supplies"
        assert summary["currency_code"] == "EGP"
        assert summary["ordered_total"] == "90.00"
        assert summary["received_total"] == "70.00"
        assert summary["outstanding_total"] == "70.00"
        assert "No supplier-payment records exist yet" in body["note"]
        assert {row["status"] for row in body["orders"]} == {
            "approved", "partially_received", "received",
        }
    finally:
        _restore(previous_factory, previous_resolver)


def test_payables_aging_is_tenant_scoped():
    factory, subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        first = client.post(
            "/api/v1/businesses", json={"name": "First Shop", "currency_code": "EGP"}
        )
        assert first.status_code == 201, first.text
        first_id = UUID(first.json()["id"])
        _seed(factory, first_id)

        second = client.post(
            "/api/v1/businesses", json={"name": "Second Shop", "currency_code": "EGP"}
        )
        assert second.status_code == 201, second.text
        second_id = UUID(second.json()["id"])
        # The caller owns both businesses here; the second has no orders,
        # so its report must be empty — the first business's orders must
        # not leak across.
        response = client.get(f"/api/v1/businesses/{second_id}/reports/payables-aging")
        assert response.status_code == 200, response.text
        assert response.json()["order_count"] == 0
        assert response.json()["by_supplier"] == []

        # A non-member gets 403.
        subject["value"] = "payables-stranger"
        denied = client.get(f"/api/v1/businesses/{first_id}/reports/payables-aging")
        assert denied.status_code == 403, denied.text
    finally:
        _restore(previous_factory, previous_resolver)


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
