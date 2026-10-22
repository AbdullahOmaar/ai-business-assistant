"""API-level regression tests for cross-business isolation."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
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
