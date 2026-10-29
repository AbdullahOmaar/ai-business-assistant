from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import (
    AuditEvent, Base, Business, BusinessMembership, InvoiceLine, MembershipRole,
    Product, PurchaseOrder, PurchaseOrderLine, SalesReturn, SalesReturnLine,
    StockMovement, Supplier,
)
from app.security import AuthenticatedPrincipal, AuthorizationError
from app.services import create_customer, create_invoice, create_product, issue_invoice, record_stock_movement, void_invoice
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


def test_purchase_receiving_requires_owner_role(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Restricted Supplier")
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Restricted Stock", unit_price=Decimal("10"), is_stock_tracked=True,
        )
        session.add(supplier)
        session.flush()
        order = PurchaseOrder(
            business_id=business_id, supplier_id=supplier.id,
            order_number="PO-OWNER-ONLY", status="approved", currency_code="EGP",
            total=Decimal("10"),
        )
        session.add(order)
        session.flush()
        line = PurchaseOrderLine(
            business_id=business_id, purchase_order_id=order.id,
            product_id=product.id, quantity=Decimal("1"),
            unit_cost=Decimal("10"), received_quantity=Decimal("0"),
        )
        session.add(line)
        membership = session.scalar(select(BusinessMembership).where(
            BusinessMembership.business_id == business_id,
        ))
        membership.role = MembershipRole.STAFF
        session.flush()

        with pytest.raises(AuthorizationError, match="role is not permitted"):
            receive_purchase_order(
                session, principal=principal, business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={line.id: Decimal("1")},
            )



def test_purchase_receiving_over_receipt_rejects_without_side_effects(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Over-receipt Supplier")
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Over-receipt Stock", unit_price=Decimal("10"), is_stock_tracked=True,
        )
        session.add(supplier)
        session.flush()
        order = PurchaseOrder(
            business_id=business_id, supplier_id=supplier.id,
            order_number="PO-OVER-RECEIPT", status="approved", currency_code="EGP",
            total=Decimal("100"),
        )
        session.add(order)
        session.flush()
        line = PurchaseOrderLine(
            business_id=business_id, purchase_order_id=order.id,
            product_id=product.id, quantity=Decimal("10"),
            unit_cost=Decimal("10"), received_quantity=Decimal("0"),
        )
        session.add(line)
        session.flush()
        session.commit()

        movement_count_before = session.scalar(select(func.count()).select_from(StockMovement))
        movement_quantity_before = session.scalar(select(func.coalesce(
            func.sum(StockMovement.quantity_delta), 0
        )).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product.id,
        ))
        audit_count_before = session.scalar(select(func.count()).select_from(AuditEvent))

        with pytest.raises(WorkflowError, match="cannot exceed ordered quantity"):
            receive_purchase_order(
                session, principal=principal, business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={line.id: Decimal("11")},
            )

        session.expire_all()
        persisted_line = session.get(PurchaseOrderLine, line.id)
        assert persisted_line.received_quantity == Decimal("0.000")
        assert session.scalar(select(func.count()).select_from(StockMovement)) == movement_count_before
        movement_quantity_after = session.scalar(select(func.coalesce(
            func.sum(StockMovement.quantity_delta), 0
        )).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product.id,
        ))
        assert Decimal(str(movement_quantity_after)) == Decimal(str(movement_quantity_before))
        assert session.scalar(select(func.count()).select_from(AuditEvent)) == audit_count_before
        persisted_order = session.get(PurchaseOrder, order.id)
        assert persisted_order.status == "approved"


def test_sales_return_approval_rejects_quantity_over_original_sale(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Tea Customer",
        )
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
            customer_id=customer.id,
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


def test_sales_return_approval_rejects_amount_above_original_line_value(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Refund Customer",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Service", unit_price=Decimal("8"), is_stock_tracked=False,
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-RETURN-AMOUNT", currency_code="EGP",
            customer_id=customer.id,
            lines=[{"product_id": str(product.id), "quantity": "2"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        line = session.scalar(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
        sales_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(sales_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id, sales_return_id=sales_return.id,
            invoice_line_id=line.id, quantity=Decimal("1"),
            amount=Decimal("17.00"),
        ))
        session.flush()
        with pytest.raises(ValueError, match="return amount exceeds"):
            approve_sales_return(
                session, principal=principal, business_id=business_id,
                sales_return_id=sales_return.id,
            )


def test_sales_return_approval_rejects_cumulative_amount_above_original_line(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Refund Customer",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Service", unit_price=Decimal("8"), is_stock_tracked=False,
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-RETURN-CUMULATIVE", currency_code="EGP",
            customer_id=customer.id,
            lines=[{"product_id": str(product.id), "quantity": "2"}],
            discount_rate=Decimal("25"),
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        line = session.scalar(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
        first_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(first_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id, sales_return_id=first_return.id,
            invoice_line_id=line.id, quantity=Decimal("1"),
            amount=Decimal("6.00"),
        ))
        session.flush()
        approve_sales_return(
            session, principal=principal, business_id=business_id,
            sales_return_id=first_return.id,
        )
        session.flush()

        second_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(second_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id, sales_return_id=second_return.id,
            invoice_line_id=line.id, quantity=Decimal("1"),
            amount=Decimal("7.00"),
        ))
        session.flush()
        with pytest.raises(ValueError, match="return amount exceeds"):
            approve_sales_return(
                session, principal=principal, business_id=business_id,
                sales_return_id=second_return.id,
            )


def test_sales_return_approval_aggregates_duplicate_lines_before_validation(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Duplicate Return Customer",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Service", unit_price=Decimal("8"), is_stock_tracked=False,
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-RETURN-DUPLICATES", currency_code="EGP",
            customer_id=customer.id,
            lines=[{"product_id": str(product.id), "quantity": "1"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        line = session.scalar(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
        sales_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(sales_return)
        session.flush()
        session.add_all([
            SalesReturnLine(
                business_id=business_id, sales_return_id=sales_return.id,
                invoice_line_id=line.id, quantity=Decimal("1"),
                amount=Decimal("8.00"),
            ),
            SalesReturnLine(
                business_id=business_id, sales_return_id=sales_return.id,
                invoice_line_id=line.id, quantity=Decimal("1"),
                amount=Decimal("8.00"),
            ),
        ])
        session.flush()
        with pytest.raises(ValueError, match="return quantity exceeds"):
            approve_sales_return(
                session, principal=principal, business_id=business_id,
                sales_return_id=sales_return.id,
            )


def test_sales_return_approval_requires_owner_role(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Role Guard Customer",
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-RETURN-ROLE", currency_code="EGP",
            customer_id=customer.id,
            lines=[{"description": "Service", "quantity": "1", "unit_price": "8.00"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        line = session.scalar(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
        sales_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(sales_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id, sales_return_id=sales_return.id,
            invoice_line_id=line.id, quantity=Decimal("1"),
            amount=Decimal("8.00"),
        ))
        membership = session.scalar(select(BusinessMembership).where(
            BusinessMembership.business_id == business_id,
        ))
        membership.role = MembershipRole.STAFF
        session.flush()
        with pytest.raises(AuthorizationError, match="role is not permitted"):
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


def test_invoice_void_rejects_invoice_with_approved_sales_return(operation_workspace):
    engine, business_id, principal = operation_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Returned Goods Customer",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Returned Goods", unit_price=Decimal("10.00"), is_stock_tracked=True,
        )
        record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=product.id, movement_type="opening",
            quantity_delta=Decimal("10.000"), reason="Opening stock",
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-RETURN-VOID", currency_code="EGP",
            customer_id=customer.id,
            lines=[{"product_id": str(product.id), "quantity": "10"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id, invoice_id=invoice.id,
        )
        line = session.scalar(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        ))
        sales_return = SalesReturn(
            business_id=business_id, invoice_id=invoice.id, status="draft",
        )
        session.add(sales_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id, sales_return_id=sales_return.id,
            invoice_line_id=line.id, quantity=Decimal("3.000"), amount=Decimal("30.00"),
        ))
        session.flush()
        approve_sales_return(
            session, principal=principal, business_id=business_id,
            sales_return_id=sales_return.id,
        )
        session.flush()

        with pytest.raises(WorkflowError, match="approved sales returns"):
            void_invoice(
                session, principal=principal, business_id=business_id,
                invoice_id=invoice.id, reason="Must not double-restore returned stock",
            )

        assert invoice.status == "issued"
        balance = session.scalar(select(func.sum(
            StockMovement.quantity_delta
        )).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product.id,
        ))
        assert Decimal(str(balance)) == Decimal("3.000")
        assert session.scalar(select(StockMovement).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product.id,
            StockMovement.reference_type == "invoice_void",
            StockMovement.reference_id == invoice.id,
        )) is None
