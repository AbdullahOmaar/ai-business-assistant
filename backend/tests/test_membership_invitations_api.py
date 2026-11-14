from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base, BusinessInvitation, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def invitation_client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    current = {"principal": AuthenticatedPrincipal("workspace-owner")}
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: current["principal"]
    try:
        yield TestClient(app), current, engine
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


def create_workspace(client):
    response = client.post(
        "/api/v1/businesses",
        json={"name": "Invite Test Shop", "currency_code": "EGP"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_invitation(client, business_id, email="staff@example.com"):
    response = client.post(
        f"/api/v1/businesses/{business_id}/invitations",
        json={"email": email},
    )
    assert response.status_code == 201
    return response.json()


def test_owner_can_create_and_verified_user_can_accept_staff_invitation(invitation_client):
    client, current, engine = invitation_client
    business_id = create_workspace(client)
    created = create_invitation(client, business_id, " Staff@Example.com ")

    assert created["email"] == "staff@example.com"
    assert created["role"] == "staff"
    assert len(created["token"]) >= 40
    assert created["status"] == "pending"

    with Session(engine) as session:
        stored = session.scalar(select(BusinessInvitation.token_hash))
        assert stored != created["token"]

    current["principal"] = AuthenticatedPrincipal(
        "firebase:test-project:staff-user",
        email="staff@example.com",
        email_verified=True,
    )
    accepted = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    assert accepted.status_code == 201
    assert accepted.json()["role"] == "staff"
    assert accepted.json()["business_id"] == business_id

    with Session(engine) as session:
        member = session.scalars(select(BusinessMembership).where(
            BusinessMembership.business_id == UUID(business_id),
            BusinessMembership.user_subject == "firebase:test-project:staff-user",
        )).one()
        invite = session.get(BusinessInvitation, UUID(created["id"]))
        events = session.scalars(select(AuditEvent.action).where(
            AuditEvent.business_id == UUID(business_id)
        )).all()
    assert member.role is MembershipRole.STAFF
    assert invite.status == "accepted"
    assert "membership.invitation_created" in events
    assert "membership.invitation_accepted" in events


def test_staff_cannot_create_or_list_invitations(invitation_client):
    client, current, _ = invitation_client
    business_id = create_workspace(client)
    current["principal"] = AuthenticatedPrincipal("firebase:test-project:staff-user")
    created = client.post(
        f"/api/v1/businesses/{business_id}/invitations",
        json={"email": "another@example.com"},
    )
    listing = client.get(f"/api/v1/businesses/{business_id}/invitations")
    assert created.status_code == 403
    assert listing.status_code == 403


@pytest.mark.parametrize(
    "principal",
    [
        AuthenticatedPrincipal("firebase:test-project:unverified", email="staff@example.com"),
        AuthenticatedPrincipal("firebase:test-project:no-email", email_verified=True),
        AuthenticatedPrincipal("firebase:test-project:mismatch", email="other@example.com", email_verified=True),
    ],
)
def test_accept_requires_verified_matching_email(invitation_client, principal):
    client, current, _ = invitation_client
    business_id = create_workspace(client)
    created = create_invitation(client, business_id)
    current["principal"] = principal
    response = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    assert response.status_code == 403
    assert client.get(f"/api/v1/businesses/{business_id}").status_code == 403


def test_revoked_invitation_cannot_be_accepted(invitation_client):
    client, current, _ = invitation_client
    business_id = create_workspace(client)
    created = create_invitation(client, business_id)
    revoked = client.delete(
        f"/api/v1/businesses/{business_id}/invitations/{created['id']}"
    )
    assert revoked.status_code == 204
    current["principal"] = AuthenticatedPrincipal(
        "firebase:test-project:staff-user", email="staff@example.com", email_verified=True
    )
    accepted = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    assert accepted.status_code == 410


def test_expired_invitation_cannot_be_accepted(invitation_client):
    client, current, engine = invitation_client
    business_id = create_workspace(client)
    created = create_invitation(client, business_id)
    with Session(engine) as session:
        invitation = session.get(BusinessInvitation, UUID(created["id"]))
        invitation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.commit()
    current["principal"] = AuthenticatedPrincipal(
        "firebase:test-project:staff-user", email="staff@example.com", email_verified=True
    )
    accepted = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    assert accepted.status_code == 410


def test_invitation_is_single_use_and_list_never_exposes_token(invitation_client):
    client, current, _ = invitation_client
    business_id = create_workspace(client)
    created = create_invitation(client, business_id)
    listing = client.get(f"/api/v1/businesses/{business_id}/invitations")
    assert listing.status_code == 200
    assert "token" not in listing.json()[0]

    current["principal"] = AuthenticatedPrincipal(
        "firebase:test-project:staff-user", email="staff@example.com", email_verified=True
    )
    first = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    second = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    assert first.status_code == 201
    assert second.status_code == 410


def test_invitation_cannot_be_accepted_after_inviter_loses_owner_role(invitation_client):
    client, current, engine = invitation_client
    business_id = create_workspace(client)
    created = create_invitation(client, business_id)
    with Session(engine) as session:
        owner = session.scalars(select(BusinessMembership).where(
            BusinessMembership.business_id == UUID(business_id),
            BusinessMembership.user_subject == "workspace-owner",
        )).one()
        owner.role = MembershipRole.STAFF
        session.commit()
    current["principal"] = AuthenticatedPrincipal(
        "firebase:test-project:staff-user", email="staff@example.com", email_verified=True
    )
    accepted = client.post("/api/v1/invitations/accept", json={"token": created["token"]})
    assert accepted.status_code == 410


def test_invitation_limits_prevent_unbounded_owner_creation(invitation_client):
    client, _, _ = invitation_client
    business_id = create_workspace(client)
    for index in range(5):
        response = client.post(
            f"/api/v1/businesses/{business_id}/invitations",
            json={"email": f"staff{index}@example.com"},
        )
        assert response.status_code == 201
    limited = client.post(
        f"/api/v1/businesses/{business_id}/invitations",
        json={"email": "staff6@example.com"},
    )
    assert limited.status_code == 429
