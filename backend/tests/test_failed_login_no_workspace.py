"""3A-262 (T53): a failed sign-in must not create a workspace.

End-to-end regression evidence through the real Firebase principal resolver:
when token verification fails (the backend view of a failed sign-in), the
workspace-creation endpoint rejects the request and the database still holds
zero businesses and zero memberships. A control test proves the same counting
path does observe a workspace when a verified principal creates one, so the
zero counts are meaningful.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import firebase_auth
from app.main import app
from app.models import Base, Business, BusinessMembership
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def workspace_db():
    engine = create_engine(
        "sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = factory
    try:
        yield factory
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


def _counts(factory):
    with factory() as session:
        businesses = session.scalar(select(func.count()).select_from(Business))
        memberships = session.scalar(select(func.count()).select_from(BusinessMembership))
    return businesses, memberships


def _use_real_resolver_with_rejecting_verifier(monkeypatch):
    """Wire the production resolver, with token verification always failing.

    This is exactly the failed-sign-in path: Firebase rejects the credential,
    the resolver raises 401, and no route code ever runs.
    """
    import firebase_admin.auth

    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(firebase_auth, "_firebase_app", lambda: object())

    def reject(token, *, app, check_revoked):
        assert check_revoked is True
        raise firebase_admin.auth.InvalidIdTokenError("invalid token")

    monkeypatch.setattr(firebase_admin.auth, "verify_id_token", reject)
    app.state.principal_resolver = firebase_auth.firebase_principal_resolver


def test_failed_sign_in_creates_no_workspace(workspace_db, monkeypatch):
    _use_real_resolver_with_rejecting_verifier(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)

    assert _counts(workspace_db) == (0, 0)
    response = client.post(
        "/api/v1/businesses",
        json={"name": "Should Not Exist", "currency_code": "EGP"},
        headers={"Authorization": "Bearer <redacted>"},
    )
    assert response.status_code == 401
    assert _counts(workspace_db) == (0, 0)


def test_missing_token_creates_no_workspace(workspace_db, monkeypatch):
    _use_real_resolver_with_rejecting_verifier(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)

    create = client.post(
        "/api/v1/businesses",
        json={"name": "Should Not Exist", "currency_code": "EGP"},
    )
    assert create.status_code == 401
    listing = client.get("/api/v1/businesses")
    assert listing.status_code == 401
    assert _counts(workspace_db) == (0, 0)


def test_unconfigured_auth_creates_no_workspace(workspace_db):
    if hasattr(app.state, "principal_resolver"):
        del app.state.principal_resolver
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/v1/businesses",
        json={"name": "Should Not Exist", "currency_code": "EGP"},
        headers={"Authorization": "Bearer <redacted>"},
    )
    assert response.status_code == 503
    assert _counts(workspace_db) == (0, 0)


def test_verified_sign_in_can_still_create_workspace(workspace_db):
    """Control: the counting path sees a workspace when creation is legitimate."""
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("workspace-owner")
    client = TestClient(app, raise_server_exceptions=False)

    response = client.post(
        "/api/v1/businesses",
        json={"name": "Legitimate Shop", "currency_code": "EGP"},
    )
    assert response.status_code == 201
    assert _counts(workspace_db) == (1, 1)
