"""Cashbox (C3, 3A-727): physical-cash movements + daily close.

The balance is computed from signed entries (opening + deposits -
withdrawals), never stored. Any member may record a movement (the
expenses/payments pattern); the daily close is owner-only and
carries the handover receipt. A withdrawal larger than the
balance is rejected.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.extended_api import _cashbox_balance, _cashbox_signed_amount
from app.main import app
from app.models import AuditEvent, Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


def _environment():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.session_factory = factory
    subject = {"value": "cashbox-owner"}

    def resolver(request):
        return AuthenticatedPrincipal(subject["value"])

    app.state.principal_resolver = resolver
    return factory, subject, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def test_cashbox_signed_amounts_and_balance() -> None:
    assert _cashbox_signed_amount("opening", Decimal("10.00")) == Decimal("10.00")
    assert _cashbox_signed_amount("deposit", Decimal("10.00")) == Decimal("10.00")
    assert _cashbox_signed_amount("withdrawal", Decimal("10.00")) == Decimal("-10.00")

    class _Entry:
        def __init__(self, kind, amount):
            self.kind = kind
            self.amount = Decimal(amount)

    entries = [
        _Entry("opening", "100.00"),
        _Entry("deposit", "50.00"),
        _Entry("withdrawal", "30.00"),
    ]
    assert _cashbox_balance(entries) == Decimal("120.00")
    assert _cashbox_balance([]) == Decimal(0)


def _make_business(client) -> UUID:
    business = client.post(
        "/api/v1/businesses", json={"name": "Cashbox Centre", "currency_code": "EGP"}
    )
    assert business.status_code == 201, business.text
    return UUID(business.json()["id"])


def _entry(client, business_id, kind, amount, reason="test"):
    return client.post(
        f"/api/v1/businesses/{business_id}/cashbox/entries",
        json={
            "kind": kind, "amount": amount, "currency_code": "EGP",
            "reason": reason,
        },
    )


def test_cashbox_flow_balance_overwithdrawal_and_close():
    factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)

        opening = _entry(client, business_id, "opening", "500.00", "morning float")
        assert opening.status_code == 201, opening.text
        deposit = _entry(client, business_id, "deposit", "250.00", "fees collected")
        assert deposit.status_code == 201, deposit.text
        withdrawal = _entry(client, business_id, "withdrawal", "100.00", "supplies")
        assert withdrawal.status_code == 201, withdrawal.text

        balance = client.get(f"/api/v1/businesses/{business_id}/cashbox/balance")
        assert balance.status_code == 200, balance.text
        rows = balance.json()["balances"]
        assert rows == [
            {"currency_code": "EGP", "balance": "650.00", "entry_count": 3}
        ]

        too_much = _entry(client, business_id, "withdrawal", "700.00", "too much")
        assert too_much.status_code == 422, too_much.text

        close = client.post(
            f"/api/v1/businesses/{business_id}/cashbox/close",
            json={
                "currency_code": "EGP", "counted_amount": "640.00",
                "handed_by": "Mona", "received_by": "Karim",
                "note": "10 EGP short, logged",
            },
        )
        assert close.status_code == 201, close.text
        body = close.json()
        assert body["expected_amount"] == "650.00"
        assert body["counted_amount"] == "640.00"
        assert body["variance"] == "-10.00"
        assert body["handed_by"] == "Mona"
        assert body["received_by"] == "Karim"

        second = client.post(
            f"/api/v1/businesses/{business_id}/cashbox/close",
            json={
                "currency_code": "EGP", "counted_amount": "650.00",
                "handed_by": "Mona", "received_by": "Karim",
            },
        )
        assert second.status_code == 422, second.text

        closings = client.get(f"/api/v1/businesses/{business_id}/cashbox/closings")
        assert closings.status_code == 200, closings.text
        assert len(closings.json()) == 1

        with factory() as session:
            actions = session.scalars(
                select(AuditEvent.action).where(
                    AuditEvent.business_id == business_id
                )
            ).all()
        assert actions.count("cashbox.opened") == 1
        assert actions.count("cashbox.deposit") == 1
        assert actions.count("cashbox.withdrawal") == 1
        assert actions.count("cashbox.closed") == 1
    finally:
        _restore(previous_factory, previous_resolver)


def test_cashbox_staff_records_but_cannot_close_and_strangers_are_denied():
    factory, subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)
        with factory() as session:
            session.add(BusinessMembership(
                business_id=business_id, user_subject="cashbox-staff",
                role=MembershipRole.STAFF,
            ))
            session.commit()

        subject["value"] = "cashbox-staff"
        recorded = _entry(client, business_id, "opening", "200.00", "staff float")
        assert recorded.status_code == 201, recorded.text
        denied_close = client.post(
            f"/api/v1/businesses/{business_id}/cashbox/close",
            json={
                "currency_code": "EGP", "counted_amount": "200.00",
                "handed_by": "Staff", "received_by": "Owner",
            },
        )
        assert denied_close.status_code == 403, denied_close.text

        subject["value"] = "cashbox-stranger"
        denied_read = client.get(f"/api/v1/businesses/{business_id}/cashbox/balance")
        assert denied_read.status_code == 403, denied_read.text
        denied_write = _entry(client, business_id, "deposit", "1.00")
        assert denied_write.status_code == 403, denied_write.text
    finally:
        _restore(previous_factory, previous_resolver)


if __name__ == "__main__":
    import pytest

    pytest.main([__file__])
