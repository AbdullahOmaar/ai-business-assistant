"""API contract for manual stock-movement idempotency (Linear 3A-342).

Mirrors the purchase-receipt idempotency precedent: the endpoint requires
a canonical UUID Idempotency-Key header, replays the original response
for a same-key/same-payload retry, rejects same-key/different-payload
reuse with 409, scopes keys per business, and never lets a rejected
movement burn its key.
"""
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import (
    AuditEvent,
    Business,
    BusinessMembership,
    MembershipRole,
    Product,
    StockMovement,
    StockMovementIdempotency,
)
from app.security import AuthenticatedPrincipal
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture


def _add_product(engine, business_id, name="Idem widget"):
    with Session(engine) as session:
        product = Product(
            business_id=business_id, name=name,
            unit_price=Decimal("5.00"), is_stock_tracked=True, is_active=True,
        )
        session.add(product)
        session.commit()
        return product.id


def _snapshot(engine, business_id):
    with Session(engine) as session:
        movements = session.scalar(
            select(func.count()).select_from(StockMovement)
            .where(StockMovement.business_id == business_id)
        )
        audits = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "stock.movement_recorded",
            )
        )
        claims = session.scalar(
            select(func.count()).select_from(StockMovementIdempotency)
            .where(StockMovementIdempotency.business_id == business_id)
        )
        total = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0))
            .where(StockMovement.business_id == business_id)
        )
    return movements, audits, claims, Decimal(str(total))


def _payload(product_id, quantity="5.000", reason="idem test"):
    return {
        "product_id": str(product_id),
        "movement_type": "adjustment",
        "quantity_delta": quantity,
        "reason": reason,
    }


def test_stock_movement_requires_canonical_idempotency_key_without_side_effects():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        product_id = _add_product(engine, business_id)
        url = f"/api/v1/businesses/{business_id}/stock-movements"
        before = _snapshot(engine, business_id)

        missing = client.post(url, json=_payload(product_id))
        malformed = client.post(url, json=_payload(product_id), headers={"Idempotency-Key": "not-a-uuid"})
        uppercase = client.post(url, json=_payload(product_id), headers={"Idempotency-Key": str(uuid4()).upper()})

        assert missing.status_code == 422, missing.text
        assert missing.json()["detail"] == "A canonical UUID Idempotency-Key header is required."
        assert malformed.status_code == 422, malformed.text
        assert uppercase.status_code == 422, uppercase.text
        assert _snapshot(engine, business_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_stock_movement_replay_and_payload_conflict():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        product_id = _add_product(engine, business_id)
        url = f"/api/v1/businesses/{business_id}/stock-movements"
        key = str(uuid4())
        headers = {"Idempotency-Key": key}

        first = client.post(url, json=_payload(product_id), headers=headers)
        assert first.status_code == 201, first.text
        after_first = _snapshot(engine, business_id)
        assert after_first[0] == 1 and after_first[3] == Decimal("5.000")

        replay = client.post(url, json=_payload(product_id), headers=headers)
        assert replay.status_code == 201, replay.text
        assert replay.json() == first.json()
        assert _snapshot(engine, business_id) == after_first

        # Equivalent quantity formatting canonicalizes to the same payload.
        replay_formatted = client.post(url, json=_payload(product_id, quantity="5.0"), headers=headers)
        assert replay_formatted.status_code == 201, replay_formatted.text
        assert replay_formatted.json() == first.json()
        assert _snapshot(engine, business_id) == after_first

        conflict_quantity = client.post(url, json=_payload(product_id, quantity="6.000"), headers=headers)
        assert conflict_quantity.status_code == 409, conflict_quantity.text
        conflict_reason = client.post(url, json=_payload(product_id, reason="other"), headers=headers)
        assert conflict_reason.status_code == 409, conflict_reason.text
        assert _snapshot(engine, business_id) == after_first
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_stock_movement_key_scope_is_per_business():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        with Session(engine) as session:
            other = Business(name="Idem other shop", currency_code="EGP")
            session.add(other)
            session.flush()
            session.add(BusinessMembership(
                business_id=other.id, user_subject="test-subject",
                role=MembershipRole.OWNER,
            ))
            session.commit()
            other_id = other.id
        product_a = _add_product(engine, business_id, "Widget A")
        product_b = _add_product(engine, other_id, "Widget B")

        key = str(uuid4())
        headers = {"Idempotency-Key": key}
        first = client.post(
            f"/api/v1/businesses/{business_id}/stock-movements",
            json=_payload(product_a), headers=headers,
        )
        second = client.post(
            f"/api/v1/businesses/{other_id}/stock-movements",
            json=_payload(product_b), headers=headers,
        )
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["id"] != second.json()["id"]
        assert _snapshot(engine, business_id)[0] == 1
        assert _snapshot(engine, other_id)[0] == 1
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_rejected_stock_movement_does_not_burn_its_key():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        product_id = _add_product(engine, business_id)
        url = f"/api/v1/businesses/{business_id}/stock-movements"
        key = str(uuid4())
        headers = {"Idempotency-Key": key}

        # A sale larger than available stock is rejected by the service.
        rejected = client.post(url, json={
            "product_id": str(product_id),
            "movement_type": "sale",
            "quantity_delta": "-5.000",
            "reason": "too much",
        }, headers=headers)
        assert rejected.status_code == 422, rejected.text
        assert _snapshot(engine, business_id) == (0, 0, 0, Decimal("0"))

        # The same key stays usable for the corrected, valid movement.
        accepted = client.post(url, json=_payload(product_id), headers=headers)
        assert accepted.status_code == 201, accepted.text
        assert _snapshot(engine, business_id)[0] == 1
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_staff_cannot_record_stock_movement_with_or_without_key():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        with Session(engine) as session:
            session.add(BusinessMembership(
                business_id=business_id, user_subject="staff-subject",
                role=MembershipRole.STAFF,
            ))
            session.commit()
        product_id = _add_product(engine, business_id)
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject="staff-subject")
        url = f"/api/v1/businesses/{business_id}/stock-movements"
        before = _snapshot(engine, business_id)

        with_key = client.post(url, json=_payload(product_id), headers={"Idempotency-Key": str(uuid4())})
        without_key = client.post(url, json=_payload(product_id))
        assert with_key.status_code == 403, with_key.text
        assert without_key.status_code == 403, without_key.text
        assert _snapshot(engine, business_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()
