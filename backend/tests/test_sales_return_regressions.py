from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import approve_sales_return
from app.models import (
    Base, Business, BusinessMembership, InvoiceLine, MembershipRole,
    SalesReturn, SalesReturnLine, StockMovement,
)
from app.security import AuthenticatedPrincipal
from app.services import create_invoice, create_product, issue_invoice, void_invoice


@pytest.fixture()
def return_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Returns Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id, user_subject="return-user",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        yield engine, business.id, AuthenticatedPrincipal(subject="return-user")
    engine.dispose()


def _issued_invoice(session, business_id, principal, quantity=Decimal("5")):
    product = create_product(
        session, principal=principal, business_id=business_id,
        name="Returnable item", unit_price=Decimal("10.00"),
        is_stock_tracked=True,
    )
    from app.services import record_stock_movement
    record_stock_movement(
        session, principal=principal, business_id=business_id,
        product_id=product.id, movement_type="opening",
        quantity_delta=Decimal("20.000"),
    )
    invoice = create_invoice(
        session, principal=principal, business_id=business_id,
        invoice_number=f"INV-RET-{uuid4().hex[:8]}", currency_code="EGP",
        lines=[{"product_id": str(product.id), "quantity": str(quantity)}],
    )
    issue_invoice(
        session, principal=principal, business_id=business_id,
        invoice_id=invoice.id,
    )
    session.flush()
    line = session.scalars(select(InvoiceLine).where(
        InvoiceLine.invoice_id == invoice.id,
        InvoiceLine.business_id == business_id,
    )).one()
    return invoice, line


def _draft_return(session, business_id, invoice_id, invoice_line_id, quantity):
    ret = SalesReturn(
        business_id=business_id, invoice_id=invoice_id,
        status="draft", total=Decimal(str(quantity)) * Decimal("10.00"),
    )
    session.add(ret)
    session.flush()
    session.add(SalesReturnLine(
        business_id=business_id, sales_return_id=ret.id,
        invoice_line_id=invoice_line_id, quantity=Decimal(str(quantity)),
        amount=Decimal(str(quantity)) * Decimal("10.00"),
    ))
    session.flush()
    return ret


def test_approval_rejects_return_when_source_invoice_was_voided(return_workspace):
    engine, business_id, principal = return_workspace
    with Session(engine) as session:
        invoice, line = _issued_invoice(session, business_id, principal)
        ret = _draft_return(session, business_id, invoice.id, line.id, "1")
        void_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=invoice.id, reason="void before return approval",
        )
        session.commit()

        with pytest.raises(HTTPException) as error:
            approve_sales_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert "issued invoice" in str(error.value.detail).lower()
        assert session.get(SalesReturn, ret.id).status == "draft"


def test_approval_revalidates_total_across_previously_approved_returns(return_workspace):
    engine, business_id, principal = return_workspace
    with Session(engine) as session:
        invoice, line = _issued_invoice(session, business_id, principal)
        first = _draft_return(session, business_id, invoice.id, line.id, "3")
        second = _draft_return(session, business_id, invoice.id, line.id, "3")
        session.commit()

        approve_sales_return(
            business_id=business_id, return_id=first.id,
            session=session, principal=principal,
        )
        with pytest.raises(HTTPException) as error:
            approve_sales_return(
                business_id=business_id, return_id=second.id,
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert "exceeds the invoiced quantity" in str(error.value.detail).lower()
        assert session.get(SalesReturn, second.id).status == "draft"
        return_movements = session.scalars(select(StockMovement).where(
            StockMovement.business_id == business_id,
            StockMovement.reference_type == "sales_return",
        )).all()
        assert sum((m.quantity_delta for m in return_movements), Decimal("0")) == Decimal("3.000")
