"""Stage-1 credit-note issuance regressions: immutable, owner-only, no AR/cash side effects."""
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import issue_credit_note_for_return, list_credit_notes, list_sales_returns
from app.models import (
    AuditEvent,
    Base,
    Business,
    BusinessMembership,
    CreditNote,
    Customer,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Payment,
    PaymentAllocation,
    SalesReturn,
    SalesReturnLine,
)
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def credit_note_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Credit Note Test Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add_all([
            BusinessMembership(
                business_id=business.id,
                user_subject="credit-owner",
                role=MembershipRole.OWNER,
            ),
            BusinessMembership(
                business_id=business.id,
                user_subject="credit-staff",
                role=MembershipRole.STAFF,
            ),
        ])
        session.commit()
        yield engine, business.id
    engine.dispose()


def _approved_return(session, business_id, *, status="approved", tax_total="0.00"):
    customer = Customer(business_id=business_id, name=f"Customer {uuid4().hex[:8]}")
    session.add(customer)
    session.flush()
    invoice_total = Decimal("10.00") + Decimal(tax_total)
    invoice = Invoice(
        business_id=business_id,
        customer_id=customer.id,
        invoice_number=f"INV-{uuid4().hex[:10]}",
        status="issued",
        currency_code="EGP",
        subtotal=Decimal("10.00"),
        tax_total=Decimal(tax_total),
        discount_total=Decimal("0.00"),
        total=invoice_total,
    )
    session.add(invoice)
    session.flush()
    invoice_line = InvoiceLine(
        business_id=business_id,
        invoice_id=invoice.id,
        product_id=None,
        description="Returned item",
        quantity=Decimal("1.000"),
        unit_price=Decimal("10.00"),
        line_total=Decimal("10.00"),
    )
    session.add(invoice_line)
    session.flush()
    sales_return = SalesReturn(
        business_id=business_id,
        invoice_id=invoice.id,
        status=status,
        reason="Customer return",
        total=Decimal("10.00"),
    )
    session.add(sales_return)
    session.flush()
    session.add(SalesReturnLine(
        business_id=business_id,
        sales_return_id=sales_return.id,
        invoice_line_id=invoice_line.id,
        quantity=Decimal("1.000"),
        amount=Decimal("10.00"),
    ))
    session.flush()
    return invoice, sales_return


def test_owner_issues_one_immutable_credit_note_without_ar_or_cash_side_effects(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, sales_return = _approved_return(session, business_id)
        session.commit()
        original_total = Decimal(str(invoice.total))

        issued = issue_credit_note_for_return(
            business_id=business_id,
            return_id=sales_return.id,
            session=session,
            principal=principal,
        )
        replay = issue_credit_note_for_return(
            business_id=business_id,
            return_id=sales_return.id,
            session=session,
            principal=principal,
        )

        assert issued["id"] == replay["id"]
        assert issued["sales_return_id"] == str(sales_return.id)
        assert issued["invoice_id"] == str(invoice.id)
        assert issued["customer_id"] == str(invoice.customer_id)
        assert issued["currency_code"] == "EGP"
        assert Decimal(issued["total"]) == Decimal("10.00")
        assert Decimal(str(session.get(Invoice, invoice.id).total)) == original_total
        assert session.scalar(select(func.count()).select_from(CreditNote)) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == 1
        assert session.scalar(select(func.count()).select_from(Payment)) == 0
        assert session.scalar(select(func.count()).select_from(PaymentAllocation)) == 0


def test_credit_note_requires_approved_return_and_creates_no_audit_on_rejection(credit_note_workspace):
    engine, business_id = credit_note_workspace
    with Session(engine) as session:
        _, sales_return = _approved_return(session, business_id, status="draft")
        session.commit()
        with pytest.raises(HTTPException):
            issue_credit_note_for_return(
                business_id=business_id,
                return_id=sales_return.id,
                session=session,
                principal=AuthenticatedPrincipal(subject="credit-owner"),
            )
        assert session.scalar(select(func.count()).select_from(CreditNote)) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.action == "credit_note.issued",
        )) == 0


def test_credit_note_is_owner_only_and_staff_denial_has_no_side_effect(credit_note_workspace):
    engine, business_id = credit_note_workspace
    with Session(engine) as session:
        _, sales_return = _approved_return(session, business_id)
        session.commit()
        with pytest.raises(HTTPException) as error:
            issue_credit_note_for_return(
                business_id=business_id,
                return_id=sales_return.id,
                session=session,
                principal=AuthenticatedPrincipal(subject="credit-staff"),
            )
        assert error.value.status_code == 403
        assert session.scalar(select(func.count()).select_from(CreditNote)) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.action == "credit_note.issued",
        )) == 0


def test_tax_bearing_invoice_is_blocked_until_tax_phase_is_approved(credit_note_workspace):
    engine, business_id = credit_note_workspace
    with Session(engine) as session:
        invoice, sales_return = _approved_return(
            session, business_id, tax_total="1.00",
        )
        session.commit()
        with pytest.raises(HTTPException) as error:
            issue_credit_note_for_return(
                business_id=business_id,
                return_id=sales_return.id,
                session=session,
                principal=AuthenticatedPrincipal(subject="credit-owner"),
            )
        assert "tax-bearing" in str(error.value.detail).lower()
        assert session.scalar(select(func.count()).select_from(CreditNote)) == 0
        assert Decimal(str(session.get(Invoice, invoice.id).total)) == Decimal("11.00")
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.action == "credit_note.issued",
        )) == 0


def test_foreign_business_return_cannot_be_credited_in_another_business(credit_note_workspace):
    engine, business_a_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        business_b = Business(name="Foreign Shop", currency_code="USD")
        session.add(business_b)
        session.flush()
        session.add(BusinessMembership(
            business_id=business_b.id,
            user_subject="credit-owner",
            role=MembershipRole.OWNER,
        ))
        session.flush()
        _, foreign_return = _approved_return(session, business_b.id)
        session.commit()

        with pytest.raises(HTTPException):
            issue_credit_note_for_return(
                business_id=business_a_id,
                return_id=foreign_return.id,
                session=session,
                principal=principal,
            )
        assert session.scalar(select(func.count()).select_from(CreditNote)) == 0


def test_credit_note_listing_is_business_scoped_and_does_not_claim_application_or_refund(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, sales_return = _approved_return(session, business_id)
        session.commit()
        issue_credit_note_for_return(
            business_id=business_id,
            return_id=sales_return.id,
            session=session,
            principal=principal,
        )
        page = list_credit_notes(
            business_id=business_id,
            limit=20,
            offset=0,
            customer_id=invoice.customer_id,
            session=session,
            principal=principal,
        )
        assert len(page["items"]) == 1
        item = page["items"][0]
        assert item["business_id"] == str(business_id)
        assert item["customer_id"] == str(invoice.customer_id)
        assert "applied_total" not in item
        assert "refunded_total" not in item
        assert "remaining_credit" not in item



@pytest.mark.parametrize("reader", [list_sales_returns, list_credit_notes])
def test_credit_note_history_reads_translate_missing_membership_to_forbidden(credit_note_workspace, reader):
    engine, business_id = credit_note_workspace
    with Session(engine) as session:
        with pytest.raises(HTTPException) as error:
            reader(
                business_id=business_id,
                session=session,
                principal=AuthenticatedPrincipal(subject="not-a-member"),
            )
        assert error.value.status_code == 403
