from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models import Base
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def configured_client():
    engine = create_engine("sqlite+pysqlite://")
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
