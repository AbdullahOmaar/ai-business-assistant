"""3A-920 step 3 — the second selling unit + conversion factor on products.

The company sets its own second unit (a trip, a delivery, a carton) and
how many base units one second unit holds. Both are set together or
both absent; the factor is > 0. Setting a second unit is a transport
write — it needs the per-business switch on — and a pricing change, so
it is owner-only on PATCH. Clearing the pair stays allowed while off,
and turning the switch off never clears stored config.
"""
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "product-second-unit-test-owner"
STAFF = "product-second-unit-test-staff"


@pytest.fixture
def second_unit_environment(monkeypatch):
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
        client = TestClient(app)
        created = client.post("/api/v1/businesses", json={"name": "Second unit test", "currency_code": "EGP"})
        assert created.status_code == 201
        business_id = created.json()["id"]
        with app.state.session_factory() as session:
            session.add(BusinessMembership(
                business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF
            ))
            session.commit()
        yield {"client": client, "business_id": business_id, "subject": current_subject, "engine": engine}
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


def _set_transport(env, enabled: bool):
    response = env["client"].put(
        f"/api/v1/businesses/{env['business_id']}/settings/transport.enabled",
        json={"setting_value": "true" if enabled else "false"},
    )
    assert response.status_code == 200, response.text
    return response


def _create_product(env, **overrides):
    payload = {"name": "Sand", "unit": "meter", "unit_price": "10.00"}
    payload.update(overrides)
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/products", json=payload)


def _patch_product(env, product_id, payload):
    return env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/products/{product_id}", json=payload
    )


def test_create_defaults_to_no_second_unit(second_unit_environment):
    env = second_unit_environment
    created = _create_product(env)
    assert created.status_code == 201
    assert created.json()["second_unit_name"] is None
    assert created.json()["conversion_factor"] is None


def test_create_second_unit_requires_transport_on(second_unit_environment):
    env = second_unit_environment
    rejected = _create_product(env, second_unit_name="trip", conversion_factor="4")
    assert rejected.status_code == 422

    _set_transport(env, True)
    created = _create_product(env, second_unit_name="trip", conversion_factor="4")
    assert created.status_code == 201
    assert created.json()["second_unit_name"] == "trip"
    # The response echoes the inserted value, whose scale follows the
    # input ("4" not "4.000"); compare as a number, not as text.
    assert Decimal(created.json()["conversion_factor"]) == Decimal(4)


def test_create_second_unit_pair_must_match(second_unit_environment):
    env = second_unit_environment
    _set_transport(env, True)
    assert _create_product(env, second_unit_name="trip").status_code == 422
    assert _create_product(env, conversion_factor="4").status_code == 422
    assert _create_product(env, second_unit_name="trip", conversion_factor="0").status_code == 422
    assert _create_product(env, second_unit_name="trip", conversion_factor="-2").status_code == 422


def test_patch_second_unit_gated_and_merged(second_unit_environment):
    env = second_unit_environment
    product = _create_product(env).json()

    # A new second unit while off is rejected; clearing stays allowed.
    assert _patch_product(env, product["id"], {"second_unit_name": "trip", "conversion_factor": "4"}).status_code == 422
    cleared = _patch_product(env, product["id"], {"second_unit_name": None, "conversion_factor": None})
    assert cleared.status_code == 200

    _set_transport(env, True)
    updated = _patch_product(env, product["id"], {"second_unit_name": "trip", "conversion_factor": "4"})
    assert updated.status_code == 200
    assert updated.json()["second_unit_name"] == "trip"
    assert Decimal(updated.json()["conversion_factor"]) == Decimal(4)

    # A PATCH may set one side when the other is already stored.
    renamed = _patch_product(env, product["id"], {"second_unit_name": "delivery"})
    assert renamed.status_code == 200
    assert renamed.json()["second_unit_name"] == "delivery"
    assert Decimal(renamed.json()["conversion_factor"]) == Decimal(4)
    refactored = _patch_product(env, product["id"], {"conversion_factor": "5"})
    assert refactored.status_code == 200
    assert Decimal(refactored.json()["conversion_factor"]) == Decimal(5)

    # Renaming a stored unit while off stays allowed (not a new enrolment);
    # setting one on a product that has none does not.
    _set_transport(env, False)
    kept = _patch_product(env, product["id"], {"second_unit_name": "trip"})
    assert kept.status_code == 200
    assert kept.json()["second_unit_name"] == "trip"
    plain = _create_product(env, name="Gravel", unit_price="5.00").json()
    assert _patch_product(env, plain["id"], {"conversion_factor": "4"}).status_code == 422
    cleared_again = _patch_product(env, product["id"], {"second_unit_name": None, "conversion_factor": None})
    assert cleared_again.status_code == 200
    assert cleared_again.json()["second_unit_name"] is None


def test_patch_second_unit_is_owner_only(second_unit_environment):
    env = second_unit_environment
    _set_transport(env, True)
    product = _create_product(env).json()
    env["subject"]["value"] = STAFF
    try:
        response = _patch_product(env, product["id"], {"second_unit_name": "trip", "conversion_factor": "4"})
        assert response.status_code == 403
    finally:
        env["subject"]["value"] = OWNER
    assert _patch_product(env, product["id"], {"second_unit_name": "trip", "conversion_factor": "4"}).status_code == 200


def test_get_product_returns_second_unit_fields(second_unit_environment):
    env = second_unit_environment
    _set_transport(env, True)
    product = _create_product(env, second_unit_name="trip", conversion_factor="4").json()
    fetched = env["client"].get(f"/api/v1/businesses/{env['business_id']}/products/{product['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["second_unit_name"] == "trip"
    assert Decimal(fetched.json()["conversion_factor"]) == Decimal(4)
    listing = env["client"].get(f"/api/v1/businesses/{env['business_id']}/products")
    assert listing.status_code == 200
    row = next(item for item in listing.json() if item["id"] == product["id"])
    assert row["second_unit_name"] == "trip"
    assert Decimal(row["conversion_factor"]) == Decimal(4)
