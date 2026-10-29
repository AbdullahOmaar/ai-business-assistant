from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import (
    CashRefundInput, CreditApplicationInput, apply_credit_note, approve_sales_return, create_cash_refund,
    customer_statement, issue_credit_note_for_return, list_credit_applications,
    list_cash_refunds, list_credit_notes, list_invoices, list_sales_returns, receivables_aging,
)
from app.models import (
    AuditEvent, Base, Business, BusinessMembership, CashRefund, CreditApplication, CreditNote, Invoice, Payment, PaymentAllocation,
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


def test_credit_note_tax_allocation_reconciles_and_preserves_original_invoice(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(
            session, business_id, principal, taxable=True,
        )
        original_invoice_total = Decimal(str(invoice.total))
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        assert Decimal(note["subtotal"]) == Decimal("10.00")
        assert Decimal(note["tax_total"]) == Decimal("1.00")
        assert Decimal(note["total"]) == Decimal("11.00")
        assert Decimal(str(ret.tax_total)) == Decimal("1.00")
        assert Decimal(str(ret.total)) == Decimal("11.00")
        assert Decimal(str(session.get(Invoice, invoice.id).total)) == original_invoice_total
        assert session.scalar(select(func.count()).select_from(CreditNote).where(
            CreditNote.business_id == business_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.issued",
        )) == 1


def test_legacy_tax_invoice_without_line_snapshots_remains_blocked(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(
            session, business_id, principal, taxable=True,
        )
        invoice.tax_rate = None
        for line in session.scalars(select(InvoiceLine).where(
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
        )).all():
            line.taxable_amount = None
            line.tax_amount = None
        ret.tax_total = None
        ret.total = Decimal("10.00")
        for line in session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.business_id == business_id,
            SalesReturnLine.sales_return_id == ret.id,
        )).all():
            line.tax_amount = None
        session.commit()
        with pytest.raises(HTTPException) as error:
            issue_credit_note_for_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=principal,
            )
        assert "tax snapshots" in str(error.value.detail).lower()
        assert session.scalar(select(func.count()).select_from(CreditNote).where(
            CreditNote.business_id == business_id,
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

def test_credit_note_list_is_business_scoped_and_supports_customer_filter(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        own_invoice, own_return = _issued_invoice_and_return(session, business_id, principal)
        own_note = issue_credit_note_for_return(
            business_id=business_id, return_id=own_return.id,
            session=session, principal=principal,
        )

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
        issue_credit_note_for_return(
            business_id=foreign_business.id, return_id=foreign_return.id,
            session=session, principal=principal,
        )

        page = list_credit_notes(
            business_id=business_id, session=session, principal=principal,
            limit=100, offset=0, customer_id=None,
        )
        assert len(page["items"]) == 1
        assert page["items"][0]["id"] == own_note["id"]
        assert page["items"][0]["business_id"] == str(business_id)

        filtered = list_credit_notes(
            business_id=business_id, session=session, principal=principal,
            limit=100, offset=0, customer_id=own_invoice.customer_id,
        )
        assert [item["id"] for item in filtered["items"]] == [own_note["id"]]



def test_sales_return_listing_is_business_scoped_and_paginated(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        _, own_return = _issued_invoice_and_return(session, business_id, principal)
        foreign_business = Business(name="Foreign Returns Shop", currency_code="USD")
        session.add(foreign_business)
        session.flush()
        session.add(BusinessMembership(
            business_id=foreign_business.id, user_subject="credit-owner",
            role=MembershipRole.OWNER,
        ))
        session.flush()
        _, foreign_return = _issued_invoice_and_return(session, foreign_business.id, principal)
        session.commit()

        first_page = list_sales_returns(
            business_id=business_id, limit=1, offset=0, status="approved",
            session=session, principal=principal,
        )
        second_page = list_sales_returns(
            business_id=business_id, limit=1, offset=1, status="approved",
            session=session, principal=principal,
        )
        assert first_page["limit"] == 1
        assert first_page["offset"] == 0
        assert len(first_page["items"]) == 1
        assert len(second_page["items"]) == 0
        assert first_page["items"][0]["id"] == str(own_return.id)
        assert first_page["items"][0]["status"] == "approved"
        assert first_page["items"][0]["business_id"] == str(business_id)
        assert all(item["id"] != str(foreign_return.id) for item in first_page["items"])


def test_staff_can_read_scoped_returns_and_status_filter_is_applied(credit_note_workspace):
    engine, business_id = credit_note_workspace
    owner = AuthenticatedPrincipal(subject="credit-owner")
    staff = AuthenticatedPrincipal(subject="credit-staff")
    with Session(engine) as session:
        _, ret = _issued_invoice_and_return(session, business_id, owner)
        approved = list_sales_returns(
            business_id=business_id, limit=50, offset=0, status="approved",
            session=session, principal=staff,
        )
        drafts = list_sales_returns(
            business_id=business_id, limit=50, offset=0, status="draft",
            session=session, principal=staff,
        )
        assert [item["id"] for item in approved["items"]] == [str(ret.id)]
        assert drafts["items"] == []
        assert approved["limit"] == 50
        assert approved["offset"] == 0


def test_credit_application_is_idempotent_audited_and_preserves_invoice_total(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        original_total = session.get(Invoice, invoice.id).total
        body = CreditApplicationInput(
            credit_note_id=note["id"], invoice_id=str(invoice.id),
            amount=Decimal("10.00"), idempotency_key="apply-credit-001",
        )
        first = apply_credit_note(
            business_id=business_id, body=body, session=session, principal=principal,
        )
        replay = apply_credit_note(
            business_id=business_id, body=body, session=session, principal=principal,
        )
        assert first["id"] == replay["id"]
        assert Decimal(first["amount"]) == Decimal("10.00")
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.applied",
        )) == 1
        assert session.get(Invoice, invoice.id).total == original_total


def test_credit_application_rejects_exceeding_remaining_credit_without_side_effects(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        apply_credit_note(
            business_id=business_id,
            body=CreditApplicationInput(
                credit_note_id=note["id"], invoice_id=str(invoice.id),
                amount=Decimal("10.00"), idempotency_key="apply-credit-002",
            ),
            session=session, principal=principal,
        )
        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=note["id"], invoice_id=str(invoice.id),
                    amount=Decimal("0.01"), idempotency_key="apply-credit-003",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.applied",
        )) == 1


def test_credit_application_rejects_different_customer_invoice(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        _, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        other_customer = create_customer(
            session, principal=principal, business_id=business_id, name="Other receivable customer",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Other invoice item", unit_price=Decimal("10.00"), is_stock_tracked=False,
        )
        other_invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            customer_id=other_customer.id, invoice_number=f"INV-OTHER-{uuid4().hex[:8]}",
            currency_code="EGP",
            lines=[{"product_id": str(product.id), "quantity": "1"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id, invoice_id=other_invoice.id,
        )
        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=note["id"], invoice_id=str(other_invoice.id),
                    amount=Decimal("1.00"), idempotency_key="apply-credit-004",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 0


def test_staff_cannot_apply_credit_note(credit_note_workspace):
    engine, business_id = credit_note_workspace
    owner = AuthenticatedPrincipal(subject="credit-owner")
    staff = AuthenticatedPrincipal(subject="credit-staff")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, owner)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=owner,
        )
        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=note["id"], invoice_id=str(invoice.id),
                    amount=Decimal("1.00"), idempotency_key="apply-credit-005",
                ),
                session=session, principal=staff,
            )
        assert error.value.status_code == 403
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 0


def test_credit_application_list_is_business_scoped(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        apply_credit_note(
            business_id=business_id,
            body=CreditApplicationInput(
                credit_note_id=note["id"], invoice_id=str(invoice.id),
                amount=Decimal("5.00"), idempotency_key="apply-credit-006",
            ),
            session=session, principal=principal,
        )
        page = list_credit_applications(
            business_id=business_id, credit_note_id=UUID(note["id"]),
            invoice_id=invoice.id, limit=50, offset=0,
            session=session, principal=principal,
        )
        assert len(page["items"]) == 1
        assert page["items"][0]["credit_note_id"] == note["id"]
        assert page["items"][0]["invoice_id"] == str(invoice.id)


def test_credit_application_idempotency_key_cannot_be_reused_for_different_amount(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        first = CreditApplicationInput(
            credit_note_id=UUID(note["id"]), invoice_id=invoice.id,
            amount=Decimal("5.00"), idempotency_key="apply-credit-reused-key",
        )
        apply_credit_note(
            business_id=business_id, body=first, session=session, principal=principal,
        )
        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=UUID(note["id"]), invoice_id=invoice.id,
                    amount=Decimal("4.00"), idempotency_key="apply-credit-reused-key",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 409
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.applied",
        )) == 1


def test_credit_application_rejects_currency_mismatch_without_side_effects(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        foreign_currency_invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            customer_id=invoice.customer_id, invoice_number=f"INV-USD-{uuid4().hex[:8]}",
            currency_code="USD",
            lines=[{"product_id": str(session.scalars(select(InvoiceLine).where(
                InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.business_id == business_id,
            )).one().product_id), "quantity": "1"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=foreign_currency_invoice.id,
        )
        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=UUID(note["id"]), invoice_id=foreign_currency_invoice.id,
                    amount=Decimal("1.00"), idempotency_key="apply-credit-currency-mismatch",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 0


def test_credit_application_cannot_exceed_invoice_outstanding_after_payments(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        source_invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        source_line = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == source_invoice.id,
            InvoiceLine.business_id == business_id,
        )).one()
        target_invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            customer_id=source_invoice.customer_id, invoice_number=f"INV-OPEN-{uuid4().hex[:8]}",
            currency_code="EGP",
            lines=[{"product_id": str(source_line.product_id), "quantity": "1"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=target_invoice.id,
        )
        payment = Payment(
            business_id=business_id, customer_id=source_invoice.customer_id,
            amount=Decimal("8.00"), currency_code="EGP",
            idempotency_key=f"PAY-CREDIT-{uuid4().hex[:12]}",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=payment.id,
            invoice_id=target_invoice.id, amount=Decimal("8.00"),
        ))
        session.flush()

        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=UUID(note["id"]), invoice_id=target_invoice.id,
                    amount=Decimal("3.00"), idempotency_key="apply-credit-over-receivable",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert "outstanding receivable" in str(error.value.detail).lower()
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "credit_note.applied",
        )) == 0


def test_applied_credit_reduces_invoice_and_aging_balances_and_appears_on_statement(credit_note_workspace):
    from datetime import date

    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        apply_credit_note(
            business_id=business_id,
            body=CreditApplicationInput(
                credit_note_id=note["id"], invoice_id=str(invoice.id),
                amount=Decimal("10.00"), idempotency_key="apply-credit-report-001",
            ),
            session=session, principal=principal,
        )

        invoice_rows = list_invoices(
            business_id=business_id, limit=50, offset=0,
            session=session, principal=principal,
        )
        invoice_row = next(row for row in invoice_rows if row["id"] == str(invoice.id))
        assert Decimal(invoice_row["applied_credits"]) == Decimal("10.00")
        assert Decimal(invoice_row["outstanding_amount"]) == Decimal("10.00")

        aging = receivables_aging(
            business_id=business_id, as_of=date.today(),
            session=session, principal=principal,
        )
        aging_row = next(row for row in aging["invoices"] if row["invoice_id"] == str(invoice.id))
        assert Decimal(aging_row["applied_credits"]) == Decimal("10.00")
        assert Decimal(aging_row["outstanding_amount"]) == Decimal("10.00")

        statement = customer_statement(
            business_id=business_id, customer_id=invoice.customer_id,
            session=session, principal=principal,
        )
        credit_events = [event for event in statement["items"] if event["event_type"] == "credit_application"]
        assert len(credit_events) == 1
        assert Decimal(credit_events[0]["credit"]) == Decimal("10.00")
        assert Decimal(statement["balances_by_currency"]["EGP"]) == Decimal("10.00")


def test_idempotency_key_cannot_be_reused_for_different_credit_application(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        first = CreditApplicationInput(
            credit_note_id=note["id"], invoice_id=str(invoice.id),
            amount=Decimal("5.00"), idempotency_key="apply-credit-reuse-001",
        )
        apply_credit_note(
            business_id=business_id, body=first, session=session, principal=principal,
        )
        with pytest.raises(HTTPException) as error:
            apply_credit_note(
                business_id=business_id,
                body=CreditApplicationInput(
                    credit_note_id=note["id"], invoice_id=str(invoice.id),
                    amount=Decimal("6.00"), idempotency_key="apply-credit-reuse-001",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 409
        assert session.scalar(select(func.count()).select_from(CreditApplication).where(
            CreditApplication.business_id == business_id,
        )) == 1


def test_cash_refund_is_idempotent_audited_and_reduces_remaining_credit(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        payment = Payment(
            business_id=business_id, customer_id=invoice.customer_id,
            amount=Decimal(str(invoice.total)), currency_code=invoice.currency_code,
            idempotency_key="payment-settle-before-refund-001",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=payment.id,
            invoice_id=invoice.id, amount=Decimal(str(invoice.total)),
        ))
        session.flush()
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        body = CashRefundInput(
            amount=Decimal("4.00"), method="cash",
            reference="REFUND-100", idempotency_key="cash-refund-idempotent-001",
        )
        first = create_cash_refund(
            business_id=business_id, credit_note_id=UUID(note["id"]),
            body=body, session=session, principal=principal,
        )
        replay = create_cash_refund(
            business_id=business_id, credit_note_id=UUID(note["id"]),
            body=body, session=session, principal=principal,
        )
        assert first["id"] == replay["id"]
        assert Decimal(first["amount"]) == Decimal("4.00")
        assert session.scalar(select(func.count()).select_from(CashRefund).where(
            CashRefund.business_id == business_id,
        )) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "cash_refund.created",
        )) == 1
        notes_page = list_credit_notes(
            business_id=business_id, limit=50, offset=0,
            session=session, principal=principal,
        )
        listed = next(item for item in notes_page["items"] if item["id"] == note["id"])
        assert Decimal(listed["refunded_total"]) == Decimal("4.00")
        assert Decimal(listed["remaining_credit"]) == Decimal("6.00")
        statement = customer_statement(
            business_id=business_id, customer_id=invoice.customer_id,
            session=session, principal=principal,
        )
        refund_events = [event for event in statement["items"] if event["event_type"] == "cash_refund"]
        assert len(refund_events) == 1
        assert Decimal(refund_events[0]["refund_amount"]) == Decimal("4.00")
        assert refund_events[0]["affects_balance"] is False


def test_cash_refund_cannot_exceed_credit_remaining_after_applications(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        payment = Payment(
            business_id=business_id, customer_id=invoice.customer_id,
            amount=Decimal("13.00"), currency_code=invoice.currency_code,
            idempotency_key="payment-settle-before-credit-refund-001",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=payment.id,
            invoice_id=invoice.id, amount=Decimal("13.00"),
        ))
        session.flush()
        apply_credit_note(
            business_id=business_id,
            body=CreditApplicationInput(
                credit_note_id=UUID(note["id"]), invoice_id=invoice.id,
                amount=Decimal("7.00"), idempotency_key="apply-before-refund-001",
            ),
            session=session, principal=principal,
        )
        with pytest.raises(HTTPException) as error:
            create_cash_refund(
                business_id=business_id, credit_note_id=UUID(note["id"]),
                body=CashRefundInput(
                    amount=Decimal("4.00"), method="bank",
                    idempotency_key="refund-over-credit-remaining",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert session.scalar(select(func.count()).select_from(CashRefund).where(
            CashRefund.business_id == business_id,
        )) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "cash_refund.created",
        )) == 0


def test_cash_refund_linked_to_payment_cannot_consume_allocated_cash(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        invoice, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        payment = Payment(
            business_id=business_id, customer_id=invoice.customer_id,
            amount=Decimal("8.00"), currency_code="EGP",
            idempotency_key="payment-for-cash-refund-001",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=payment.id,
            invoice_id=invoice.id, amount=Decimal("7.00"),
        ))
        other_payment = Payment(
            business_id=business_id, customer_id=invoice.customer_id,
            amount=Decimal("13.00"), currency_code="EGP",
            idempotency_key="payment-complete-invoice-before-refund-001",
        )
        session.add(other_payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=other_payment.id,
            invoice_id=invoice.id, amount=Decimal("13.00"),
        ))
        session.flush()
        with pytest.raises(HTTPException) as error:
            create_cash_refund(
                business_id=business_id, credit_note_id=UUID(note["id"]),
                body=CashRefundInput(
                    amount=Decimal("2.00"), method="bank", payment_id=payment.id,
                    idempotency_key="refund-allocated-payment-001",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert "unallocated balance" in str(error.value.detail).lower()
        assert session.scalar(select(func.count()).select_from(CashRefund).where(
            CashRefund.business_id == business_id,
        )) == 0


def test_staff_cannot_create_cash_refund(credit_note_workspace):
    engine, business_id = credit_note_workspace
    owner = AuthenticatedPrincipal(subject="credit-owner")
    staff = AuthenticatedPrincipal(subject="credit-staff")
    with Session(engine) as session:
        _, ret = _issued_invoice_and_return(session, business_id, owner)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=owner,
        )
        with pytest.raises(HTTPException) as error:
            create_cash_refund(
                business_id=business_id, credit_note_id=UUID(note["id"]),
                body=CashRefundInput(
                    amount=Decimal("1.00"), method="cash",
                    idempotency_key="staff-refund-denied-001",
                ),
                session=session, principal=staff,
            )
        assert error.value.status_code == 403
        assert session.scalar(select(func.count()).select_from(CashRefund).where(
            CashRefund.business_id == business_id,
        )) == 0


def test_cash_refund_is_rejected_while_original_invoice_has_open_receivable(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        _, ret = _issued_invoice_and_return(session, business_id, principal)
        note = issue_credit_note_for_return(
            business_id=business_id, return_id=ret.id,
            session=session, principal=principal,
        )
        with pytest.raises(HTTPException) as error:
            create_cash_refund(
                business_id=business_id, credit_note_id=UUID(note["id"]),
                body=CashRefundInput(
                    amount=Decimal("1.00"), method="cash",
                    idempotency_key="refund-open-receivable-denied",
                ),
                session=session, principal=principal,
            )
        assert error.value.status_code == 422
        assert "fully settled" in str(error.value.detail).lower()
        assert session.scalar(select(func.count()).select_from(CashRefund).where(
            CashRefund.business_id == business_id,
        )) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.action == "cash_refund.created",
        )) == 0


def test_partial_return_tax_rounding_never_exceeds_original_line_tax(credit_note_workspace):
    engine, business_id = credit_note_workspace
    principal = AuthenticatedPrincipal(subject="credit-owner")
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="Tax rounding customer",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Tax rounding item", unit_price=Decimal("0.10"), is_stock_tracked=False,
        )
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            customer_id=customer.id, invoice_number=f"INV-TAX-ROUND-{uuid4().hex[:8]}",
            currency_code="EGP", tax_rate=Decimal("17.00"),
            lines=[{"product_id": str(product.id), "quantity": "3"}],
        )
        issue_invoice(
            session, principal=principal, business_id=business_id, invoice_id=invoice.id,
        )
        invoice_line = session.scalars(select(InvoiceLine).where(
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
        )).one()
        assert Decimal(str(invoice.tax_total)) == Decimal("0.05")
        assert Decimal(str(invoice_line.tax_amount)) == Decimal("0.05")

        notes = []
        for index in range(3):
            ret = SalesReturn(
                business_id=business_id, invoice_id=invoice.id,
                status="draft", total=Decimal("0.10"),
            )
            session.add(ret)
            session.flush()
            session.add(SalesReturnLine(
                business_id=business_id, sales_return_id=ret.id,
                invoice_line_id=invoice_line.id, quantity=Decimal("1.000"),
                amount=Decimal("0.10"),
            ))
            session.flush()
            approve_sales_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=principal,
            )
            note = issue_credit_note_for_return(
                business_id=business_id, return_id=ret.id,
                session=session, principal=principal,
            )
            notes.append(note)

        assert [Decimal(note["tax_total"]) for note in notes] == [
            Decimal("0.02"), Decimal("0.01"), Decimal("0.02"),
        ]
        assert sum((Decimal(note["tax_total"]) for note in notes), Decimal("0.00")) == Decimal("0.05")
        assert sum((Decimal(note["total"]) for note in notes), Decimal("0.00")) == Decimal(str(invoice.total))
