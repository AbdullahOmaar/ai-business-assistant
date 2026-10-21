from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import (
    Base, Business, BusinessMembership, InvoiceLine, MembershipRole,
    Product, PurchaseOrder, PurchaseOrderLine, SalesReturn, SalesReturnLine,
    StockMovement, Supplier,
)
from app.security import AuthenticatedPrincipal
from app.services import create_invoice, create_product, issue_invoice, record_stock_movement
from app.operations import (
    WorkflowError, approve_sales_return, financial_summary, queue_notification,
    receive_purchase_order,
)


@pytest.fixture()
def operation_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Operations Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id, user_subject="ops-user",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        yield engine, business.id, AuthenticatedPrincipal(subject="ops-user")
    engine.dispose()


def test_purchase_receiving_records_stock_and_completes_order(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Local Supplier")
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Rice", unit_price=Decimal("25"), is_stock_tracked=True,
        )
        session.add(supplier)
        session.flush()
        order = PurchaseOrder(
            business_id=business_id, supplier_id=supplier.id,
            order_number="PO-1", status="approved", currency_code="EGP",
            total=Decimal("250"),
        )
        session.add(order)
        session.flush()
        line = PurchaseOrderLine(
            business_id=business_id, purchase_order_id=order.id,
            product_id=product.id, quantity=Decimal("10"),
            unit_cost=Decimal("20"), received_quantity=Decimal("0"),
        )
        session.add(line)
        session.flush()

        partial = receive_purchase_order(
            session, principal=principal, business_id=business_id,
            purchase_order_id=order.id, received_quantities={line.id: Decimal("4")},
        )
        assert partial.status == "partially_received"
        completed = receive_purchase_order(
            session, principal=principal, business_id=business_id,
            purchase_order_id=order.id, received_quantities={line.id: Decimal("6")},
        )
        session.commit()
        assert completed.status == "received"
        assert session.scalar(select(StockMovement).where(
            StockMovement.reference_id == order.id,
        )) is not None


def test_sales_return_approval_rejects_quantity_over_original_sale(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Tea", unit_price=Decimal("8"), is_stock_tracked=True,
        )
        record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=product.id, movement_type="opening",
            quantity_delta=Decimal("2.000"), reason="Opening count",
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-R", currency_code="EGP",
            lines=[{"product_id": str(product.id), "quantity": "2"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        line = session.scalar(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
        ))
        sales_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(sales_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id, sales_return_id=sales_return.id,
            invoice_line_id=line.id, quantity=Decimal("3"),
            amount=Decimal("24"),
        ))
        session.flush()
        with pytest.raises(ValueError, match="exceeds remaining"):
            approve_sales_return(
                session, principal=principal, business_id=business_id,
                sales_return_id=sales_return.id,
            )


def test_notification_deduplication_and_currency_separated_summary(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        first = queue_notification(
            session, principal=principal, business_id=business_id,
            kind="reminder", title="Due", body="Invoice due",
            deduplication_key="invoice-due-1",
        )
        second = queue_notification(
            session, principal=principal, business_id=business_id,
            kind="reminder", title="Duplicate", body="Should not duplicate",
            deduplication_key="invoice-due-1",
        )
        summary = financial_summary(
            session, principal=principal, business_id=business_id,
        )
        session.commit()
        assert first.id == second.id
        assert summary == {
            "issued_invoices": {},
            "allocated_payments": {},
            "expenses": {},
        }
