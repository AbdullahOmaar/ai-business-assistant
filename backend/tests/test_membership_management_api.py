from sqlalchemy import create_engine
from uuid import UUID
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models import AuditEvent, Base, Business, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def configured_client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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


def create_workspace(client):
    response = client.post("/api/v1/businesses", json={
        "name": "Membership Test Shop", "currency_code": "EGP"
    })
    assert response.status_code == 201
    return response.json()["id"]


def add_member(business_id, subject, role=MembershipRole.STAFF):
    factory = app.state.session_factory
    with factory() as session:
        member = BusinessMembership(
            business_id=UUID(business_id),
            user_subject=subject,
            role=role,
        )
        session.add(member)
        session.commit()
        session.refresh(member)
        return str(member.id)


def test_owner_can_list_and_change_member_role_with_audit_event(configured_client):
    business_id = create_workspace(configured_client)
    membership_id = add_member(business_id, "staff-user")

    listing = configured_client.get(f"/api/v1/businesses/{business_id}/memberships")
    assert listing.status_code == 200
    assert {item["user_subject"] for item in listing.json()} == {"workspace-owner", "staff-user"}

    changed = configured_client.patch(
        f"/api/v1/businesses/{business_id}/memberships/{membership_id}",
        json={"role": "owner"},
    )
    assert changed.status_code == 200
    assert changed.json()["role"] == "owner"

    with app.state.session_factory() as session:
        events = session.query(AuditEvent).filter_by(
            business_id=UUID(business_id),
            action="membership.role_changed",
        ).all()
    assert len(events) == 1


def test_non_owner_cannot_list_or_change_memberships(configured_client):
    business_id = create_workspace(configured_client)
    membership_id = add_member(business_id, "staff-user")
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("staff-user")

    listing = configured_client.get(f"/api/v1/businesses/{business_id}/memberships")
    changed = configured_client.patch(
        f"/api/v1/businesses/{business_id}/memberships/{membership_id}",
        json={"role": "owner"},
    )
    assert listing.status_code == 403
    assert changed.status_code == 403


def test_workspace_must_retain_at_least_one_owner(configured_client):
    business_id = create_workspace(configured_client)
    listing = configured_client.get(f"/api/v1/businesses/{business_id}/memberships")
    owner_id = next(item["id"] for item in listing.json() if item["role"] == "owner")

    demoted = configured_client.patch(
        f"/api/v1/businesses/{business_id}/memberships/{owner_id}",
        json={"role": "staff"},
    )
    removed = configured_client.delete(
        f"/api/v1/businesses/{business_id}/memberships/{owner_id}"
    )
    assert demoted.status_code == 422
    assert removed.status_code == 422


def test_membership_role_patch_rejects_extra_fields(configured_client):
    business_id = create_workspace(configured_client)
    member_id = add_member(business_id, "staff-user")
    response = configured_client.patch(
        f"/api/v1/businesses/{business_id}/memberships/{member_id}",
        json={"role": "owner", "user_subject": "attacker-selected-subject"},
    )
    assert response.status_code == 422


def test_workspace_owner_cannot_access_another_workspaces_memberships(configured_client):
    owned_business_id = create_workspace(configured_client)

    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("other-workspace-owner")
    other_business_id = create_workspace(configured_client)
    other_membership_id = add_member(other_business_id, "other-workspace-staff")

    # Restore the first workspace owner and attempt IDOR-style access to the
    # second workspace's membership collection and a known membership ID.
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("workspace-owner")
    listing = configured_client.get(f"/api/v1/businesses/{other_business_id}/memberships")
    changed = configured_client.patch(
        f"/api/v1/businesses/{other_business_id}/memberships/{other_membership_id}",
        json={"role": "owner"},
    )
    removed = configured_client.delete(
        f"/api/v1/businesses/{other_business_id}/memberships/{other_membership_id}"
    )

    assert owned_business_id != other_business_id
    assert listing.status_code == 403
    assert changed.status_code == 403
    assert removed.status_code == 403



def test_role_change_rechecks_owner_after_workspace_lock(configured_client, monkeypatch):
    import app.core_features_api as core_features_api
    from app.security import AuthorizationError

    business_id = create_workspace(configured_client)
    membership_id = add_member(business_id, "staff-user")
    calls = 0

    def revoke_owner_after_lock(session, principal, requested_business_id, *, owner_only=False):
        nonlocal calls
        calls += 1
        if calls == 1:
            return None
        raise AuthorizationError("Business role is not permitted for this operation")

    monkeypatch.setattr(core_features_api, "_authorize", revoke_owner_after_lock)
    response = configured_client.patch(
        f"/api/v1/businesses/{business_id}/memberships/{membership_id}",
        json={"role": "owner"},
    )

    assert calls == 2
    assert response.status_code == 403
    with app.state.session_factory() as session:
        membership = session.get(BusinessMembership, UUID(membership_id))
        events = session.query(AuditEvent).filter_by(
            business_id=UUID(business_id), action="membership.role_changed"
        ).all()
    assert membership is not None
    assert membership.role is MembershipRole.STAFF
    assert events == []


def test_member_removal_rechecks_owner_after_workspace_lock(configured_client, monkeypatch):
    import app.core_features_api as core_features_api
    from app.security import AuthorizationError

    business_id = create_workspace(configured_client)
    membership_id = add_member(business_id, "staff-user")
    calls = 0

    def revoke_owner_after_lock(session, principal, requested_business_id, *, owner_only=False):
        nonlocal calls
        calls += 1
        if calls == 1:
            return None
        raise AuthorizationError("Business role is not permitted for this operation")

    monkeypatch.setattr(core_features_api, "_authorize", revoke_owner_after_lock)
    response = configured_client.delete(
        f"/api/v1/businesses/{business_id}/memberships/{membership_id}"
    )

    assert calls == 2
    assert response.status_code == 403
    with app.state.session_factory() as session:
        membership = session.get(BusinessMembership, UUID(membership_id))
        events = session.query(AuditEvent).filter_by(
            business_id=UUID(business_id), action="membership.removed"
        ).all()
    assert membership is not None
    assert membership.role is MembershipRole.STAFF
    assert events == []


def test_member_removal_fails_closed_if_workspace_deactivates_after_initial_auth(
    configured_client, monkeypatch
):
    import app.core_features_api as core_features_api

    business_id = create_workspace(configured_client)
    membership_id = add_member(business_id, "staff-user")

    def deactivate_after_initial_authorization(
        session, principal, requested_business_id, *, owner_only=False
    ):
        business = session.get(Business, UUID(requested_business_id))
        business.is_active = False
        session.flush()
        return None

    monkeypatch.setattr(core_features_api, "_authorize", deactivate_after_initial_authorization)
    response = configured_client.delete(
        f"/api/v1/businesses/{business_id}/memberships/{membership_id}"
    )

    assert response.status_code == 404
    with app.state.session_factory() as session:
        membership = session.get(BusinessMembership, UUID(membership_id))
        events = session.query(AuditEvent).filter_by(
            business_id=UUID(business_id), action="membership.removed"
        ).all()
    assert membership is not None
    assert events == []
