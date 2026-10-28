"""API-level least-privilege regression for purchase-order approval."""

from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import (
    AuditEvent,
    BusinessMembership,
    MembershipRole,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    StockMovement,
    Supplier,
)
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture


def test_staff_cannot_approve_purchase_order_and_owner_can():
    engine, business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Approval supplier")
        product = Product(
            business_id=business_id,
            name="Approval stock",
            unit_price=Decimal("8.00"),
            is_stock_tracked=True,
        )
        session.add_all([supplier, product])
        session.commit()
        supplier_id, product_id = supplier.id, product.id

    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}"
    try:
        created = client.post(
            f"{base}/purchase-orders",
            json={
                "supplier_id": str(supplier_id),
                "order_number": "PO-ROLE-MATRIX-1",
                "currency_code": "EGP",
                "lines": [{
                    "product_id": str(product_id),
                    "quantity": "2.000",
                    "unit_cost": "5.00",
                }],
            },
        )
        assert created.status_code == 201, created.text
        assert created.json()["status"] == "draft"
        order_id = created.json()["id"]

        with Session(engine) as session:
            membership = session.scalar(select(BusinessMembership).where(
                BusinessMembership.business_id == business_id,
                BusinessMembership.user_subject == "test-subject",
            ))
            assert membership is not None
            membership.role = MembershipRole.STAFF
            session.commit()

            before = (
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                )),
                session.get(PurchaseOrder, order_id).status,
                session.scalar(select(func.count()).select_from(PurchaseOrderLine).where(
                    PurchaseOrderLine.purchase_order_id == order_id,
                )),
                session.scalar(select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == business_id,
                )),
            )

        denied = client.post(f"{base}/purchase-orders/{order_id}/approve")
        assert denied.status_code == 403, denied.text

        with Session(engine) as session:
            after = (
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                )),
                session.get(PurchaseOrder, order_id).status,
                session.scalar(select(func.count()).select_from(PurchaseOrderLine).where(
                    PurchaseOrderLine.purchase_order_id == order_id,
                )),
                session.scalar(select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == business_id,
                )),
            )
            assert after == before
            membership = session.scalar(select(BusinessMembership).where(
                BusinessMembership.business_id == business_id,
                BusinessMembership.user_subject == "test-subject",
            ))
            assert membership is not None
            membership.role = MembershipRole.OWNER
            session.commit()

        approved = client.post(f"{base}/purchase-orders/{order_id}/approve")
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"

        with Session(engine) as session:
            assert session.get(PurchaseOrder, order_id).status == "approved"
            assert session.scalar(select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.approved",
            )) == 1
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
