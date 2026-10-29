from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import approve_sales_return, issue_credit_note_for_return
from app.models import (
    AuditEvent, Base, Business, BusinessMembership, CreditNote, Invoice,
    InvoiceLine, MembershipRole, SalesReturn, SalesReturnLine,
)
from app.security import AuthenticatedPrincipal
from app.services import create_customer, create_invoice, create_product, issue_invoice


@pytest.fixture()
def credit_note_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Credit Note Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add_all([
            BusinessMembership(
                business_id=business.id, user_subject="credit-owner",
                role=MembershipRole.OWNER,
            ),
            BusinessMembership(
                business_id=business.id, user_subject="credit-staff",
                role=MembershipRole.STAFF,
            ),
        ])
        session.commit()
        yield engine, business.id
    engine.dispose()


def _issued_invoice_and_return(session, business_id, principal, *, taxable=False):
    customer = create_customer(
        session, principal=principal, business_id=business_id,
        name=f"Credit customer {uuid4().hex[:8]}",
    )
    product = create_product(
        session, principal=principal, business_id=business_id,
        name="Returned item", unit_price=Decimal("10.00"),
        is_stock_tracked=False,
    )
    invoice = create_invoice(
        session, principal=principal, business_id=business_id,
        customer_id=customer.id, invoice_number=f"INV-CN-{uuid4().hex[:8]}",
        currency_code="EGP",
        lines=[{"product_id": str(product.id), "quantity": "2"}],
        tax_rate=Decimal("0.10") if taxable else Decimal("0.00"),
    )
    issue_invoice(session, principal=principal, business_id=business_id, invoice_id=invoice.id)
    line = session.scalars(select(InvoiceLine).where(
        InvoiceLine.invoice_id == invoice.id,
        InvoiceLine.business_id == business_id,
    )).one()
    ret = SalesReturn(
        business_id=business_id, invoice_id=invoice.id, status="draft",
        total=Decimal("10.00"),
    )
    session.add(ret)
    session.flush()
    session.add(SalesReturnLine(
        business_id=business_id, sales_return_id=ret.id,
        invoice_line_id=line.id, quantity=Decimal("1.000"),
        amount=Decimal("10.00"),
    ))
    session.flush()
    approve_sales_return(
        business_id=business_id, return_id=ret.id,
        session=session, principal=principal,
    )
    session.flush()
    return invoice, ret


def test_credit_note_issue_is_idempotent_and_audited_without_rewriting_invoice(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        original_total = session.get(Invoice, invoice.id).total
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        assert note["sales_return_id"] == str(ret.id)
        assert note["invoice_id"] == str(invoice.id)
        assert note["customer_id"] == str(invoice.customer_id)
        assert note["currency_code"] == "EGP"
        assert Decimal(note["total"]) == Decimal("10.00")

        audit_count_after_issue = session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        ))
        replay = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        assert replay["id"] == note["id"]
        assert session.scalar(select(func.count()).select_from(CreditNote).where(
            CreditNote.business_id == business_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == audit_count_after_issue == 1
        assert session.get(Invoice, invoice.id).total == original_total


def test_credit_note_requires_approved_return_and_leaves_no_note_on_rejection(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        ret.status = "draft"
        session.commit()
        with pytest.raises(HTTPException):
            issue_credit_note_for_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=principal,
            )
        assert session.scalar(select(func.count()).select_from(CreditNote).where(
            CreditNote.business_id == business_id,
        )) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == 0


def test_credit_note_tax_guard_rejects_without_note_or_audit(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(
            session, business_id, principal, taxable=True,
        )
        with pytest.raises(HTTPException) as error:
            issue_credit_note_for_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=principal,
            )
        assert "tax" in str(error.value.detail).lower()
        assert session.scalar(select(func.count()).select_from(CreditNote).where(
            CreditNote.business_id == business_id,
        )) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == 0


def test_staff_cannot_issue_credit_note_and_denial_has_no_side_effect(credit_note_workspace):
    engine, business_id = credit_note_workspace
    owner = AuthenticatedPrincipal(subject="credit-owner")
    staff = AuthenticatedPrincipal(subject="credit-staff")
    with Session(engine) as session:
        _, ret = _issued_invoice_and_return(session, business_id, owner)
        before_notes = session.scalar(select(func.count()).select_from(CreditNote))
        before_credit_audits = session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        ))
        with pytest.raises(HTTPException) as error:
            issue_credit_note_for_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=staff,
            )
        assert error.value.status_code == 403
        assert session.scalar(select(func.count()).select_from(CreditNote)) == before_notes == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == before_credit_audits == 0

def test_credit_note_cannot_reference_return_from_another_business(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        foreign_business = Business(name="Other Credit Shop", currency_code="USD")
        session.add(foreign_business)
        session.flush()
        session.add(BusinessMembership(
            business_id=foreign_business.id, user_subject="credit-owner",
            role=MembershipRole.OWNER,
        ))
        session.flush()
        _, foreign_return = _issued_invoice_and_return(
            session, foreign_business.id, principal,
        )
        session.commit()

        with pytest.raises(HTTPException):
            issue_credit_note_for_return(
                business_id=business_id, return_id=foreign_return.id,
                session=session, principal=principal,
            )
        assert session.scalar(select(func.count()).select_from(CreditNote).where(
            CreditNote.business_id == business_id,
        )) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == 0
