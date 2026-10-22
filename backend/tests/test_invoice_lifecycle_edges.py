"""Edge-case regression tests for invoice state transitions."""

from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Business, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal
from app.services import WorkflowError, create_invoice, issue_invoice, replace_draft_invoice


def test_issued_invoice_cannot_be_edited_as_a_draft():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            business = Business(name="Lifecycle Shop", currency_code="EGP")
            session.add(business)
            session.flush()
            session.add(BusinessMembership(
                business_id=business.id,
                user_subject="lifecycle-owner",
                role=MembershipRole.OWNER,
            ))
            session.commit()
            principal = AuthenticatedPrincipal(subject="lifecycle-owner")

            invoice = create_invoice(
                session,
                principal=principal,
                business_id=business.id,
                invoice_number="INV-LOCKED-1",
                currency_code="EGP",
                lines=[{
                    "description": "Service",
                    "quantity": "1",
                    "unit_price": "125.00",
                }],
            )
            issue_invoice(
                session,
                principal=principal,
                business_id=business.id,
                invoice_id=invoice.id,
            )
            session.commit()

            with pytest.raises(WorkflowError, match="Only draft"):
                replace_draft_invoice(
                    session,
                    principal=principal,
                    business_id=business.id,
                    invoice_id=invoice.id,
                    invoice_number="INV-CHANGED",
                    currency_code="EGP",
                    lines=[{
                        "description": "Changed service",
                        "quantity": "1",
                        "unit_price": str(Decimal("1.00")),
                    }],
                )

            session.refresh(invoice)
            assert invoice.status == "issued"
            assert invoice.invoice_number == "INV-LOCKED-1"
    finally:
        engine.dispose()
