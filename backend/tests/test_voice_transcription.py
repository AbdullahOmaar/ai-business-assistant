"""Voice foundation (phase ص, docs/VOICE_TRANSCRIPTION.md).

Covers: the STT factory (Fake only, fail-closed for any other
name), the Fake round-trip, the pipeline contract (empty /
low-confidence / provider failure -> the typed fallback outcome,
never a guess), the WhatsApp audio wiring (transcript displayed
with the «فهمت:» prefix BEFORE the answer; a voice command
produces the SAME proposal as the typed text; no provider
configured -> the pre-voice text-only reply, byte-identical), and
the Egyptian test-set accuracy harness — every fixture in
fixtures/voice_ar_eg.json runs through the Fake + the Slice 3
deterministic intent matcher and must yield its expected intent.
That harness is the gate a future real STT provider must pass
(with recorded clips) before the owner is asked to fix it.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import whatsapp_api
from app.assistant_intent import extract_deterministic_intent
from app.main import app
from app.models import (
    AssistantMessage,
    AssistantProposal,
    Base,
    BusinessMembership,
    BusinessSetting,
    Customer,
    Invoice,
    MembershipRole,
    Product,
)
from app.security import AuthenticatedPrincipal
from app.voice_transcription import (
    MIN_CONFIDENCE,
    FakeSTTProvider,
    TranscriptResult,
    VoiceProviderUnavailable,
    configured_stt_provider,
    create_stt_provider,
    transcribe_voice,
)
from app.whatsapp_transport import FakeWhatsAppProvider

OWNER = "voice-owner"
STAFF = "voice-staff"
SECRET = "test-webhook-secret"
PHONE_NUMBER_ID = "PNID-VOICE-1"
OWNER_WA = "201010000001"

FIXTURES_PATH = Path(__file__).parent / "fixtures" / "voice_ar_eg.json"
WRITE_ACTIONS = {
    "customer.create", "supplier.create", "product.create",
    "invoice.create", "payment.record", "expense.create", "stock.movement",
}


# ---------------------------------------------------------------------------
# Factory + Fake + pipeline contract (unit).
# ---------------------------------------------------------------------------


def test_factory_serves_only_the_fake(monkeypatch):
    monkeypatch.delenv("VOICE_STT_PROVIDER", raising=False)
    assert isinstance(create_stt_provider(), FakeSTTProvider)
    assert isinstance(create_stt_provider("fake"), FakeSTTProvider)
    assert isinstance(create_stt_provider(" FAKE "), FakeSTTProvider)


def test_factory_fails_closed_for_unimplemented_providers(monkeypatch):
    monkeypatch.delenv("VOICE_STT_PROVIDER", raising=False)
    for name in ("openai-whisper", "google-stt", "azure-speech"):
        with pytest.raises(VoiceProviderUnavailable):
            create_stt_provider(name)
    monkeypatch.setenv("VOICE_STT_PROVIDER", "openai-whisper")
    with pytest.raises(VoiceProviderUnavailable):
        create_stt_provider()


def test_configured_provider_is_none_unless_explicitly_set(monkeypatch):
    monkeypatch.delenv("VOICE_STT_PROVIDER", raising=False)
    assert configured_stt_provider() is None
    monkeypatch.setenv("VOICE_STT_PROVIDER", "  ")
    assert configured_stt_provider() is None
    monkeypatch.setenv("VOICE_STT_PROVIDER", "fake")
    assert isinstance(configured_stt_provider(), FakeSTTProvider)
    monkeypatch.setenv("VOICE_STT_PROVIDER", "some-real-stt")
    with pytest.raises(VoiceProviderUnavailable):
        configured_stt_provider()


def test_fake_round_trip_and_unknown_audio():
    fake = FakeSTTProvider()
    audio = b"clip-one"
    fake.register(audio, text="سجل مصروف 300 جنيه كهربا", confidence=0.97)
    result = fake.transcribe(audio=audio, mime_type="audio/ogg", language_hint="ar-EG")
    assert result == TranscriptResult(
        text="سجل مصروف 300 جنيه كهربا", confidence=0.97
    )
    unknown = fake.transcribe(
        audio=b"never-registered", mime_type="audio/ogg", language_hint="ar-EG"
    )
    assert unknown.text == "" and unknown.confidence == 0.0


def test_transcribe_voice_accepts_a_clear_transcript():
    fake = FakeSTTProvider()
    fake.register(b"clip", text="ضيف منتج شاحن بسعر 75 جنيه", confidence=0.9)
    outcome = transcribe_voice(provider=fake, audio=b"clip", mime_type="audio/ogg")
    assert outcome.understood is True
    assert outcome.text == "ضيف منتج شاحن بسعر 75 جنيه"
    assert outcome.confidence == 0.9


def test_transcribe_voice_rejects_low_confidence():
    fake = FakeSTTProvider()
    fake.register(b"mumbled", text="سجل مصروف", confidence=MIN_CONFIDENCE - 0.01)
    outcome = transcribe_voice(provider=fake, audio=b"mumbled", mime_type="audio/ogg")
    assert outcome.understood is False
    assert outcome.text is None
    assert outcome.confidence == MIN_CONFIDENCE - 0.01


def test_transcribe_voice_rejects_empty_and_failed_transcriptions():
    fake = FakeSTTProvider()
    # Unknown audio -> empty transcript -> fallback.
    outcome = transcribe_voice(provider=fake, audio=b"unknown", mime_type="audio/ogg")
    assert outcome.understood is False and outcome.text is None
    # No audio at all -> fallback without touching the provider.
    outcome = transcribe_voice(provider=fake, audio=b"", mime_type="audio/ogg")
    assert outcome.understood is False and outcome.text is None

    class ExplodingProvider:
        name = "exploding"

        def transcribe(self, *, audio, mime_type, language_hint):
            raise RuntimeError("provider down")

    outcome = transcribe_voice(
        provider=ExplodingProvider(), audio=b"clip", mime_type="audio/ogg"
    )
    assert outcome.understood is False and outcome.text is None


# ---------------------------------------------------------------------------
# WhatsApp wiring (webhook harness, mirrored from test_whatsapp_channel).
# ---------------------------------------------------------------------------


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
    monkeypatch.delenv("VOICE_STT_PROVIDER", raising=False)
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
    response = client.post(
        "/api/v1/businesses", json={"name": "Voice Test Shop", "currency_code": "EGP"}
    )
    assert response.status_code == 201, response.text
    business_id = response.json()["id"]
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF,
        ))
        session.add(BusinessSetting(
            business_id=UUID(business_id),
            setting_key="whatsapp.channel.phone_number_id",
            setting_value=PHONE_NUMBER_ID,
        ))
        session.add(BusinessSetting(
            business_id=UUID(business_id),
            setting_key="whatsapp.channel.enabled",
            setting_value="true",
        ))
        session.commit()
    return business_id


def text_message(wa_id: str, wamid: str, body: str) -> dict:
    return {
        "from": wa_id, "id": wamid, "timestamp": "1764000000",
        "type": "text", "text": {"body": body},
    }


def audio_message(wa_id: str, wamid: str) -> dict:
    return {
        "from": wa_id, "id": wamid, "timestamp": "1764000000",
        "type": "audio", "audio": {"id": "media-1", "mime_type": "audio/ogg"},
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


def post_webhook(client, payload: dict):
    raw = json.dumps(payload).encode("utf-8")
    digest = hmac.new(SECRET.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    headers = {
        "content-type": "application/json",
        "x-hub-signature-256": f"sha256={digest}",
    }
    return client.post("/api/v1/assistant/whatsapp/webhook", content=raw, headers=headers)


def link_owner(wa, business_id: str) -> None:
    client, subject, fake = wa
    subject["value"] = OWNER
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/whatsapp/link-codes"
    )
    assert response.status_code == 201, response.text
    code = response.json()["code"]
    response = post_webhook(client, webhook_payload([text_message(OWNER_WA, "wamid.link", code)]))
    assert response.status_code == 200, response.text
    assert any(entry["body"].startswith("اتربطت") for entry in fake.outbox), fake.outbox
    fake.outbox.clear()


def install_voice(monkeypatch, fake_stt: FakeSTTProvider, audio: bytes) -> None:
    """Install both voice seams: the resolver hands the pipeline the
    fixture bytes for any audio message; the factory hands it the
    seeded Fake STT provider."""
    monkeypatch.setattr(whatsapp_api, "media_bytes_resolver", lambda message: audio)
    monkeypatch.setattr(whatsapp_api, "stt_provider_factory", lambda: fake_stt)


def proposals_for(business_id: str) -> list[AssistantProposal]:
    with app.state.session_factory() as session:
        return list(session.scalars(
            select(AssistantProposal)
            .where(AssistantProposal.business_id == UUID(business_id))
            .order_by(AssistantProposal.created_at.asc(), AssistantProposal.id.asc())
        ).all())


VOICE_BYTES = b"voice-fixture:webhook-command"
VOICE_TEXT = "أنشئ عميل جديد باسم سارة أحمد"


def test_audio_with_provider_transcribes_prefixes_and_proposes_like_text(
    wa, business, monkeypatch
):
    client, _subject, fake = wa
    link_owner(wa, business)

    # The same command typed: the baseline proposal + reply.
    response = post_webhook(
        client, webhook_payload([text_message(OWNER_WA, "wamid.text-1", VOICE_TEXT)])
    )
    assert response.status_code == 200, response.text
    text_reply = fake.outbox[-1]["body"]
    assert not text_reply.startswith("فهمت:")

    # The same command spoken: transcript prefix first, then the
    # pipeline's answer — and the SAME proposal as the typed text.
    fake_stt = FakeSTTProvider()
    fake_stt.register(VOICE_BYTES, text=VOICE_TEXT, confidence=0.99)
    install_voice(monkeypatch, fake_stt, VOICE_BYTES)
    response = post_webhook(
        client, webhook_payload([audio_message(OWNER_WA, "wamid.audio-1")])
    )
    assert response.status_code == 200, response.text
    voice_reply = fake.outbox[-1]["body"]
    assert voice_reply == f"فهمت: «{VOICE_TEXT}»\n{text_reply}"

    proposals = proposals_for(business)
    assert len(proposals) == 2
    assert proposals[0].action == proposals[1].action == "customer.create"
    assert proposals[0].payload == proposals[1].payload
    assert proposals[0].payload_hash == proposals[1].payload_hash

    # The persisted turn records the transcript as the user message
    # and the exact sent body (prefix included) as the answer.
    with app.state.session_factory() as session:
        messages = list(session.scalars(
            select(AssistantMessage).order_by(
                AssistantMessage.created_at.asc(), AssistantMessage.id.asc()
            )
        ).all())
    voice_turn = messages[-2:]
    assert voice_turn[0].role == "user" and voice_turn[0].content == VOICE_TEXT
    assert voice_turn[1].role == "assistant" and voice_turn[1].content == voice_reply
    assert str(voice_turn[1].proposal_id) == str(proposals[1].id)


def test_audio_low_confidence_gets_ask_to_type_and_no_proposal(
    wa, business, monkeypatch
):
    client, _subject, fake = wa
    link_owner(wa, business)
    fake_stt = FakeSTTProvider()
    fake_stt.register(VOICE_BYTES, text="سجل مصروف", confidence=0.3)
    install_voice(monkeypatch, fake_stt, VOICE_BYTES)
    response = post_webhook(
        client, webhook_payload([audio_message(OWNER_WA, "wamid.audio-low")])
    )
    assert response.status_code == 200, response.text
    assert fake.outbox[-1]["body"] == whatsapp_api._VOICE_NOT_UNDERSTOOD
    assert proposals_for(business) == []


def test_audio_no_provider_keeps_text_only_reply_byte_identical(
    wa, business, monkeypatch
):
    client, _subject, fake = wa
    link_owner(wa, business)
    # Bytes resolvable, but NO STT provider configured anywhere
    # (env unset, no factory seam): the pre-voice behavior, exactly.
    monkeypatch.setattr(whatsapp_api, "media_bytes_resolver", lambda message: VOICE_BYTES)
    response = post_webhook(
        client, webhook_payload([audio_message(OWNER_WA, "wamid.audio-none")])
    )
    assert response.status_code == 200, response.text
    assert fake.outbox[-1]["body"] == whatsapp_api._TEXT_ONLY
    assert proposals_for(business) == []


def test_audio_unimplemented_provider_env_keeps_text_only(wa, business, monkeypatch):
    client, _subject, fake = wa
    link_owner(wa, business)
    # An explicitly configured but unimplemented STT provider fails
    # closed: warning logged, behavior unchanged, nothing activated.
    monkeypatch.setenv("VOICE_STT_PROVIDER", "some-real-stt")
    monkeypatch.setattr(whatsapp_api, "media_bytes_resolver", lambda message: VOICE_BYTES)
    response = post_webhook(
        client, webhook_payload([audio_message(OWNER_WA, "wamid.audio-unimpl")])
    )
    assert response.status_code == 200, response.text
    assert fake.outbox[-1]["body"] == whatsapp_api._TEXT_ONLY
    assert proposals_for(business) == []


# ---------------------------------------------------------------------------
# The Egyptian test-set accuracy harness.
# ---------------------------------------------------------------------------


@pytest.fixture()
def intent_business(wa):
    """A business seeded exactly as the fixture file documents:
    the intent tests' customers/products/invoices."""
    client, subject, _fake = wa
    subject["value"] = OWNER
    response = client.post(
        "/api/v1/businesses", json={"name": "Voice Harness Shop", "currency_code": "EGP"}
    )
    assert response.status_code == 201, response.text
    business_uuid = UUID(response.json()["id"])
    with app.state.session_factory() as session:
        session.add_all([
            Customer(business_id=business_uuid, name="Ahmed Sami"),
            Customer(business_id=business_uuid, name="Ahmed Radwan"),
            Customer(business_id=business_uuid, name="Layla Hassan"),
            Customer(business_id=business_uuid, name="أحمد سامي"),
            Customer(business_id=business_uuid, name="أحمد رضوان"),
            Customer(business_id=business_uuid, name="ليلى حسن"),
            Product(business_id=business_uuid, name="Cable", unit_price=Decimal("250.00")),
            Product(business_id=business_uuid, name="Cable Pro", unit_price=Decimal("400.00")),
            Product(business_id=business_uuid, name="Notebook", unit_price=Decimal("60.00")),
            Product(business_id=business_uuid, name="كابل", unit_price=Decimal("100.00")),
        ])
        session.flush()
        customers = {
            row.name: row
            for row in session.scalars(
                select(Customer).where(Customer.business_id == business_uuid)
            ).all()
        }
        for number, total, customer_name in (
            ("ISS-1", "100.00", "Ahmed Sami"),
            ("ISS-2", "200.00", "Ahmed Radwan"),
        ):
            session.add(Invoice(
                business_id=business_uuid,
                customer_id=customers[customer_name].id,
                invoice_number=number, status="issued", currency_code="EGP",
                subtotal=Decimal(total), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal(total),
                issue_date=datetime(2026, 11, 1, tzinfo=UTC),
            ))
        session.commit()
    return business_uuid


def test_egyptian_test_set_intent_harness(intent_business):
    """THE accuracy gate (docs/VOICE_TRANSCRIPTION.md): every
    fixture's audio goes through the Fake and the transcript must
    drive the Slice 3 matcher to the expected intent. A real
    provider candidate re-runs this harness with recorded clips —
    a transcription error that changes a name or amount fails it."""
    data = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    phrases = data["phrases"]
    assert len(phrases) >= 25
    fake = FakeSTTProvider()
    for phrase in phrases:
        audio = f"voice-fixture:{phrase['id']}".encode("utf-8")
        fake.register(audio, text=phrase["expected_transcript"], confidence=0.99)
    with app.state.session_factory() as session:
        for phrase in phrases:
            audio = f"voice-fixture:{phrase['id']}".encode("utf-8")
            outcome = transcribe_voice(
                provider=fake, audio=audio, mime_type="audio/ogg"
            )
            assert outcome.understood, phrase["id"]
            assert outcome.text == phrase["expected_transcript"], phrase["id"]
            result = extract_deterministic_intent(
                session, intent_business, outcome.text
            )
            expected = phrase["expected_intent"]
            if expected in WRITE_ACTIONS:
                assert result.kind == "proposal", (phrase["id"], result)
                assert result.action == expected, (phrase["id"], result)
            else:  # read / none: no write intent may be extracted
                assert result.kind == "none", (phrase["id"], result)
