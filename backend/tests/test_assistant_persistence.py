"""Assistant conversation persistence (Slice 4).

Covers: conversation create/list/resume, chat-endpoint persistence
of each turn (conversation created on the first turn, returned id
reused after), message append, proposal state re-read on resume
(a proposal whose 5 minutes elapsed reads ``expired``), tenant
isolation, and the settings list the assistant tab reads.
Uses the same in-memory SQLite + TestClient harness as the
assistant execution tests.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AssistantProposal,
    Base,
    BusinessMembership,
    Customer,
    MembershipRole,
)
from app.security import AuthenticatedPrincipal

OWNER_A = "persist-owner-a"
OWNER_B = "persist-owner-b"
STAFF_A = "persist-staff-a"


@pytest.fixture()
def persistence_client(monkeypatch):
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
def business(persistence_client):
    client, subject = persistence_client
    subject["value"] = OWNER_A
    response = client.post("/api/v1/businesses", json={"name": "Persistence Test Shop", "currency_code": "EGP"})
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
        session.add(Customer(business_id=business_uuid, name="Persistence customer"))
        session.commit()
    return {"id": business_id, "uuid": business_uuid}


def _base(client, business):
    return f"/api/v1/businesses/{business['id']}/assistant"


def test_create_and_list_conversations(persistence_client, business):
    client, subject = persistence_client
    subject["value"] = OWNER_A
    base = _base(client, business)
    created = client.post(f"{base}/conversations", json={"title": "First thread"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["title"] == "First thread"
    assert body["message_count"] == 0
    assert body["user_subject"] == OWNER_A
    second = client.post(f"{base}/conversations", json={})
    assert second.status_code == 201
    assert second.json()["title"] is None
    listed = client.get(f"{base}/conversations")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 2
    # Most recently created first.
    assert rows[0]["id"] == second.json()["id"]
    assert rows[1]["id"] == body["id"]
    assert all(row["message_count"] == 0 for row in rows)


def test_chat_persists_turns_and_resume_restores_them(persistence_client, business):
    client, subject = persistence_client
    subject["value"] = OWNER_A
    base = _base(client, business)
    first = client.post(f"{base}/chat", json={"message": "كم عدد العملاء؟"})
    assert first.status_code == 200, first.text
    reply = first.json()
    assert reply["conversation_id"], "the first turn must return its conversation id"
    conversation_id = reply["conversation_id"]
    second = client.post(
        f"{base}/chat",
        json={"message": "كم عدد المنتجات؟", "conversation_id": conversation_id},
    )
    assert second.status_code == 200, second.text
    assert second.json()["conversation_id"] == conversation_id
    detail = client.get(f"{base}/conversations/{conversation_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["id"] == conversation_id
    assert body["message_count"] == 4
    messages = body["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]
    assert messages[0]["content"] == "كم عدد العملاء؟"
    assert messages[2]["content"] == "كم عدد المنتجات؟"
    assert all(m["proposal"] is None for m in messages)
    # The history list now shows the thread with its count.
    listed = client.get(f"{base}/conversations")
    assert listed.json()[0]["id"] == conversation_id
    assert listed.json()[0]["message_count"] == 4


def test_append_message_and_unknown_ids(persistence_client, business):
    client, subject = persistence_client
    subject["value"] = STAFF_A
    base = _base(client, business)
    created = client.post(f"{base}/conversations", json={"title": "Staff thread"})
    conversation_id = created.json()["id"]
    appended = client.post(
        f"{base}/conversations/{conversation_id}/messages",
        json={"role": "user", "content": "hello from staff"},
    )
    assert appended.status_code == 201, appended.text
    assert appended.json()["role"] == "user"
    assert appended.json()["content"] == "hello from staff"
    assert appended.json()["proposal"] is None
    bad_role = client.post(
        f"{base}/conversations/{conversation_id}/messages",
        json={"role": "system", "content": "x"},
    )
    assert bad_role.status_code == 422
    unknown_proposal = client.post(
        f"{base}/conversations/{conversation_id}/messages",
        json={"role": "user", "content": "x", "proposal_id": str(uuid4())},
    )
    assert unknown_proposal.status_code == 422
    missing = client.get(f"{base}/conversations/{uuid4()}")
    assert missing.status_code == 404
    missing_append = client.post(
        f"{base}/conversations/{uuid4()}/messages",
        json={"role": "user", "content": "x"},
    )
    assert missing_append.status_code == 404


def test_resumed_proposal_reads_current_state_expired(persistence_client, business):
    client, subject = persistence_client
    subject["value"] = OWNER_A
    base = _base(client, business)
    proposal = client.post(f"{base}/proposals", json={
        "action": "expense.create",
        "payload": {
            "category": "ops", "description": "resume probe",
            "amount": "1.00", "currency_code": "EGP",
            "incurred_at": "2026-01-01T00:00:00Z",
        },
    })
    assert proposal.status_code == 201, proposal.text
    proposal_id = proposal.json()["id"]
    created = client.post(f"{base}/conversations", json={"title": "Proposal thread"})
    conversation_id = created.json()["id"]
    appended = client.post(
        f"{base}/conversations/{conversation_id}/messages",
        json={"role": "assistant", "content": "prepared a proposal",
              "proposal_id": proposal_id},
    )
    assert appended.status_code == 201
    assert appended.json()["proposal"]["status"] == "proposed"
    # Move the deadline into the past directly on the row: the resume
    # path must derive ``expired`` on read, never trust the stored
    # ``proposed`` status.
    with app.state.session_factory() as session:
        row = session.get(AssistantProposal, UUID(proposal_id))
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()
    detail = client.get(f"{base}/conversations/{conversation_id}")
    assert detail.status_code == 200
    message = detail.json()["messages"][0]
    assert message["proposal"]["id"] == proposal_id
    assert message["proposal"]["status"] == "expired"


def test_conversations_are_tenant_scoped(persistence_client, business):
    client, subject = persistence_client
    subject["value"] = OWNER_A
    base = _base(client, business)
    created = client.post(f"{base}/conversations", json={"title": "Private thread"})
    conversation_id = created.json()["id"]
    # A member of the same business (staff) may open it — the owner
    # needs a staff requester's thread to approve its proposal card.
    subject["value"] = STAFF_A
    assert client.get(f"{base}/conversations/{conversation_id}").status_code == 200
    assert client.get(f"{base}/conversations").status_code == 200
    # A subject who is a member of no business here may not — note
    # OWNER_B is a second owner of THIS business (fixture), so the
    # cross-tenant actor must be a fresh outsider, not OWNER_B.
    subject["value"] = "persist-outsider"
    other = client.post("/api/v1/businesses", json={"name": "Other Shop", "currency_code": "EGP"})
    assert other.status_code == 201
    assert client.get(f"{base}/conversations/{conversation_id}").status_code == 403
    assert client.get(f"{base}/conversations").status_code == 403
    # An unknown conversation id in the chat request is a 404, not a
    # silent new thread.
    subject["value"] = OWNER_A
    reply = client.post(
        f"{base}/chat",
        json={"message": "كم عدد العملاء؟", "conversation_id": str(uuid4())},
    )
    assert reply.status_code == 404


def test_settings_list_read_by_any_member(persistence_client, business):
    client, subject = persistence_client
    subject["value"] = OWNER_A
    settings_base = f"/api/v1/businesses/{business['id']}/settings"
    put = client.put(f"{settings_base}/assistant.dialect", json={"setting_value": "formal"})
    assert put.status_code == 200, put.text
    listed = client.get(settings_base)
    assert listed.status_code == 200
    rows = listed.json()
    assert any(
        row["setting_key"] == "assistant.dialect" and row["setting_value"] == "formal"
        for row in rows
    ), rows
    # Staff may read settings (they see the dialect + brief switch in
    # the assistant tab); writes stay owner-only.
    subject["value"] = STAFF_A
    assert client.get(settings_base).status_code == 200
    denied = client.put(f"{settings_base}/assistant.dialect", json={"setting_value": "english"})
    assert denied.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__])
