"""WhatsApp channel foundation (W-foundation, WHATSAPP-CHANNEL-DESIGN §7/§9 W1).

Covers: the provider transport (Fake parsing/signature/factory
fail-closed), the linking lifecycle (code create -> complete via
webhook -> list masked -> revoke), the §3.2 conflict rules, and the
webhook discipline: signature fail-closed, no-secret 503, wamid
dedupe, kill switch default OFF, unlinked number gets exactly one
intro then silence, linked number runs the EXISTING chat pipeline
with the linked user's identity (stubbed here — the pipeline itself
is covered by its own suites), non-text gets the polite text-only
reply. Uses the same in-memory SQLite + TestClient harness as the
assistant persistence tests.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import assistant_api, whatsapp_api
from app.main import app
from app.models import (
    AssistantConversation,
    AssistantMessage,
    Base,
    BusinessMembership,
    BusinessSetting,
    MembershipRole,
    WhatsAppLink,
    WhatsAppLinkCode,
    WhatsAppMessage,
)
from app.security import AuthenticatedPrincipal
from app.whatsapp_transport import (
    FakeWhatsAppProvider,
    WhatsAppProviderUnavailable,
    create_provider,
)

OWNER = "wa-owner"
STAFF = "wa-staff"
OUTSIDER = "wa-outsider"
SECRET = "test-webhook-secret"
PHONE_NUMBER_ID = "PNID-TEST-1"
OWNER_WA = "201010000001"
STAFF_WA = "201010000002"
STRANGER_WA = "201099999999"


@pytest.fixture()
def wa(monkeypatch):
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
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    fake = FakeWhatsAppProvider(secret=SECRET)
    monkeypatch.setattr(whatsapp_api, "create_provider", lambda: fake)
    client = TestClient(app)
    try:
        yield client, subject, fake
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
def business(wa):
    client, subject, _fake = wa
    subject["value"] = OWNER
    response = client.post("/api/v1/businesses", json={"name": "WhatsApp Test Shop", "currency_code": "EGP"})
    assert response.status_code == 201, response.text
    business_id = response.json()["id"]
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF,
        ))
        session.commit()
    return business_id


def configure_channel(business_id: str, *, enabled: bool = True) -> None:
    with app.state.session_factory() as session:
        session.add(BusinessSetting(
            business_id=UUID(business_id),
            setting_key="whatsapp.channel.phone_number_id",
            setting_value=PHONE_NUMBER_ID,
        ))
        if enabled:
            session.add(BusinessSetting(
                business_id=UUID(business_id),
                setting_key="whatsapp.channel.enabled",
                setting_value="true",
            ))
        session.commit()


def text_message(wa_id: str, wamid: str, body: str) -> dict:
    return {
        "from": wa_id, "id": wamid, "timestamp": "1764000000",
        "type": "text", "text": {"body": body},
    }


def audio_message(wa_id: str, wamid: str) -> dict:
    return {
        "from": wa_id, "id": wamid, "timestamp": "1764000000",
        "type": "audio", "audio": {"id": "media-1"},
    }


def webhook_payload(messages: list[dict]) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "WABA-TEST",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "metadata": {
                        "display_phone_number": "201000000000",
                        "phone_number_id": PHONE_NUMBER_ID,
                    },
                    "messages": messages,
                },
            }],
        }],
    }


def post_webhook(client, payload: dict, *, secret: str = SECRET, sign: bool = True):
    raw = json.dumps(payload).encode("utf-8")
    headers = {"content-type": "application/json"}
    if sign:
        digest = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        headers["x-hub-signature-256"] = f"sha256={digest}"
    return client.post("/api/v1/assistant/whatsapp/webhook", content=raw, headers=headers)


def create_code(client, subject: dict, business_id: str, *, as_user: str) -> str:
    subject["value"] = as_user
    response = client.post(f"/api/v1/businesses/{business_id}/assistant/whatsapp/link-codes")
    assert response.status_code == 201, response.text
    return response.json()["code"]


def link_via_code(wa, business_id: str, *, as_user: str, wa_id: str, wamid: str) -> None:
    """Drive the full in-app code -> WhatsApp code-message flow."""
    client, subject, fake = wa
    code = create_code(client, subject, business_id, as_user=as_user)
    response = post_webhook(client, webhook_payload([text_message(wa_id, wamid, code)]))
    assert response.status_code == 200, response.text
    assert any(entry["body"].startswith("اتربطت") for entry in fake.outbox), fake.outbox


def ledger_rows(business_id: str) -> list[WhatsAppMessage]:
    with app.state.session_factory() as session:
        return list(session.scalars(
            select(WhatsAppMessage)
            .where(WhatsAppMessage.business_id == UUID(business_id))
            .order_by(WhatsAppMessage.created_at.asc(), WhatsAppMessage.id.asc())
        ).all())


# ---------------------------------------------------------------------------
# Transport.
# ---------------------------------------------------------------------------


def test_fake_provider_parses_meta_payload_and_verifies_signatures():
    fake = FakeWhatsAppProvider(secret=SECRET)
    messages = fake.parse_webhook(webhook_payload([
        text_message(OWNER_WA, "wamid.1", "أهلًا"),
        audio_message(OWNER_WA, "wamid.2"),
    ]))
    assert len(messages) == 2
    assert messages[0].kind == "text" and messages[0].text == "أهلًا"
    assert messages[0].wa_id == OWNER_WA and messages[0].phone_e164 == f"+{OWNER_WA}"
    assert messages[0].recipient_phone_number_id == PHONE_NUMBER_ID
    assert messages[1].kind == "audio" and messages[1].text is None

    raw = b'{"entry":[]}'
    digest = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    assert fake.verify_signature(headers={"X-Hub-Signature-256": f"sha256={digest}"}, raw_body=raw)
    assert not fake.verify_signature(headers={"X-Hub-Signature-256": "sha256=deadbeef"}, raw_body=raw)
    assert not fake.verify_signature(headers={}, raw_body=raw)
    # No secret configured: verification fails closed.
    assert not FakeWhatsAppProvider(secret=None).verify_signature(
        headers={"X-Hub-Signature-256": f"sha256={digest}"}, raw_body=raw
    )

    message_id = fake.send_text(to_wa_id=OWNER_WA, body="hello")
    assert message_id.startswith("wamid.fake.")
    assert fake.outbox[-1]["body"] == "hello"


def test_provider_factory_fails_closed_for_unimplemented_providers(monkeypatch):
    monkeypatch.delenv("WHATSAPP_PROVIDER", raising=False)
    assert isinstance(create_provider(secret="x"), FakeWhatsAppProvider)
    with pytest.raises(WhatsAppProviderUnavailable):
        create_provider("meta-cloud-api", secret="x")
    with pytest.raises(WhatsAppProviderUnavailable):
        create_provider("some-bsp", secret="x")


# ---------------------------------------------------------------------------
# Linking lifecycle (app surface + code completion).
# ---------------------------------------------------------------------------


def test_link_code_create_complete_list_revoke(wa, business):
    client, subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.link.1")

    subject["value"] = OWNER
    response = client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/links")
    assert response.status_code == 200, response.text
    links = response.json()
    assert len(links) == 1
    assert links[0]["status"] == "linked"
    assert links[0]["user_subject"] == OWNER
    # The full number never leaves the API — masked only.
    assert OWNER_WA not in json.dumps(links)
    assert links[0]["phone_masked"].endswith(OWNER_WA[-2:])

    revoke = client.delete(f"/api/v1/businesses/{business}/assistant/whatsapp/links/{links[0]['id']}")
    assert revoke.status_code == 204, revoke.text
    after = client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/links").json()
    assert after[0]["status"] == "revoked"
    assert after[0]["revoked_at"] is not None


def test_link_endpoints_require_membership(wa, business):
    client, subject, _fake = wa
    subject["value"] = OUTSIDER
    assert client.post(f"/api/v1/businesses/{business}/assistant/whatsapp/link-codes").status_code == 403
    assert client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/links").status_code == 403
    assert client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/status").status_code == 403


def test_channel_status_defaults_off_and_reflects_the_kill_switch(wa, business):
    # Owner rule 2026-11-26: the settings surface reads this flag to
    # render the designed dormant state while the channel is off.
    client, subject, _fake = wa
    subject["value"] = OWNER
    response = client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/status")
    assert response.status_code == 200, response.text
    assert response.json() == {"channel_enabled": False}
    configure_channel(business)
    response = client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/status")
    assert response.status_code == 200, response.text
    assert response.json() == {"channel_enabled": True}


def test_expired_code_does_not_link(wa, business):
    client, subject, fake = wa
    configure_channel(business)
    code = create_code(client, subject, business, as_user=OWNER)
    with app.state.session_factory() as session:
        row = session.scalars(select(WhatsAppLinkCode)).one()
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()
    response = post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.exp.1", code)]))
    assert response.status_code == 200, response.text
    # No link, no welcome — the sender is just an unlinked number (intro).
    with app.state.session_factory() as session:
        assert session.scalars(select(WhatsAppLink)).first() is None
    assert not any(entry["body"].startswith("اتربطت") for entry in fake.outbox)
    assert any(entry["body"].startswith("أنا حسو") for entry in fake.outbox)


def test_used_code_cannot_link_a_second_number(wa, business):
    client, subject, fake = wa
    configure_channel(business)
    code = create_code(client, subject, business, as_user=OWNER)
    first = post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.use.1", code)]))
    assert first.status_code == 200
    fake.outbox.clear()
    second = post_webhook(client, webhook_payload([text_message(STAFF_WA, "wamid.use.2", code)]))
    assert second.status_code == 200
    with app.state.session_factory() as session:
        links = list(session.scalars(select(WhatsAppLink)).all())
    assert len(links) == 1 and links[0].wa_id == OWNER_WA
    assert not any(entry["body"].startswith("اتربطت") for entry in fake.outbox)


def test_new_code_supersedes_the_previous_one(wa, business):
    client, subject, fake = wa
    configure_channel(business)
    first_code = create_code(client, subject, business, as_user=OWNER)
    second_code = create_code(client, subject, business, as_user=OWNER)
    assert first_code != second_code
    post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.sup.1", first_code)]))
    with app.state.session_factory() as session:
        assert session.scalars(select(WhatsAppLink)).first() is None
    post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.sup.2", second_code)]))
    with app.state.session_factory() as session:
        assert session.scalars(select(WhatsAppLink)).one().wa_id == OWNER_WA


def test_number_taken_conflict_keeps_code_alive(wa, business):
    client, subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.taken.1")
    # Staff's code sent from the OWNER's already-linked number: refused,
    # and the code is NOT consumed — staff can still use it from their
    # own number.
    staff_code = create_code(client, subject, business, as_user=STAFF)
    fake.outbox.clear()
    post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.taken.2", staff_code)]))
    assert any("مربوط بحساب تاني" in entry["body"] for entry in fake.outbox)
    with app.state.session_factory() as session:
        links = list(session.scalars(select(WhatsAppLink)).all())
    assert len(links) == 1 and links[0].user_subject == OWNER
    post_webhook(client, webhook_payload([text_message(STAFF_WA, "wamid.taken.3", staff_code)]))
    with app.state.session_factory() as session:
        links = list(session.scalars(select(WhatsAppLink)).all())
    assert len(links) == 2


def test_user_with_active_number_cannot_link_a_second_one(wa, business):
    client, subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.other.1")
    code = create_code(client, subject, business, as_user=OWNER)
    fake.outbox.clear()
    post_webhook(client, webhook_payload([text_message(STAFF_WA, "wamid.other.2", code)]))
    assert any("مربوط برقم تاني" in entry["body"] for entry in fake.outbox)
    with app.state.session_factory() as session:
        links = list(session.scalars(select(WhatsAppLink)).all())
    assert len(links) == 1 and links[0].wa_id == OWNER_WA


def test_revoke_permissions_owner_any_staff_own_only(wa, business):
    client, subject, _fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.perm.1")
    link_via_code(wa, business, as_user=STAFF, wa_id=STAFF_WA, wamid="wamid.perm.2")
    with app.state.session_factory() as session:
        links = {row.user_subject: row for row in session.scalars(select(WhatsAppLink)).all()}
    # Staff cannot revoke the owner's link.
    subject["value"] = STAFF
    denied = client.delete(
        f"/api/v1/businesses/{business}/assistant/whatsapp/links/{links[OWNER].id}"
    )
    assert denied.status_code == 403, denied.text
    # The owner can revoke the staff member's link.
    subject["value"] = OWNER
    allowed = client.delete(
        f"/api/v1/businesses/{business}/assistant/whatsapp/links/{links[STAFF].id}"
    )
    assert allowed.status_code == 204, allowed.text
    # Unknown id in the business: 404.
    missing = client.delete(
        f"/api/v1/businesses/{business}/assistant/whatsapp/links/00000000-0000-0000-0000-000000000000"
    )
    assert missing.status_code == 404, missing.text


# ---------------------------------------------------------------------------
# Webhook discipline.
# ---------------------------------------------------------------------------


def test_webhook_rejects_bad_signature_and_records_nothing(wa, business):
    client, _subject, _fake = wa
    configure_channel(business)
    response = post_webhook(
        client, webhook_payload([text_message(STRANGER_WA, "wamid.sig.1", "hello")]),
        secret="the-wrong-secret",
    )
    assert response.status_code == 403, response.text
    assert ledger_rows(business) == []


def test_webhook_without_secret_is_503(wa, business, monkeypatch):
    client, _subject, _fake = wa
    configure_channel(business)
    monkeypatch.setattr(
        whatsapp_api, "create_provider", lambda: FakeWhatsAppProvider(secret=None)
    )
    response = post_webhook(client, webhook_payload([text_message(STRANGER_WA, "wamid.ns.1", "hi")]))
    assert response.status_code == 503, response.text
    assert ledger_rows(business) == []


def test_webhook_with_unimplemented_provider_is_503(wa, business, monkeypatch):
    client, _subject, _fake = wa
    configure_channel(business)

    def unavailable():
        raise WhatsAppProviderUnavailable("not implemented")

    monkeypatch.setattr(whatsapp_api, "create_provider", unavailable)
    response = post_webhook(client, webhook_payload([text_message(STRANGER_WA, "wamid.up.1", "hi")]))
    assert response.status_code == 503, response.text


def test_channel_disabled_ignores_inbound_completely(wa, business):
    client, subject, fake = wa
    # Number mapping exists, but the kill switch was never turned on
    # (default OFF) — not even a link code is processed.
    configure_channel(business, enabled=False)
    code = create_code(client, subject, business, as_user=OWNER)
    response = post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.off.1", code)]))
    assert response.status_code == 200, response.text
    assert response.json()["ignored"] == 1
    assert fake.outbox == []
    assert ledger_rows(business) == []
    with app.state.session_factory() as session:
        assert session.scalars(select(WhatsAppLink)).first() is None


def test_unlinked_number_gets_exactly_one_intro(wa, business):
    client, _subject, fake = wa
    configure_channel(business)
    post_webhook(client, webhook_payload([text_message(STRANGER_WA, "wamid.intro.1", "سلام")]))
    post_webhook(client, webhook_payload([text_message(STRANGER_WA, "wamid.intro.2", "حد هنا؟")]))
    intros = [entry for entry in fake.outbox if entry["body"].startswith("أنا حسو")]
    assert len(intros) == 1
    assert intros[0]["to"] == STRANGER_WA


def test_duplicate_wamid_is_processed_once(wa, business, monkeypatch):
    client, _subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.dup.0")
    calls = []

    async def stub_pipeline(business_id, body, session, principal):
        calls.append((str(business_id), principal.subject, body.message))
        return {"answer": "stub answer", "sources": [], "model": "stub",
                "mode": "local-fallback", "suggestions": []}

    monkeypatch.setattr(assistant_api, "_answer_chat", stub_pipeline)
    payload = webhook_payload([text_message(OWNER_WA, "wamid.dup.1", "المبيعات؟")])
    first = post_webhook(client, payload)
    second = post_webhook(client, payload)
    assert first.json()["processed"] == 1
    assert second.json()["duplicate"] == 1
    assert len(calls) == 1


# ---------------------------------------------------------------------------
# Linked traffic through the existing pipeline.
# ---------------------------------------------------------------------------


def _stub_pipeline(monkeypatch, calls: list, answer: str = "stub answer"):
    async def stub_pipeline(business_id, body, session, principal):
        calls.append((str(business_id), principal.subject, body.message))
        return {"answer": answer, "sources": [], "model": "stub",
                "mode": "local-fallback", "suggestions": []}

    monkeypatch.setattr(assistant_api, "_answer_chat", stub_pipeline)


def test_linked_message_runs_pipeline_with_linked_identity_and_persists(wa, business, monkeypatch):
    client, _subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=STAFF, wa_id=STAFF_WA, wamid="wamid.pipe.0")
    calls: list = []
    _stub_pipeline(monkeypatch, calls)
    fake.outbox.clear()

    post_webhook(client, webhook_payload([text_message(STAFF_WA, "wamid.pipe.1", "المبيعات؟")]))
    # The pipeline ran as the LINKED user (staff), not as any caller.
    assert calls == [(business, STAFF, "المبيعات؟")]
    assert fake.outbox[-1]["body"] == "stub answer"
    assert fake.outbox[-1]["to"] == STAFF_WA

    with app.state.session_factory() as session:
        conversations = list(session.scalars(select(AssistantConversation)).all())
        messages = list(session.scalars(select(AssistantMessage)).all())
    assert len(conversations) == 1
    assert conversations[0].user_subject == STAFF
    assert [m.role for m in messages] == ["user", "assistant"]
    outbound = [row for row in ledger_rows(business) if row.direction == "out"][-1]
    assert outbound.conversation_id == conversations[0].id

    # A second message continues the SAME conversation (Slice 4 history).
    post_webhook(client, webhook_payload([text_message(STAFF_WA, "wamid.pipe.2", "والمصروفات؟")]))
    with app.state.session_factory() as session:
        assert len(list(session.scalars(select(AssistantConversation)).all())) == 1
        assert len(list(session.scalars(select(AssistantMessage)).all())) == 4


def test_non_text_from_linked_number_gets_text_only_reply(wa, business, monkeypatch):
    client, _subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.audio.0")
    calls: list = []
    _stub_pipeline(monkeypatch, calls)
    fake.outbox.clear()
    post_webhook(client, webhook_payload([audio_message(OWNER_WA, "wamid.audio.1")]))
    assert calls == []
    assert len(fake.outbox) == 1
    assert "النصوص المكتوبة" in fake.outbox[0]["body"]


def test_revoked_number_is_treated_as_unlinked(wa, business, monkeypatch):
    client, subject, fake = wa
    configure_channel(business)
    link_via_code(wa, business, as_user=OWNER, wa_id=OWNER_WA, wamid="wamid.rev.0")
    subject["value"] = OWNER
    links = client.get(f"/api/v1/businesses/{business}/assistant/whatsapp/links").json()
    assert client.delete(
        f"/api/v1/businesses/{business}/assistant/whatsapp/links/{links[0]['id']}"
    ).status_code == 204
    calls: list = []
    _stub_pipeline(monkeypatch, calls)
    fake.outbox.clear()
    post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.rev.1", "المبيعات؟")]))
    assert calls == []
    # First contact as an unlinked number: the one polite intro.
    assert len(fake.outbox) == 1
    assert fake.outbox[0]["body"].startswith("أنا حسو")
