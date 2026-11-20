"""F-407-01: credit-note/return reason must be non-empty at approval and issuance."""
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import approve_sales_return, issue_credit_note_for_return
from app.models import (
    Base,
    Business,
    BusinessMembership,
    CreditNote,
    Customer,
    Invoice,
    InvoiceLine,
    MembershipRole,
    SalesReturn,
    SalesReturnLine,
)
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Reason Guard Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id, user_subject="reason-owner", role=MembershipRole.OWNER,
        ))
        session.commit()
        yield engine, business.id
    engine.dispose()


def _return_with_reason(session, business_id, *, status, reason):
    customer = Customer(business_id=business_id, name=f"Customer {uuid4().hex[:8]}")
    session.add(customer)
    session.flush()
    invoice = Invoice(
        business_id=business_id,
        customer_id=customer.id,
        invoice_number=f"INV-{uuid4().hex[:10]}",
        status="issued",
        currency_code="EGP",
        subtotal=Decimal("10.00"),
        tax_total=Decimal("0.00"),
        discount_total=Decimal("0.00"),
        total=Decimal("10.00"),
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
        reason=reason,
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
    return sales_return


@pytest.mark.parametrize("bad_reason", [None, "", "   "])
def test_approval_rejects_missing_or_blank_reason(workspace, bad_reason):
    engine, business_id = workspace
    principal = AuthenticatedPrincipal(subject="reason-owner")
    with Session(engine) as session:
        sales_return = _return_with_reason(session, business_id, status="draft", reason=bad_reason)
        session.commit()
        with pytest.raises(HTTPException):
            approve_sales_return(
                business_id=business_id, return_id=sales_return.id,
                session=session, principal=principal,
            )
        assert session.get(SalesReturn, sales_return.id).status == "draft"


@pytest.mark.parametrize("bad_reason", [None, "", "   "])
def test_issuance_rejects_legacy_empty_reason(workspace, bad_reason):
    engine, business_id = workspace
    principal = AuthenticatedPrincipal(subject="reason-owner")
    with Session(engine) as session:
        sales_return = _return_with_reason(session, business_id, status="approved", reason=bad_reason)
        session.commit()
        with pytest.raises(HTTPException):
            issue_credit_note_for_return(
                business_id=business_id, return_id=sales_return.id,
                session=session, principal=principal,
            )
        assert session.scalar(select(func.count()).select_from(CreditNote)) == 0
