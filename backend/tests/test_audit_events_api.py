from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models import Base
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("audit-owner")
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


def create_workspace(client, name="Audit Test Shop"):
    response = client.post("/api/v1/businesses", json={
        "name": name, "currency_code": "EGP"
    })
    assert response.status_code == 201
    return response.json()["id"]


def test_audit_feed_lists_only_safe_metadata_and_supports_filters(client):
    business_id = create_workspace(client)
    customer = client.post(f"/api/v1/businesses/{business_id}/customers", json={
        "name": "Customer One", "email": "one@example.com"
    })
    assert customer.status_code == 201

    changed = client.patch(
        f"/api/v1/businesses/{business_id}/customers/{customer.json()['id']}",
        json={"phone": "+201234567890"},
    )
    assert changed.status_code == 200

    response = client.get(f"/api/v1/businesses/{business_id}/audit-events")
    assert response.status_code == 200
    events = response.json()
    assert events
    assert all(event["actor_subject"] == "audit-owner" for event in events)
    assert all(event["action"] == "customer.updated" for event in events)
    assert all(event["target_type"] == "customer" for event in events)
    assert all("change_summary" not in event for event in events)
    assert all("email" not in event and "phone" not in event for event in events)

    filtered = client.get(
        f"/api/v1/businesses/{business_id}/audit-events",
        params={"action": "customer.updated", "target_type": "customer", "limit": 1},
    )
    assert filtered.status_code == 200
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["target_id"] == customer.json()["id"]


def test_audit_feed_denies_non_member_and_does_not_disclose_events(client):
    business_id = create_workspace(client)
    customer = client.post(f"/api/v1/businesses/{business_id}/customers", json={
        "name": "Private Customer"
    })
    assert customer.status_code == 201
    client.patch(
        f"/api/v1/businesses/{business_id}/customers/{customer.json()['id']}",
        json={"name": "Private Customer Updated"},
    )

    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
    response = client.get(f"/api/v1/businesses/{business_id}/audit-events")
    assert response.status_code == 403
    assert "No active membership" in response.json()["detail"]


def test_audit_feed_rejects_invalid_pagination(client):
    business_id = create_workspace(client)
    response = client.get(
        f"/api/v1/businesses/{business_id}/audit-events",
        params={"limit": 201},
    )
    assert response.status_code == 422
