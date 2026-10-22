from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models import Base
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def configured_client():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("workspace-owner")
    try:
        yield TestClient(app)
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


def test_create_workspace_assigns_creator_as_owner(configured_client):
    response = configured_client.post("/api/v1/businesses", json={
        "name": "  Test Shop  ", "currency_code": "egp"
    })
    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Test Shop"
    assert payload["currency_code"] == "EGP"
    assert payload["id"]
    profile = configured_client.get(f"/api/v1/businesses/{payload['id']}")
    assert profile.status_code == 200
    assert profile.json()["name"] == "Test Shop"


def test_workspace_profile_can_be_updated_by_owner(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Old Name", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    updated = configured_client.patch(f"/api/v1/businesses/{business_id}", json={
        "name": "New Name", "phone": "+201000000000"
    })
    assert updated.status_code == 200
    assert updated.json()["name"] == "New Name"
    assert updated.json()["phone"] == "+201000000000"


def test_dashboard_empty_state_is_real_and_currency_safe(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Empty Shop", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    response = configured_client.get(
        f"/api/v1/businesses/{business_id}/dashboard",
        params={"start_date": "2026-10-01", "end_date": "2026-10-21"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["period"]["timezone"] == "UTC"
    assert payload["invoiced_sales"] == []
    assert payload["collected_payments"] == []
    assert payload["expenses"] == []
    assert payload["outstanding_balances"] == []


def test_dashboard_rejects_inverted_date_range(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Date Shop", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    response = configured_client.get(
        f"/api/v1/businesses/{business_id}/dashboard",
        params={"start_date": "2026-10-22", "end_date": "2026-10-01"},
    )
    assert response.status_code == 422


def test_customer_search_update_and_soft_deactivation(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Customer Shop", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    customer = configured_client.post(f"/api/v1/businesses/{business_id}/customers", json={
        "name": "Ali Hassan", "email": "ali@example.com"
    })
    assert customer.status_code == 201
    customer_id = customer.json()["id"]
    found = configured_client.get(
        f"/api/v1/businesses/{business_id}/customers", params={"q": "Ali"}
    )
    assert found.status_code == 200
    assert len(found.json()) == 1
    updated = configured_client.patch(
        f"/api/v1/businesses/{business_id}/customers/{customer_id}",
        json={"phone": "+201234567890"},
    )
    assert updated.status_code == 200
    assert updated.json()["phone"] == "+201234567890"
    removed = configured_client.delete(
        f"/api/v1/businesses/{business_id}/customers/{customer_id}"
    )
    assert removed.status_code == 204
    assert configured_client.get(
        f"/api/v1/businesses/{business_id}/customers"
    ).json() == []


def test_product_update_and_soft_deactivation(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Catalog Shop", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    product = configured_client.post(f"/api/v1/businesses/{business_id}/products", json={
        "name": "Tea", "unit_price": "25.00", "is_stock_tracked": False
    })
    assert product.status_code == 201
    product_id = product.json()["id"]
    updated = configured_client.patch(
        f"/api/v1/businesses/{business_id}/products/{product_id}",
        json={"unit_price": "27.50"},
    )
    assert updated.status_code == 200
    assert updated.json()["unit_price"] == "27.50"
    removed = configured_client.delete(
        f"/api/v1/businesses/{business_id}/products/{product_id}"
    )
    assert removed.status_code == 204
    assert configured_client.get(
        f"/api/v1/businesses/{business_id}/products"
    ).json() == []


def test_business_list_is_scoped_to_verified_membership(configured_client):
    from app import main as main_module

    created_owner = configured_client.post("/api/v1/businesses", json={
        "name": "Owner Workspace", "currency_code": "EGP"
    })
    assert created_owner.status_code == 201

    main_module.app.state.principal_resolver = lambda request: AuthenticatedPrincipal("different-user")
    created_other = configured_client.post("/api/v1/businesses", json={
        "name": "Other Workspace", "currency_code": "USD"
    })
    assert created_other.status_code == 201
    other_id = created_other.json()["id"]

    main_module.app.state.principal_resolver = lambda request: AuthenticatedPrincipal("workspace-owner")
    response = configured_client.get("/api/v1/businesses")
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()}
    assert created_owner.json()["id"] in ids
    assert other_id not in ids


def test_assistant_fails_closed_without_provider_key(configured_client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    created = configured_client.post("/api/v1/businesses", json={
        "name": "AI Test Workspace", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    response = configured_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": "Summarize my recent sales"},
    )
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_invoice_api_supports_draft_edit_issue_and_void(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Invoice Lifecycle", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    product = configured_client.post(f"/api/v1/businesses/{business_id}/products", json={
        "name": "Consulting", "unit_price": "100.00", "is_stock_tracked": False
    })
    assert product.status_code == 201
    product_id = product.json()["id"]

    draft = configured_client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": "INV-API-LIFE", "currency_code": "EGP",
        "lines": [{"product_id": product_id, "quantity": "1"}]
    })
    assert draft.status_code == 201
    invoice_id = draft.json()["id"]
    edited = configured_client.patch(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}",
        json={
            "invoice_number": "INV-API-LIFE-EDITED", "currency_code": "EGP",
            "lines": [{"product_id": product_id, "quantity": "2"}],
        },
    )
    assert edited.status_code == 200
    assert edited.json()["invoice_number"] == "INV-API-LIFE-EDITED"
    assert edited.json()["total"] == "200.00"

    issued = configured_client.post(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", json={}
    )
    assert issued.status_code == 200
    assert issued.json()["status"] == "issued"
    voided = configured_client.post(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/void",
        json={"reason": "API lifecycle test"},
    )
    assert voided.status_code == 200
    assert voided.json()["status"] == "void"

    immutable = configured_client.patch(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}",
        json={
            "invoice_number": "INV-TOO-LATE", "currency_code": "EGP",
            "lines": [{"product_id": product_id, "quantity": "1"}],
        },
    )
    assert immutable.status_code == 422


def test_payment_recording_is_idempotent_and_allocates_to_issued_invoice(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Payment Workflow", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    product = configured_client.post(f"/api/v1/businesses/{business_id}/products", json={
        "name": "Service", "unit_price": "100.00", "is_stock_tracked": False
    })
    assert product.status_code == 201
    draft = configured_client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": "INV-PAYMENT-1", "currency_code": "EGP",
        "lines": [{"product_id": product.json()["id"], "quantity": "1"}]
    })
    assert draft.status_code == 201
    invoice_id = draft.json()["id"]
    issued = configured_client.post(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", json={}
    )
    assert issued.status_code == 200

    payload = {
        "amount": "60.00",
        "currency_code": "EGP",
        "idempotency_key": "payment-test-once",
        "method": "cash",
        "allocations": [{"invoice_id": invoice_id, "amount": "60.00"}],
    }
    first = configured_client.post(f"/api/v1/businesses/{business_id}/payments", json=payload)
    assert first.status_code == 201
    assert first.json()["amount"] == "60.00"

    replay = configured_client.post(f"/api/v1/businesses/{business_id}/payments", json=payload)
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    listed = configured_client.get(f"/api/v1/businesses/{business_id}/payments")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["allocations"] == [{"invoice_id": invoice_id, "amount": "60.00"}]

    dashboard = configured_client.get(f"/api/v1/businesses/{business_id}/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["collected_payments"][0]["total"] == "60.00"
    assert dashboard.json()["outstanding_balances"][0]["total"] == "40.00"


def test_payment_recording_rejects_allocation_above_invoice_balance(configured_client):
    created = configured_client.post("/api/v1/businesses", json={
        "name": "Payment Validation", "currency_code": "EGP"
    })
    business_id = created.json()["id"]
    product = configured_client.post(f"/api/v1/businesses/{business_id}/products", json={
        "name": "Service", "unit_price": "25.00", "is_stock_tracked": False
    })
    draft = configured_client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": "INV-PAYMENT-OVER", "currency_code": "EGP",
        "lines": [{"product_id": product.json()["id"], "quantity": "1"}]
    })
    invoice_id = draft.json()["id"]
    configured_client.post(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", json={})
    response = configured_client.post(f"/api/v1/businesses/{business_id}/payments", json={
        "amount": "30.00",
        "currency_code": "EGP",
        "idempotency_key": "payment-too-large",
        "allocations": [{"invoice_id": invoice_id, "amount": "30.00"}],
    })
    assert response.status_code == 422
