"""Proposal lifecycle: create -> approve -> execute -> audit (Slice 1).

Covers the closed-list gate, the payload-hash binding, the separate
owner approval, the 5-minute expiry, the per-action opt-out, and the
draft-vs-issued invoice split. Uses the same in-memory SQLite +
TestClient harness as the assistant refusal tests.
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AssistantProposal,
    AuditEvent,
    Base,
    BusinessMembership,
    Customer,
    Invoice,
    MembershipRole,
)
from app.security import AuthenticatedPrincipal

OWNER_A = "exec-owner-a"
OWNER_B = "exec-owner-b"
STAFF_A = "exec-staff-a"


@pytest.fixture()
def execution_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": OWNER_A}
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject["value"])
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
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
def business(execution_client):
    client, subject = execution_client
    subject["value"] = OWNER_A
    response = client.post("/api/v1/businesses", json={"name": "Execution Test Shop", "currency_code": "EGP"})
    assert response.status_code == 201
    business_id = response.json()["id"]
    business_uuid = UUID(business_id)
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=business_uuid, user_subject=OWNER_B, role=MembershipRole.OWNER,
        ))
        session.add(BusinessMembership(
            business_id=business_uuid, user_subject=STAFF_A, role=MembershipRole.STAFF,
        ))
        customer = Customer(business_id=business_uuid, name="Execution customer")
        session.add(customer)
        session.flush()
        session.add(Invoice(
            business_id=business_uuid, customer_id=customer.id, invoice_number="ISS-1",
            status="issued", currency_code="EGP",
            subtotal=Decimal("100.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("100.00"),
            issue_date=datetime(2026, 11, 1, tzinfo=UTC),
        ))
        session.add(Invoice(
            business_id=business_uuid, customer_id=customer.id, invoice_number="DFT-1",
            status="draft", currency_code="EGP",
            subtotal=Decimal("50.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("50.00"),
            issue_date=datetime(2026, 11, 1, tzinfo=UTC),
        ))
        session.commit()
        customer_id = str(customer.id)
        issued = session.scalars(
            select(Invoice).where(
                Invoice.business_id == business_uuid, Invoice.invoice_number == "ISS-1"
            )
        ).one()
        draft = session.scalars(
            select(Invoice).where(
                Invoice.business_id == business_uuid, Invoice.invoice_number == "DFT-1"
            )
        ).one()
    return {
        "id": business_id, "uuid": business_uuid,
        "customer_id": customer_id,
        "issued_invoice_id": str(issued.id),
        "draft_invoice_id": str(draft.id),
    }


def _as(client, subject, who: str):
    subject["value"] = who


def _proposals(client, business_id: str) -> str:
    return f"/api/v1/businesses/{business_id}/assistant/proposals"


def _create(client, business_id: str, action: str, payload: dict):
    return client.post(_proposals(client, business_id), json={"action": action, "payload": payload})


def _canonical_hash(payload: dict) -> str:
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _audit_events(business_uuid: UUID, action: str) -> list[AuditEvent]:
    with app.state.session_factory() as session:
        return list(session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_uuid, AuditEvent.action == action,
            )
        ).all())


# --- creation ---------------------------------------------------------------

def test_create_allowed_proposal_binds_payload_hash(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    payload = {"name": "Hash customer"}
    response = _create(client, business["id"], "customer.create", payload)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "proposed"
    assert body["action"] == "customer.create"
    assert body["effective_action"] == "customer.create"
    assert body["requires_second_approval"] is False
    # The stored payload is the canonical model dump (defaults filled),
    # and the hash binds to exactly that stored form.
    assert body["payload"]["name"] == "Hash customer"
    assert body["payload_hash"] == _canonical_hash(body["payload"])
    created = datetime.fromisoformat(body["created_at"])
    expires = datetime.fromisoformat(body["expires_at"])
    # 5 minutes within storage precision (SQLite now() is second-granular
    # and the insert can land in the next second under load).
    assert timedelta(minutes=4, seconds=59) <= expires - created < timedelta(minutes=5, seconds=1)


def test_create_forbidden_action_is_rejected(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    response = _create(client, business["id"], "customer.delete", {"customer_id": str(uuid4())})
    assert response.status_code == 403


def test_create_unknown_action_is_rejected(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    response = _create(client, business["id"], "unknown.action", {})
    assert response.status_code == 403


def test_create_invalid_payload_is_rejected(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    response = _create(client, business["id"], "customer.create", {"email": "no-name@example.com"})
    assert response.status_code == 422


def test_staff_cannot_request_owner_only_action(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, STAFF_A)
    response = _create(client, business["id"], "payment.record", {
        "amount": "10.00", "currency_code": "EGP", "idempotency_key": str(uuid4()),
        "customer_id": business["customer_id"], "allocations": [],
    })
    assert response.status_code == 403


def test_cross_tenant_proposal_is_not_found(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "customer.create", {"name": "Tenant customer"})
    proposal_id = created.json()["id"]
    other = client.post("/api/v1/businesses", json={"name": "Other Shop", "currency_code": "EGP"})
    other_id = other.json()["id"]
    response = client.get(f"/api/v1/businesses/{other_id}/assistant/proposals/{proposal_id}")
    assert response.status_code == 404


# --- allowed execution ------------------------------------------------------

def test_staff_executes_allowed_proposal_and_audits(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, STAFF_A)
    created = _create(client, business["id"], "customer.create", {"name": "Staff customer"})
    assert created.status_code == 201
    proposal_id = created.json()["id"]
    response = client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "executed"
    assert body["result"]["target_type"] == "customer"
    with app.state.session_factory() as session:
        saved = session.get(Customer, UUID(body["result"]["target_id"]))
        assert saved is not None and saved.name == "Staff customer"
    events = _audit_events(business["uuid"], "assistant.action_executed")
    assert len(events) == 1
    assert STAFF_A in events[0].change_summary
    assert "حسو" in events[0].change_summary
    assert events[0].actor_subject == STAFF_A


def test_execute_by_unrelated_owner_is_forbidden(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "customer.create", {"name": "Third party"})
    proposal_id = created.json()["id"]
    _as(client, subject, OWNER_B)
    response = client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute")
    assert response.status_code == 403


def test_execute_twice_is_a_conflict(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "customer.create", {"name": "Once only"})
    proposal_id = created.json()["id"]
    assert client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute").status_code == 200
    assert client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute").status_code == 409


def test_execution_claim_is_atomic_and_released(execution_client, business) -> None:
    """The execute claim: only one claimer moves a proposal to
    ``executing``; a second claim conflicts, and releasing the claim
    returns the proposal to its pre-execution status (the path a
    failed dispatch takes, so the approval is not burned)."""
    from app import assistant_execution as execution

    with app.state.session_factory() as session:
        proposal = AssistantProposal(
            id=uuid4(), business_id=business["uuid"],
            requester_subject=OWNER_A, action="customer.create",
            payload={"name": "Claimed"}, payload_hash="0" * 64,
            status="approved", approver_subject=OWNER_B,
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )
        session.add(proposal)
        session.commit()
        previous = execution._claim_execution(session, proposal)
        assert previous == "approved"
        assert proposal.status == "executing"
        with pytest.raises(execution.ProposalConflict):
            execution._claim_execution(session, proposal)
        execution._release_execution(session, proposal, previous)
        assert proposal.status == "approved"


def test_cancel_withdraws_and_blocks_execution(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "customer.create", {"name": "Cancelled"})
    proposal_id = created.json()["id"]
    cancelled = client.post(f"{_proposals(client, business['id'])}/{proposal_id}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "rejected"
    assert client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute").status_code == 409


# --- second approval --------------------------------------------------------

def _payment_payload(business) -> dict:
    return {
        "amount": "100.00", "currency_code": "EGP",
        "idempotency_key": str(uuid4()),
        "customer_id": business["customer_id"],
        "allocations": [{"invoice_id": business["issued_invoice_id"], "amount": "100.00"}],
    }


def test_sensitive_action_needs_approval_before_execute(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "payment.record", _payment_payload(business))
    assert created.status_code == 201
    assert created.json()["requires_second_approval"] is True
    proposal_id = created.json()["id"]
    assert client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute").status_code == 409


def test_approve_then_execute_by_approver(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "payment.record", _payment_payload(business))
    proposal_id = created.json()["id"]
    payload_hash = created.json()["payload_hash"]
    _as(client, subject, OWNER_B)
    approved = client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": payload_hash},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    executed = client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute")
    assert executed.status_code == 200
    assert executed.json()["status"] == "executed"
    assert executed.json()["result"]["target_type"] == "payment"
    events = _audit_events(business["uuid"], "assistant.action_executed")
    assert len(events) == 1
    assert OWNER_A in events[0].change_summary  # requester
    assert OWNER_B in events[0].change_summary  # approver


def test_self_approval_is_rejected(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "payment.record", _payment_payload(business))
    proposal_id = created.json()["id"]
    response = client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": created.json()["payload_hash"]},
    )
    assert response.status_code == 409


def test_approve_with_wrong_hash_is_rejected(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "payment.record", _payment_payload(business))
    proposal_id = created.json()["id"]
    _as(client, subject, OWNER_B)
    response = client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": "0" * 64},
    )
    assert response.status_code == 409


def test_staff_cannot_approve(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "payment.record", _payment_payload(business))
    proposal_id = created.json()["id"]
    _as(client, subject, STAFF_A)
    response = client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": created.json()["payload_hash"]},
    )
    assert response.status_code == 403


def _expense_payload() -> dict:
    return {
        "category": "supplies", "description": "Approved staff expense",
        "amount": "25.00", "currency_code": "EGP",
        "incurred_at": "2026-11-25T10:00:00+00:00",
    }


def test_staff_executes_approved_expense_in_own_role(execution_client, business) -> None:
    """A staff requester may execute after the owner approves, in the
    staff role — that is what makes OWNER-gated approvals executable
    for staff-initiated money actions at all."""
    client, subject = execution_client
    _as(client, subject, STAFF_A)
    created = _create(client, business["id"], "expense.create", _expense_payload())
    assert created.status_code == 201
    proposal_id = created.json()["id"]
    assert created.json()["requires_second_approval"] is True
    _as(client, subject, OWNER_B)
    approved = client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": created.json()["payload_hash"]},
    )
    assert approved.status_code == 200
    _as(client, subject, STAFF_A)
    executed = client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute")
    assert executed.status_code == 200
    assert executed.json()["status"] == "executed"
    assert executed.json()["result"]["target_type"] == "expense"


def test_failed_dispatch_does_not_burn_approval(execution_client, business) -> None:
    """An approved proposal whose dispatch fails stays approved, so the
    caller can fix the data and retry inside the window. The issued
    invoice edit fails closed at dispatch (draft-only route); the
    approval is not consumed by that failure."""
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    payload = _draft_update_payload(business)
    payload["invoice_id"] = business["issued_invoice_id"]
    created = _create(client, business["id"], "invoice.update", payload)
    proposal_id = created.json()["id"]
    _as(client, subject, OWNER_B)
    assert client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": created.json()["payload_hash"]},
    ).status_code == 200
    assert client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute").status_code == 422
    current = client.get(f"{_proposals(client, business['id'])}/{proposal_id}")
    assert current.json()["status"] == "approved"


# --- draft vs issued invoice -----------------------------------------------

def _draft_update_payload(business) -> dict:
    return {
        "invoice_id": business["draft_invoice_id"],
        "update": {
            "invoice_number": "DFT-1-EDITED", "currency_code": "EGP",
            "lines": [{"description": "Edited line", "quantity": 1, "unit_price": "50.00"}],
            "customer_id": business["customer_id"],
            "discount_rate": "0", "tax_rate": "0", "notes": None,
        },
    }


def test_draft_invoice_edit_executes_without_second_approval(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, STAFF_A)
    created = _create(client, business["id"], "invoice.update", _draft_update_payload(business))
    assert created.status_code == 201
    body = created.json()
    assert body["effective_action"] == "invoice.update_draft"
    assert body["requires_second_approval"] is False
    executed = client.post(f"{_proposals(client, business['id'])}/{body['id']}/execute")
    assert executed.status_code == 200
    assert executed.json()["status"] == "executed"
    with app.state.session_factory() as session:
        saved = session.get(Invoice, UUID(business["draft_invoice_id"]))
        assert saved.invoice_number == "DFT-1-EDITED"


def test_issued_invoice_edit_needs_approval_and_fails_closed_at_dispatch(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    payload = _draft_update_payload(business)
    payload["invoice_id"] = business["issued_invoice_id"]
    created = _create(client, business["id"], "invoice.update", payload)
    assert created.status_code == 201
    body = created.json()
    assert body["effective_action"] == "invoice.update"
    assert body["requires_second_approval"] is True
    assert body["execution_note"]
    proposal_id = body["id"]
    _as(client, subject, OWNER_B)
    approved = client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": body["payload_hash"]},
    )
    assert approved.status_code == 200
    failed = client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute")
    assert failed.status_code == 422
    # Still approved: the failure is the invoice API's draft-only rule,
    # not a consumed approval.
    current = client.get(f"{_proposals(client, business['id'])}/{proposal_id}")
    assert current.json()["status"] == "approved"


# --- opt-out ----------------------------------------------------------------

def _opt_outs(client, business_id: str) -> str:
    return f"/api/v1/businesses/{business_id}/assistant/confirmation-opt-outs"


def test_opt_out_waives_second_approval_for_owner_own_request(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = client.post(_opt_outs(client, business["id"]), json={"action": "payment.record"})
    assert created.status_code == 201
    assert created.json()["action"] == "payment.record"
    proposal = _create(client, business["id"], "payment.record", _payment_payload(business))
    assert proposal.status_code == 201
    executed = client.post(f"{_proposals(client, business['id'])}/{proposal.json()['id']}/execute")
    assert executed.status_code == 200
    events = _audit_events(business["uuid"], "assistant.action_executed")
    assert "opt-out waived by owner" in events[0].change_summary
    opt_events = _audit_events(business["uuid"], "assistant.opt_out_created")
    assert len(opt_events) == 1


def test_opt_out_does_not_waive_staff_requests(execution_client, business) -> None:
    """The opt-out is the owner's own waiver: a staff member's money
    action still needs a live owner approval, even when the owner
    opted out of the question for their own requests."""
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    assert client.post(_opt_outs(client, business["id"]), json={"action": "expense.create"}).status_code == 201
    _as(client, subject, STAFF_A)
    created = _create(client, business["id"], "expense.create", _expense_payload())
    assert created.status_code == 201
    response = client.post(f"{_proposals(client, business['id'])}/{created.json()['id']}/execute")
    assert response.status_code == 409
    # A live owner approval still works for the staff request.
    _as(client, subject, OWNER_B)
    assert client.post(
        f"{_proposals(client, business['id'])}/{created.json()['id']}/approve",
        json={"payload_hash": created.json()["payload_hash"]},
    ).status_code == 200
    _as(client, subject, STAFF_A)
    assert client.post(f"{_proposals(client, business['id'])}/{created.json()['id']}/execute").status_code == 200


def test_opt_out_revoke_restores_the_question(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    assert client.post(_opt_outs(client, business["id"]), json={"action": "payment.record"}).status_code == 201
    listed = client.get(_opt_outs(client, business["id"]))
    assert [row["action"] for row in listed.json()] == ["payment.record"]
    deleted = client.delete(f"{_opt_outs(client, business['id'])}/payment.record")
    assert deleted.status_code == 204
    assert client.get(_opt_outs(client, business["id"])).json() == []
    proposal = _create(client, business["id"], "payment.record", _payment_payload(business))
    assert client.post(f"{_proposals(client, business['id'])}/{proposal.json()['id']}/execute").status_code == 409


def test_opt_out_rejects_allowed_and_forbidden_actions(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    assert client.post(_opt_outs(client, business["id"]), json={"action": "customer.create"}).status_code == 422
    assert client.post(_opt_outs(client, business["id"]), json={"action": "customer.delete"}).status_code == 422


def test_opt_out_requires_owner(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, STAFF_A)
    assert client.post(_opt_outs(client, business["id"]), json={"action": "payment.record"}).status_code == 403


# --- expiry -----------------------------------------------------------------

def _expire_proposal(business_uuid: UUID, proposal_id: str) -> None:
    with app.state.session_factory() as session:
        proposal = session.get(AssistantProposal, UUID(proposal_id))
        assert proposal is not None
        proposal.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()


def test_expired_proposal_reports_expired_and_cannot_approve_or_execute(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "customer.create", {"name": "Late customer"})
    proposal_id = created.json()["id"]
    _expire_proposal(business["uuid"], proposal_id)
    fetched = client.get(f"{_proposals(client, business['id'])}/{proposal_id}")
    assert fetched.json()["status"] == "expired"
    _as(client, subject, OWNER_B)
    assert client.post(
        f"{_proposals(client, business['id'])}/{proposal_id}/approve",
        json={"payload_hash": created.json()["payload_hash"]},
    ).status_code == 410
    _as(client, subject, OWNER_A)
    assert client.post(f"{_proposals(client, business['id'])}/{proposal_id}/execute").status_code == 410


def test_expiry_does_not_mutate_the_stored_row(execution_client, business) -> None:
    """Derived expiry: reading an expired proposal leaves its stored
    status untouched, so denial probes never write."""
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    created = _create(client, business["id"], "customer.create", {"name": "Probe customer"})
    proposal_id = created.json()["id"]
    _expire_proposal(business["uuid"], proposal_id)
    assert client.get(f"{_proposals(client, business['id'])}/{proposal_id}").json()["status"] == "expired"
    with app.state.session_factory() as session:
        stored = session.get(AssistantProposal, UUID(proposal_id))
        assert stored.status == "proposed"


# --- chat unchanged ----------------------------------------------------------

def test_chat_endpoint_still_refuses_action_requests(execution_client, business) -> None:
    client, subject = execution_client
    _as(client, subject, OWNER_A)
    response = client.post(
        f"/api/v1/businesses/{business['id']}/assistant/chat",
        json={"message": "void invoice ISS-1"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer"].startswith("I can't take actions")
    assert body["sources"] == []
    with app.state.session_factory() as session:
        saved = session.get(Invoice, UUID(business["issued_invoice_id"]))
        assert saved.status == "issued"


if __name__ == "__main__":
    import pytest as _pytest

    _pytest.main([__file__])
