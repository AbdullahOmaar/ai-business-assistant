from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AuditEvent,
    Base,
    Business,
    BusinessMembership,
    Customer,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Product,
)
from app.security import AuthenticatedPrincipal


def test_foreign_business_invoice_references_fail_without_writes_or_audit_events():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Invoice tenant", currency_code="EGP")
        foreign_business = Business(name="Foreign invoice tenant", currency_code="USD")
        session.add_all([business, foreign_business])
        session.flush()
        foreign_customer = Customer(
            business_id=foreign_business.id, name="Foreign customer"
        )
        foreign_product = Product(
            business_id=foreign_business.id,
            name="Foreign product",
            unit_price=Decimal("12.00"),
        )
        session.add_all([foreign_customer, foreign_product])
        session.add(
            BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            )
        )
        session.commit()
        business_id = business.id
        foreign_customer_id = foreign_customer.id
        foreign_product_id = foreign_product.id

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject="test-subject"
    )
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}/invoices"

    def invoice_state():
        with Session(engine) as session:
            return (
                session.scalar(
                    select(func.count()).select_from(Invoice).where(
                        Invoice.business_id == business_id
                    )
                ),
                session.scalar(
                    select(func.count()).select_from(InvoiceLine).where(
                        InvoiceLine.business_id == business_id
                    )
                ),
                session.scalar(
                    select(func.count()).select_from(AuditEvent).where(
                        AuditEvent.business_id == business_id
                    )
                ),
            )

    try:
        baseline = invoice_state()
        foreign_customer_response = client.post(
            base,
            json={
                "invoice_number": "FOREIGN-CUSTOMER-1",
                "currency_code": "EGP",
                "customer_id": str(foreign_customer_id),
                "lines": [
                    {
                        "description": "Manual line",
                        "quantity": "1.000",
                        "unit_price": "10.00",
                    }
                ],
            },
        )
        assert foreign_customer_response.status_code == 422, foreign_customer_response.text
        assert foreign_customer_response.json()["detail"] == (
            "Active customer not found in this business"
        )
        assert invoice_state() == baseline

        foreign_product_response = client.post(
            base,
            json={
                "invoice_number": "FOREIGN-PRODUCT-1",
                "currency_code": "EGP",
                "lines": [
                    {
                        "product_id": str(foreign_product_id),
                        "quantity": "1.000",
                    }
                ],
            },
        )
        assert foreign_product_response.status_code == 422, foreign_product_response.text
        assert foreign_product_response.json()["detail"] == (
            "Invoice product not found in this business"
        )
        assert invoice_state() == baseline
    finally:
        if previous_factory is None:
            if hasattr(app.state, "session_factory"):
                del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            if hasattr(app.state, "principal_resolver"):
                del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
        engine.dispose()
