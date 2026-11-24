"""B3 (3A-721): business deletion, the verifiable full export, and
account deletion — dedicated proof beyond the route matrix rows.

Deletion is a soft delete (is_active=False + deleted_at) whose access
cutoff comes from authorize_membership requiring an active business;
the export carries a manifest (counts + SHA-256) the owner can
recompute; account deletion refuses while the caller is the only
owner of an active business.
"""
import hashlib
import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import core_features_api
from app.main import app
from app.models import (
    AuditEvent,
    Base,
    Business,
    BusinessMembership,
    Customer,
    MembershipRole,
    Product,
)
from app.security import AuthenticatedPrincipal

OWNER = "b3-owner"
SECOND = "b3-second-owner"
STAFF = "b3-staff"


def _environment():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": OWNER}
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = factory
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject=subject["value"]
    )
    deleted_identities: list[str] = []
    previous_delete = core_features_api._delete_identity_user
    core_features_api._delete_identity_user = deleted_identities.append
    return factory, subject, previous_factory, previous_resolver, previous_delete, deleted_identities


def _restore(previous_factory, previous_resolver, previous_delete):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver
    core_features_api._delete_identity_user = previous_delete


def _seed_business(factory, *, owner: str = OWNER, name: str = "B3 Export Co") -> UUID:
    with factory() as session:
        business = Business(name=name, currency_code="EGP")
        session.add(business)
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id, user_subject=owner, role=MembershipRole.OWNER,
        ))
        session.add(BusinessMembership(
            business_id=business.id, user_subject=STAFF, role=MembershipRole.STAFF,
        ))
        session.add(Customer(business_id=business.id, name="Customer One"))
        session.add(Customer(business_id=business.id, name="Customer Two"))
        session.add(Product(
            business_id=business.id, name="Widget", unit_price="10.00",
        ))
        session.commit()
        return business.id


def _events(factory, business_id: UUID, action: str):
    with factory() as session:
        return session.scalars(select(AuditEvent).where(
            AuditEvent.business_id == business_id, AuditEvent.action == action,
        )).all()


@pytest.fixture()
def env():
    factory, subject, pf, pr, pd, deleted = _environment()
    try:
        yield factory, subject, deleted
    finally:
        _restore(pf, pr, pd)


def test_export_is_complete_verifiable_and_audited(env):
    factory, _subject, _deleted = env
    business_id = _seed_business(factory)
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get(f"/api/v1/businesses/{business_id}/export")
    assert response.status_code == 200, response.text
    document = response.json()
    manifest, data = document["manifest"], document["data"]
    assert manifest["business_id"] == str(business_id)
    assert manifest["counts"]["customers"] == 2
    assert manifest["counts"]["products"] == 1
    assert manifest["counts"]["memberships"] == 2
    assert len(data["customers"]) == 2
    # The manifest hash recomputes from the data section alone.
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    assert hashlib.sha256(canonical.encode("utf-8")).hexdigest() == manifest["sha256"]
    # The export itself is audited.
    assert len(_events(factory, business_id, "business.exported")) == 1


def test_export_is_owner_only(env):
    factory, subject, _deleted = env
    business_id = _seed_business(factory)
    client = TestClient(app, raise_server_exceptions=False)
    subject["value"] = STAFF
    assert client.get(f"/api/v1/businesses/{business_id}/export").status_code == 403
    subject["value"] = "b3-outsider"
    assert client.get(f"/api/v1/businesses/{business_id}/export").status_code == 403


def test_business_delete_needs_the_exact_name_and_cuts_access(env):
    factory, subject, _deleted = env
    business_id = _seed_business(factory)
    client = TestClient(app, raise_server_exceptions=False)
    base = f"/api/v1/businesses/{business_id}"
    wrong = client.request("DELETE", base, json={"confirm_name": "Not The Name"})
    assert wrong.status_code == 422, wrong.text
    assert client.get(base).status_code == 200  # still live
    subject["value"] = STAFF
    denied = client.request("DELETE", base, json={"confirm_name": "B3 Export Co"})
    assert denied.status_code == 403, denied.text
    subject["value"] = OWNER
    deleted = client.request("DELETE", base, json={"confirm_name": "B3 Export Co"})
    assert deleted.status_code == 204, deleted.text
    with factory() as session:
        business = session.get(Business, business_id)
        assert business.is_active is False
        assert business.deleted_at is not None
    assert len(_events(factory, business_id, "business.deleted")) == 1
    # Access is cut everywhere, and the business leaves the list.
    assert client.get(base).status_code == 403
    listing = client.get("/api/v1/businesses")
    assert str(business_id) not in [row["id"] for row in listing.json()]
    again = client.request("DELETE", base, json={"confirm_name": "B3 Export Co"})
    assert again.status_code == 403


def test_account_delete_blocks_a_sole_owner(env):
    factory, _subject, deleted = env
    business_id = _seed_business(factory)
    client = TestClient(app, raise_server_exceptions=False)
    blocked = client.delete("/api/v1/me")
    assert blocked.status_code == 409, blocked.text
    assert "B3 Export Co" in blocked.json()["detail"]
    assert deleted == []  # the identity provider was never called
    with factory() as session:
        assert session.get(Business, business_id).is_active is True


def test_account_delete_with_a_second_owner_removes_everything(env):
    factory, _subject, deleted = env
    business_id = _seed_business(factory)
    with factory() as session:
        session.add(BusinessMembership(
            business_id=business_id, user_subject=SECOND, role=MembershipRole.OWNER,
        ))
        session.commit()
    client = TestClient(app, raise_server_exceptions=False)
    response = client.delete("/api/v1/me")
    assert response.status_code == 204, response.text
    assert deleted == [OWNER]
    with factory() as session:
        remaining = session.scalars(select(BusinessMembership).where(
            BusinessMembership.user_subject == OWNER,
        )).all()
        assert remaining == []
        # The business itself survives under its second owner.
        assert session.get(Business, business_id).is_active is True
    assert len(_events(factory, business_id, "account.deleted")) == 1
