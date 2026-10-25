"""API-level regression tests for cross-business isolation."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base
from uuid import UUID
from app.security import AuthenticatedPrincipal


def test_non_member_cannot_read_dashboard_or_mutate_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-owner")
    try:
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Private Workspace", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        business_id = created.json()["id"]
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        read_profile = client.get(f"/api/v1/businesses/{business_id}")
        read_dashboard = client.get(f"/api/v1/businesses/{business_id}/dashboard")
        mutate_profile = client.patch(
            f"/api/v1/businesses/{business_id}",
            json={"name": "Unauthorized Rename"},
        )
        assert read_profile.status_code == 403
        assert read_dashboard.status_code == 403
        assert mutate_profile.status_code == 403
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-owner")
        owner_read = client.get(f"/api/v1/businesses/{business_id}")
        assert owner_read.status_code == 200
        assert owner_read.json()["name"] == "Private Workspace"
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


def test_audit_events_are_owner_only_paginated_and_workspace_scoped():
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
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Audit Workspace", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        business_id = UUID(created.json()["id"])
        with app.state.session_factory() as session:
            session.add_all([
                AuditEvent(
                    business_id=business_id, actor_subject="audit-owner",
                    action="invoice.issued", target_type="invoice", target_id="inv-1",
                    change_summary="Invoice issued",
                ),
                AuditEvent(
                    business_id=business_id, actor_subject="audit-owner",
                    action="product.updated", target_type="product", target_id="prod-1",
                    change_summary="Product updated",
                ),
            ])
            session.commit()

        response = client.get(f"/api/v1/businesses/{business_id}/audit-events?limit=1&offset=0")
        assert response.status_code == 200
        assert response.json()["total"] == 2
        assert len(response.json()["items"]) == 1
        assert response.json()["items"][0]["business_id"] == str(business_id)

        filtered = client.get(
            f"/api/v1/businesses/{business_id}/audit-events?action=invoice.issued"
        )
        assert filtered.status_code == 200
        assert filtered.json()["total"] == 1
        assert filtered.json()["items"][0]["target_id"] == "inv-1"

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        denied = client.get(f"/api/v1/businesses/{business_id}/audit-events")
        assert denied.status_code == 403
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
