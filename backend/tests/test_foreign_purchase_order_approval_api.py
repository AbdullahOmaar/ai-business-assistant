"""Cross-tenant authorization regression for purchase-order approval."""

from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import AuditEvent, Business, BusinessMembership, PurchaseOrder, StockMovement, Supplier
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture


def test_non_member_cannot_approve_foreign_business_purchase_order():
    engine, member_business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        foreign_business = Business(name="Foreign approval shop", currency_code="EGP")
        session.add(foreign_business)
        session.flush()
        supplier = Supplier(business_id=foreign_business.id, name="Foreign supplier")
        session.add(supplier)
        session.flush()
        order = PurchaseOrder(
            business_id=foreign_business.id,
            supplier_id=supplier.id,
            order_number="PO-FOREIGN-APPROVAL-1",
            status="draft",
            currency_code="EGP",
            total=Decimal("25.00"),
        )
        session.add(order)
        session.commit()
        foreign_business_id, order_id = foreign_business.id, order.id

    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        with Session(engine) as session:
            before = (
                session.get(PurchaseOrder, order_id).status,
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == foreign_business_id,
                )),
                session.scalar(select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == foreign_business_id,
                )),
            )

        denied = client.post(
            f"/api/v1/businesses/{foreign_business_id}/purchase-orders/{order_id}/approve"
        )
        assert denied.status_code == 403, denied.text

        with Session(engine) as session:
            after = (
                session.get(PurchaseOrder, order_id).status,
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == foreign_business_id,
                )),
                session.scalar(select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == foreign_business_id,
                )),
            )
            assert after == before
            assert session.scalar(select(func.count()).select_from(BusinessMembership).where(
                BusinessMembership.business_id == foreign_business_id,
                BusinessMembership.user_subject == "test-subject",
            )) == 0
        assert member_business_id != foreign_business_id
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
