from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    Base, Business, BusinessMembership, Customer, Invoice, InvoiceLine,
    MembershipRole, SalesReturn, SalesReturnLine,
)
from app.security import AuthenticatedPrincipal


def test_health_endpoint_reports_process_liveness():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_business_endpoints_fail_closed_without_database_or_identity():
    response = TestClient(app).post(
        "/api/v1/businesses/00000000-0000-0000-0000-000000000001/customers",
        json={"name": "Not persisted"},
    )
    assert response.status_code == 503
    assert "Database is not configured" in response.json()["detail"]


def test_business_endpoints_fail_closed_without_trusted_identity():
    engine = create_engine("sqlite+pysqlite://")
    app.state.session_factory = sessionmaker(bind=engine)
    try:
        response = TestClient(app).post(
            "/api/v1/businesses/00000000-0000-0000-0000-000000000001/customers",
            json={"name": "Not persisted"},
        )
        assert response.status_code == 503
        assert "Authentication is not configured" in response.json()["detail"]
    finally:
        del app.state.session_factory
        engine.dispose()



def _partial_return_fixture():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Partial return test shop", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Partial return customer")
        session.add(customer)
        session.flush()
        invoice = Invoice(
            business_id=business.id,
            customer_id=customer.id,
            invoice_number="RET-HALF-CENT-1",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("0.02"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("0.02"),
        )
        session.add(invoice)
        session.flush()
        line = InvoiceLine(
            business_id=business.id,
            invoice_id=invoice.id,
            product_id=None,
            description="Half-cent test item",
            quantity=Decimal("1.500"),
            unit_price=Decimal("0.01"),
            line_total=Decimal("0.02"),
        )
        session.add(line)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="partial-return-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        return engine, business.id, invoice.id, line.id


def test_partial_returns_cannot_refund_more_than_rounded_invoice_line():
    engine, business_id, invoice_id, line_id = _partial_return_fixture()
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject="partial-return-subject"
    )
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [{"invoice_line_id": str(line_id), "quantity": "0.500"}],
    }
    try:
        created = [
            client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
            for _ in range(3)
        ]
        assert [response.status_code for response in created] == [201, 201, 201]

        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created[0].json()['id']}/approve"
        )
        approved_second = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created[1].json()['id']}/approve"
        )
        rejected_third = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created[2].json()['id']}/approve"
        )

        assert approved.status_code == 200
        assert approved_second.status_code == 200
        assert rejected_third.status_code == 422
        assert "return amount exceeds" in rejected_third.json()["detail"]

        with Session(engine) as session:
            total_approved = session.scalar(
                select(func.coalesce(func.sum(SalesReturnLine.amount), 0))
                .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
                .where(
                    SalesReturn.business_id == business_id,
                    SalesReturn.invoice_id == invoice_id,
                    SalesReturn.status == "approved",
                )
            )
        assert Decimal(str(total_approved or 0)) == Decimal("0.02")
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
