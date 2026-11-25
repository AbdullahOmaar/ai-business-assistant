"""Bulk operations (C8 Part 2, 3A-686): per-item results over the
existing single-item operations, owner-only, capped, audited once per
call as a summary (the single-item operations keep their own events).
"""
from __future__ import annotations

from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AuditEvent,
    Base,
    BusinessMembership,
    Customer,
    MembershipRole,
    Product,
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
    subject = {"value": "bulk-owner"}

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


def _seed(client: TestClient) -> dict:
    business = client.post(
        "/api/v1/businesses", json={"name": "Bulk Co", "currency_code": "EGP"}
    )
    assert business.status_code == 201, business.text
    base = f"/api/v1/businesses/{business.json()['id']}"
    customer = client.post(f"{base}/customers", json={"name": "Cust One"})
    assert customer.status_code == 201, customer.text
    customer2 = client.post(f"{base}/customers", json={"name": "Cust Two"})
    assert customer2.status_code == 201, customer2.text
    supplier = client.post(f"{base}/suppliers", json={"name": "Supp One"})
    assert supplier.status_code == 201, supplier.text
    product = client.post(
        f"{base}/products",
        json={"name": "Prod One", "unit_price": "10.00",
              "is_stock_tracked": True, "opening_quantity": "10"},
    )
    assert product.status_code == 201, product.text

    def make_invoice(number: str) -> str:
        response = client.post(
            f"{base}/invoices",
            json={"invoice_number": number, "currency_code": "EGP",
                  "customer_id": customer.json()["id"],
                  "lines": [{"product_id": product.json()["id"],
                             "quantity": "1", "unit_price": "10.00"}]},
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    def make_po(number: str) -> str:
        response = client.post(
            f"{base}/purchase-orders",
            json={"supplier_id": supplier.json()["id"],
                  "order_number": number, "currency_code": "EGP",
                  "lines": [{"product_id": product.json()["id"],
                             "quantity": "1", "unit_cost": "5.00"}]},
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    return {
        "business_id": business.json()["id"],
        "base": base,
        "customer_id": customer.json()["id"],
        "customer2_id": customer2.json()["id"],
        "product_id": product.json()["id"],
        "invoice_a": make_invoice("INV-BULK-A"),
        "invoice_b": make_invoice("INV-BULK-B"),
        "po_draft": make_po("PO-BULK-DRAFT"),
        "po_approved": make_po("PO-BULK-APPROVED"),
    }


def _actions(factory, business_id: str) -> list[str]:
    with factory() as session:
        return list(
            session.scalars(
                select(AuditEvent.action).where(
                    AuditEvent.business_id == UUID(business_id)
                )
            )
        )


def test_bulk_void_partial_failure_and_summary_audit() -> None:
    factory, _subject, pf, pr = _environment()
    try:
        client = TestClient(app)
        seed = _seed(client)
        # Approve one PO so its bulk-cancel below must fail per-item.
        approved = client.post(
            f"{seed['base']}/purchase-orders/{seed['po_approved']}/approve",
            json={},
        )
        assert approved.status_code == 200, approved.text

        missing = str(uuid4())
        result = client.post(
            f"{seed['base']}/invoices/bulk-void",
            json={"ids": [seed["invoice_a"], missing, seed["invoice_b"]]},
        )
        assert result.status_code == 200, result.text
        body = result.json()
        assert body["total"] == 3
        assert sorted(body["succeeded"]) == sorted(
            [seed["invoice_a"], seed["invoice_b"]]
        )
        assert len(body["failed"]) == 1
        assert body["failed"][0]["id"] == missing
        assert "not found" in body["failed"][0]["reason"].lower()

        actions = _actions(factory, seed["business_id"])
        assert actions.count("invoice.voided") == 2
        assert actions.count("invoice.bulk_voided") == 1

        cancel = client.post(
            f"{seed['base']}/purchase-orders/bulk-cancel",
            json={"ids": [seed["po_draft"], seed["po_approved"]]},
        )
        assert cancel.status_code == 200, cancel.text
        cancel_body = cancel.json()
        assert cancel_body["succeeded"] == [seed["po_draft"]]
        assert len(cancel_body["failed"]) == 1
        assert cancel_body["failed"][0]["id"] == seed["po_approved"]
        actions = _actions(factory, seed["business_id"])
        assert actions.count("purchase_order.cancelled") == 1
        assert actions.count("purchase_order.bulk_cancelled") == 1
    finally:
        _restore(pf, pr)


def test_bulk_deactivate_customers_and_products() -> None:
    factory, _subject, pf, pr = _environment()
    try:
        client = TestClient(app)
        seed = _seed(client)
        result = client.post(
            f"{seed['base']}/customers/bulk-deactivate",
            json={"ids": [seed["customer_id"], seed["customer2_id"],
                          str(uuid4())]},
        )
        assert result.status_code == 200, result.text
        body = result.json()
        assert sorted(body["succeeded"]) == sorted(
            [seed["customer_id"], seed["customer2_id"]]
        )
        assert len(body["failed"]) == 1

        products = client.post(
            f"{seed['base']}/products/bulk-deactivate",
            json={"ids": [seed["product_id"]]},
        )
        assert products.status_code == 200, products.text
        assert products.json()["succeeded"] == [seed["product_id"]]

        with factory() as session:
            customers = session.scalars(select(Customer)).all()
            assert all(not c.is_active for c in customers)
            product = session.scalars(select(Product)).one()
            assert not product.is_active
        actions = _actions(factory, seed["business_id"])
        assert actions.count("customer.deactivated") == 2
        assert actions.count("customer.bulk_deactivated") == 1
        assert actions.count("product.deactivated") == 1
        assert actions.count("product.bulk_deactivated") == 1
    finally:
        _restore(pf, pr)


def test_bulk_limits_and_owner_only() -> None:
    factory, subject, pf, pr = _environment()
    try:
        client = TestClient(app)
        seed = _seed(client)
        empty = client.post(
            f"{seed['base']}/invoices/bulk-void", json={"ids": []}
        )
        assert empty.status_code == 422, empty.text
        too_many = client.post(
            f"{seed['base']}/invoices/bulk-void",
            json={"ids": [str(uuid4()) for _ in range(101)]},
        )
        assert too_many.status_code == 422, too_many.text

        with factory() as session:
            session.add(
                BusinessMembership(
                    business_id=UUID(seed["business_id"]),
                    user_subject="bulk-staff",
                    role=MembershipRole.STAFF,
                )
            )
            session.commit()
        subject["value"] = "bulk-staff"
        for path, payload in [
            ("/invoices/bulk-void", {"ids": [seed["invoice_a"]]}),
            ("/purchase-orders/bulk-cancel", {"ids": [seed["po_draft"]]}),
            ("/customers/bulk-deactivate", {"ids": [seed["customer_id"]]}),
            ("/products/bulk-deactivate", {"ids": [seed["product_id"]]}),
        ]:
            denied = client.post(f"{seed['base']}{path}", json=payload)
            assert denied.status_code == 403, (path, denied.text)
    finally:
        _restore(pf, pr)


def test_bulk_export_ids_filter() -> None:
    _factory, _subject, pf, pr = _environment()
    try:
        client = TestClient(app)
        seed = _seed(client)
        one = client.get(
            f"{seed['base']}/exports/customers.csv",
            params={"ids": seed["customer_id"]},
        )
        assert one.status_code == 200, one.text
        lines = [ln for ln in one.text.strip().splitlines() if ln]
        assert len(lines) == 2  # header + the one selected customer
        assert "Cust One" in one.text
        assert "Cust Two" not in one.text

        bad = client.get(
            f"{seed['base']}/exports/customers.csv",
            params={"ids": "not-a-uuid"},
        )
        assert bad.status_code == 422, bad.text
    finally:
        _restore(pf, pr)
