"""Transport/delivery master switch + unit name (3A-920, foundation).

Covers the read contract in app.transport_settings:
- DEFAULT OFF: a business with no rows has transport disabled.
- Only an explicit true value enables it ("true"/"1"/"yes"/"on";
  anything else — including "false" — is off).
- The unit name defaults to "توصيلة" and follows the stored value
  (blank / over-long values fall back to the default).
- Tenant isolation: one business's rows never affect another's.
- Write path: the switch + name round-trip through the EXISTING
  owner-only PUT /settings/{key} endpoint (no new endpoint in the
  foundation) and are visible to any member through GET /settings;
  a non-owner write is refused with 403.
Uses the same in-memory SQLite + TestClient harness as the WhatsApp
channel tests.
"""
from __future__ import annotations

from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    Base,
    BusinessMembership,
    BusinessSetting,
    MembershipRole,
)
from app.security import AuthenticatedPrincipal
from app.transport_settings import (
    DEFAULT_TRANSPORT_UNIT_NAME,
    TRANSPORT_ENABLED_KEY,
    TRANSPORT_UNIT_NAME_KEY,
    transport_enabled,
    transport_settings,
    transport_unit_name,
)

OWNER = "transport-owner"
STAFF = "transport-staff"


@pytest.fixture()
def harness(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": OWNER}
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject["value"])
    client = TestClient(app)
    try:
        yield client, subject
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


@pytest.fixture()
def business(harness):
    client, subject = harness
    subject["value"] = OWNER
    response = client.post(
        "/api/v1/businesses", json={"name": "Transport Test Shop", "currency_code": "EGP"}
    )
    assert response.status_code == 201, response.text
    business_id = response.json()["id"]
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF,
        ))
        session.commit()
    return business_id


def _session():
    return app.state.session_factory()


def _put_setting(client, business_id, subject, key, value, *, as_owner=True):
    subject["value"] = OWNER if as_owner else STAFF
    return client.put(
        f"/api/v1/businesses/{business_id}/settings/{key}",
        json={"setting_value": value},
    )


def test_default_off_with_no_rows(business):
    with _session() as session:
        assert transport_enabled(session, business_id=UUID(business)) is False
        assert transport_unit_name(session, business_id=UUID(business)) == DEFAULT_TRANSPORT_UNIT_NAME
        assert transport_settings(session, business_id=UUID(business)) == {
            "enabled": False,
            "unit_name": DEFAULT_TRANSPORT_UNIT_NAME,
        }


@pytest.mark.parametrize("value,expected", [
    ("true", True), ("True", True), ("1", True), ("yes", True), ("on", True),
    ("false", False), ("0", False), ("no", False), ("", False), ("  ", False),
    ("enabled", False), ("anything-else", False),
])
def test_enabled_parsing(business, value, expected):
    with _session() as session:
        session.add(BusinessSetting(
            business_id=UUID(business), setting_key=TRANSPORT_ENABLED_KEY, setting_value=value,
        ))
        session.commit()
    with _session() as session:
        assert transport_enabled(session, business_id=UUID(business)) is expected


def test_unit_name_follows_stored_value(business):
    with _session() as session:
        session.add(BusinessSetting(
            business_id=UUID(business), setting_key=TRANSPORT_UNIT_NAME_KEY, setting_value="نقلة",
        ))
        session.commit()
    with _session() as session:
        assert transport_unit_name(session, business_id=UUID(business)) == "نقلة"
        assert transport_settings(session, business_id=UUID(business))["unit_name"] == "نقلة"


@pytest.mark.parametrize("stored", ["", "   ", "x" * 41])
def test_unit_name_falls_back_when_blank_or_too_long(business, stored):
    with _session() as session:
        session.add(BusinessSetting(
            business_id=UUID(business), setting_key=TRANSPORT_UNIT_NAME_KEY, setting_value=stored,
        ))
        session.commit()
    with _session() as session:
        assert transport_unit_name(session, business_id=UUID(business)) == DEFAULT_TRANSPORT_UNIT_NAME


def test_tenant_isolation(harness, business):
    client, subject = harness
    subject["value"] = OWNER
    other = client.post(
        "/api/v1/businesses", json={"name": "Other Shop", "currency_code": "EGP"}
    ).json()["id"]
    with _session() as session:
        session.add(BusinessSetting(
            business_id=UUID(business), setting_key=TRANSPORT_ENABLED_KEY, setting_value="true",
        ))
        session.add(BusinessSetting(
            business_id=UUID(business), setting_key=TRANSPORT_UNIT_NAME_KEY, setting_value="نقلة",
        ))
        session.commit()
    with _session() as session:
        assert transport_enabled(session, business_id=UUID(other)) is False
        assert transport_unit_name(session, business_id=UUID(other)) == DEFAULT_TRANSPORT_UNIT_NAME
        assert transport_enabled(session, business_id=UUID(business)) is True


def test_switch_round_trips_through_existing_settings_endpoint(harness, business):
    client, subject = harness
    # Owner enables + names the unit through the existing endpoint.
    assert _put_setting(client, business, subject, TRANSPORT_ENABLED_KEY, "true").status_code == 200
    assert _put_setting(client, business, subject, TRANSPORT_UNIT_NAME_KEY, "نقلة").status_code == 200
    with _session() as session:
        assert transport_settings(session, business_id=UUID(business)) == {
            "enabled": True, "unit_name": "نقلة",
        }
    # Any member can read the rows back through GET /settings.
    subject["value"] = STAFF
    listed = client.get(f"/api/v1/businesses/{business}/settings")
    assert listed.status_code == 200, listed.text
    by_key = {row["setting_key"]: row["setting_value"] for row in listed.json()}
    assert by_key[TRANSPORT_ENABLED_KEY] == "true"
    assert by_key[TRANSPORT_UNIT_NAME_KEY] == "نقلة"
    # Turning it off again is safe: rows stay stored, helper reads off.
    assert _put_setting(client, business, subject, TRANSPORT_ENABLED_KEY, "false").status_code == 200
    with _session() as session:
        assert transport_settings(session, business_id=UUID(business)) == {
            "enabled": False, "unit_name": "نقلة",
        }


def test_non_owner_cannot_write_the_switch(harness, business):
    client, subject = harness
    response = _put_setting(
        client, business, subject, TRANSPORT_ENABLED_KEY, "true", as_owner=False,
    )
    assert response.status_code == 403, response.text
    with _session() as session:
        assert transport_enabled(session, business_id=UUID(business)) is False
