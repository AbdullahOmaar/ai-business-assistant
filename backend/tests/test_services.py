from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import (
    AuditEvent, Base, Business, BusinessMembership, Invoice, InvoiceLine,
    MembershipRole, Payment, PaymentAllocation, Product, StockMovement,
)
from app.security import AuthenticatedPrincipal, AuthorizationError
from app.services import (
    WorkflowError, create_customer, create_invoice, create_product,
    issue_invoice, record_payment, record_stock_movement,
)


@pytest.fixture()
def workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Test Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id, user_subject="user-123",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        yield engine, business.id, AuthenticatedPrincipal(subject="user-123")
    engine.dispose()


def test_customer_creation_requires_membership_and_writes_audit(workspace):
    engine, business_id, principal = workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="  Ali  ",
        )
        session.commit()
        assert customer.name == "Ali"
        assert session.scalar(select(AuditEvent).where(
            AuditEvent.target_id == str(customer.id),
            AuditEvent.action == "customer.created",
        )) is not None


def test_cross_business_access_is_denied(workspace):
    engine, _, principal = workspace
    with Session(engine) as session:
        with pytest.raises(AuthorizationError):
            create_customer(
                session, principal=principal, business_id=uuid4(), name="Not mine",
            )


def test_invoice_uses_catalog_price_and_issue_requires_draft(workspace):
    engine, business_id, principal = workspace
    with Session(engine) as session:
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Coffee", unit_price=Decimal("10.00"),
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-001", currency_code="egp",
            lines=[{"product_id": str(product.id), "quantity": "2"}],
            tax_rate=Decimal("14"), discount_rate=Decimal("10"),
        )
        session.flush()
        line = session.scalar(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
        ))
        assert line.unit_price == Decimal("10.00")
        assert invoice.total == Decimal("20.52")
        issued = issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        assert issued.status == "issued"
        with pytest.raises(WorkflowError, match="Only draft"):
            issue_invoice(
                session, principal=principal, business_id=business_id,
                invoice_id=invoice.id,
            )


def test_stock_movements_prevent_negative_inventory(workspace):
    engine, business_id, principal = workspace
    with Session(engine) as session:
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Beans", unit_price=Decimal("30"), is_stock_tracked=True,
        )
        record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=product.id, movement_type="opening",
            quantity_delta=Decimal("3.000"),
        )
        with pytest.raises(WorkflowError, match="negative"):
            record_stock_movement(
                session, principal=principal, business_id=business_id,
                product_id=product.id, movement_type="sale",
                quantity_delta=Decimal("-4.000"),
            )


def test_payment_allocation_is_transactional_and_idempotent(workspace):
    engine, business_id, principal = workspace
    with Session(engine) as session:
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-002", currency_code="EGP",
            lines=[{"description": "Consulting", "quantity": "1", "unit_price": "100"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        payment = record_payment(
            session, principal=principal, business_id=business_id,
            amount=Decimal("40"), currency_code="EGP", idempotency_key="pay-1",
            allocations=[(invoice.id, Decimal("40"))],
        )
        replay = record_payment(
            session, principal=principal, business_id=business_id,
            amount=Decimal("40"), currency_code="EGP", idempotency_key="pay-1",
            allocations=[(invoice.id, Decimal("40"))],
        )
        session.commit()
        assert replay.id == payment.id
        assert len(session.scalars(select(Payment)).all()) == 1
        assert len(session.scalars(select(PaymentAllocation)).all()) == 1


def test_issuing_invoice_deducts_stock_through_auditable_movement(workspace):
    engine, business_id, principal = workspace
    with Session(engine) as session:
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Rice", unit_price=Decimal("20.00"), is_stock_tracked=True,
        )
        record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=product.id, movement_type="opening",
            quantity_delta=Decimal("5.000"), reason="Opening count",
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-STOCK-001", currency_code="EGP",
            lines=[{"product_id": str(product.id), "quantity": "2"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id,
        )
        session.commit()
        balance = session.scalar(select(__import__("sqlalchemy").func.sum(
            StockMovement.quantity_delta
        )).where(StockMovement.business_id == business_id,
                 StockMovement.product_id == product.id))
        sale = session.scalar(select(StockMovement).where(
            StockMovement.reference_type == "invoice",
            StockMovement.reference_id == invoice.id,
            StockMovement.movement_type == "sale",
        ))
        assert Decimal(str(balance)) == Decimal("3.000")
        assert sale is not None
        assert sale.quantity_delta == Decimal("-2.000")


def test_invoice_issue_rejects_insufficient_stock(workspace):
    engine, business_id, principal = workspace
    with Session(engine) as session:
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Milk", unit_price=Decimal("15.00"), is_stock_tracked=True,
        )
        record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=product.id, movement_type="opening",
            quantity_delta=Decimal("1.000"),
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number="INV-STOCK-002", currency_code="EGP",
            lines=[{"product_id": str(product.id), "quantity": "2"}],
        )
        with pytest.raises(WorkflowError, match="Insufficient stock"):
            issue_invoice(
                session, principal=principal, business_id=business_id,
                invoice_id=invoice.id,
            )
        session.rollback()
        assert session.get(Invoice, invoice.id).status == "draft"
