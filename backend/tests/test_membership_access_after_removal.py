"""3A-252 (T43) acceptance: access ends at removal; switching stays clean.

Invitation lifecycle and membership management mechanics are covered by
test_membership_invitations_api.py and test_membership_management_api.py.
This file pins the two T43 acceptance points those suites do not assert
end to end:

- after an owner removes a member, that member's next calls to the
  business are denied (403) and the business disappears from their
  business list;
- a user who belongs to two businesses keeps full access to the other
  business after being removed from one (switching/isolation).
"""

from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "removal-test-owner"
MEMBER = "removal-test-member"


@pytest.fixture
def membership_env(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    current_subject = {"value": OWNER}
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(current_subject["value"])
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    try:
        yield {"client": TestClient(app), "subject": current_subject}
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


def _business(env, name: str) -> str:
    response = env["client"].post("/api/v1/businesses", json={"name": name, "currency_code": "EGP"})
    assert response.status_code == 201
    return response.json()["id"]


def _add_member(business_id: str, subject: str) -> str:
    with app.state.session_factory() as session:
        member = BusinessMembership(
            business_id=UUID(business_id), user_subject=subject, role=MembershipRole.STAFF
        )
        session.add(member)
        session.commit()
        session.refresh(member)
        return str(member.id)


def _member_business_ids(env) -> list[str]:
    env["subject"]["value"] = MEMBER
    response = env["client"].get("/api/v1/businesses")
    assert response.status_code == 200
    return [business["id"] for business in response.json()]


def test_removed_member_loses_access_immediately(membership_env):
    env = membership_env
    business_id = _business(env, "Removal shop")
    membership_id = _add_member(business_id, MEMBER)
    base = f"/api/v1/businesses/{business_id}"

    # The member can read the business and sees it in their list.
    env["subject"]["value"] = MEMBER
    assert env["client"].get(f"{base}/customers").status_code == 200
    assert business_id in _member_business_ids(env)

    # The owner removes them.
    env["subject"]["value"] = OWNER
    removed = env["client"].delete(f"{base}/memberships/{membership_id}")
    assert removed.status_code == 204

    # Access is gone: reads denied, business no longer listed.
    env["subject"]["value"] = MEMBER
    assert env["client"].get(f"{base}/customers").status_code == 403
    assert business_id not in _member_business_ids(env)


def test_removal_from_one_business_keeps_the_other(membership_env):
    env = membership_env
    first_id = _business(env, "First shop")
    second_id = _business(env, "Second shop")
    first_membership = _add_member(first_id, MEMBER)
    _add_member(second_id, MEMBER)

    env["subject"]["value"] = OWNER
    removed = env["client"].delete(f"/api/v1/businesses/{first_id}/memberships/{first_membership}")
    assert removed.status_code == 204

    env["subject"]["value"] = MEMBER
    assert env["client"].get(f"/api/v1/businesses/{first_id}/customers").status_code == 403
    assert env["client"].get(f"/api/v1/businesses/{second_id}/customers").status_code == 200
    listed = _member_business_ids(env)
    assert first_id not in listed
    assert second_id in listed
