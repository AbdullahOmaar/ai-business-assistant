"""3A-435 / T38 (Linear 3A-247): invoice duplication («إعادة الطلب»).

The sales cycle was verified to exist (invoices, returns, credit notes,
approvals) except for re-ordering: no duplicate path existed anywhere.
These tests pin the new POST .../invoices/{id}/duplicate endpoint.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.security import AuthenticatedPrincipal


def _client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("t38-owner")
    client = TestClient(app, raise_server_exceptions=False)
    return client, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def _business(client, name):
    created = client.post(
        "/api/v1/businesses", json={"name": name, "currency_code": "EGP"}
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _invoice(client, base, number, *, discount_rate=0, tax_rate=0):
    customer = client.post(f"{base}/customers", json={"name": "T38 Customer"})
    assert customer.status_code == 201, customer.text
    created = client.post(
        f"{base}/invoices",
        json={
            "invoice_number": number,
            "currency_code": "EGP",
            "customer_id": customer.json()["id"],
            "lines": [
                {
                    "description": "Widget",
                    "quantity": "2",
                    "unit_price": "100.00",
                }
            ],
            "discount_rate": discount_rate,
            "tax_rate": tax_rate,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def test_duplicate_issued_invoice_creates_matching_draft():
    client, prev_factory, prev_resolver = _client()
    try:
        business_id = _business(client, "T38 Workspace")
        base = f"/api/v1/businesses/{business_id}"
        source = _invoice(client, base, "INV-100", discount_rate=10, tax_rate=14)
        issued = client.post(
            f"{base}/invoices/{source['id']}/issue", json={}
        )
        assert issued.status_code in (200, 201), issued.text

        duplicated = client.post(f"{base}/invoices/{source['id']}/duplicate")
        assert duplicated.status_code == 201, duplicated.text
        copy = duplicated.json()
        assert copy["id"] != source["id"]
        assert copy["status"] == "draft"
        assert copy["invoice_number"] == "INV-100-COPY"
        assert copy["currency_code"] == source["currency_code"]
        assert copy["total"] == source["total"]
        assert copy["subtotal"] == source["subtotal"]

        again = client.post(f"{base}/invoices/{source['id']}/duplicate")
        assert again.status_code == 201, again.text
        assert again.json()["invoice_number"] == "INV-100-COPY-2"
    finally:
        _restore(prev_factory, prev_resolver)


def test_duplicate_void_invoice_is_allowed_and_tenant_scoped():
    client, prev_factory, prev_resolver = _client()
    try:
        business_id = _business(client, "T38 Second")
        base = f"/api/v1/businesses/{business_id}"
        source = _invoice(client, base, "INV-200")
        voided = client.post(
            f"{base}/invoices/{source['id']}/void", json={}
        )
        assert voided.status_code in (200, 201), voided.text

        duplicated = client.post(f"{base}/invoices/{source['id']}/duplicate")
        assert duplicated.status_code == 201, duplicated.text
        assert duplicated.json()["status"] == "draft"

        # A business the caller is not a member of: 403.
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
            "t38-outsider"
        )
        outsider = client.post(f"{base}/invoices/{source['id']}/duplicate")
        assert outsider.status_code == 403, outsider.text

        # Unauthenticated: 401.
        app.state.principal_resolver = lambda request: None
        anonymous = client.post(f"{base}/invoices/{source['id']}/duplicate")
        assert anonymous.status_code == 401, anonymous.text
    finally:
        _restore(prev_factory, prev_resolver)
