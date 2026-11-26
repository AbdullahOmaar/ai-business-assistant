"""WhatsApp channel endpoints (W-foundation).

Two surfaces, per WHATSAPP-CHANNEL-DESIGN.md §7:

- The app-side linking surface (business-scoped, authenticated like
  every other assistant route): create a link code, list the
  caller's links (masked), revoke a link. Linking is managed from
  the app ONLY (§3.2) — nothing in the webhook can create, change
  or remove a link except completing a code the app issued.
- The provider webhook (public, signature-verified, fail-closed):
  resolves the business from the receiving number's configured
  provider id, honours the per-business kill switch (default OFF),
  dedupes by wamid (insert-first), answers an unlinked number with
  exactly one polite intro and then silence, and runs a linked
  number's text through the EXISTING chat pipeline
  (``assistant_api._answer_chat``) with the linked user's own
  identity — the channel adds no logic of its own and never touches
  the policy gate directly: proposals and executions flow through
  the same Slice 1/3 paths the app uses.

Voice (phase ص, docs/VOICE_TRANSCRIPTION.md): an audio message from
a linked number is transcribed ONLY when both seams below are
satisfied — media bytes are resolvable AND an STT provider is
explicitly configured. Neither holds in this build by default (no
real WhatsApp provider exists to download media, and no STT
provider is implemented), so the shipped behavior for audio is
exactly the polite text-only reply; the structure is live and
tested through the Fake STT provider.

The provider comes from ``whatsapp_transport.create_provider`` —
the factory fails closed for unimplemented providers, and a
provider without a configured webhook secret serves nothing (503).
"""
from __future__ import annotations

import json
import logging
from typing import Callable
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import assistant_api
from app import assistant_persistence as persistence
from app import voice_transcription as voice
from app import whatsapp_linking as linking
from app.dependencies import get_principal, get_session
from app.models import Business, MembershipRole
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)
from app.whatsapp_transport import (
    InboundMessage,
    WhatsAppProvider,
    WhatsAppProviderUnavailable,
    create_provider,
)

router = APIRouter(
    prefix="/api/v1/businesses/{business_id}/assistant/whatsapp",
    tags=["WhatsApp channel"],
)
webhook_router = APIRouter(prefix="/api/v1/assistant/whatsapp", tags=["WhatsApp channel"])

logger = logging.getLogger(__name__)

# Reply texts (design §3.2/§4 — Egyptian dialect, the default). The
# channel never invents data in these: the intro names only the
# business whose number was messaged, and no reply confirms anything
# about accounts beyond the linking state of the sender's own number.
_INTRO = (
    "أنا حسو، مساعد {name} — الرقم ده مش مربوط بحساب. "
    "الربط بيتم من جوه التطبيق: افتح تبويب المساعد، الإعدادات، «اربط واتساب»، "
    "وابعت الكود اللي يظهر لك هنا."
)
_WELCOME = "اتربطت — أنا حسو، مساعد {name}. جرّب تسألني: مين عليه متأخرات؟"
_NUMBER_TAKEN = (
    "الرقم ده مربوط بحساب تاني في {name}. "
    "لو ده رقمك، فكّ الربط من جوه التطبيق الأول وبعدين حاول تاني."
)
_USER_HAS_OTHER = (
    "حسابك مربوط برقم تاني في {name}. "
    "فكّ الربط من جوه التطبيق الأول، وبعدين اربط الرقم ده."
)
_TEXT_ONLY = "لسه بفهم النصوص المكتوبة بس — اكتبلي طلبك."
_VOICE_NOT_UNDERSTOOD = "مسمعتش الصوت كويس — ممكن تكتبهولي؟"
_PIPELINE_ERROR = "حصلت مشكلة مؤقتة عندي — حاول تاني بعد شوية."

# Voice seams (phase ص). Media bytes for an inbound audio message
# are resolved through ``media_bytes_resolver``; the STT provider
# comes from ``stt_provider_factory`` when a test (or a future real
# transport) installs one, else from the environment via
# app.voice_transcription. Both default to None/unconfigured: no
# real provider exists in this build to download media (W2
# territory), so an audio message gets exactly the pre-voice
# text-only reply until a real transport lands.
media_bytes_resolver: Callable[[InboundMessage], bytes | None] | None = None
stt_provider_factory: Callable[[], voice.STTProvider | None] | None = None


def _member(session: Session, principal: AuthenticatedPrincipal, business_id: UUID):
    """Any member of the business may manage their own link; the 403
    shape matches the chat endpoint."""
    try:
        return authorize_membership(session, principal=principal, business_id=business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail="No access to this business workspace.") from exc


@router.post("/link-codes", status_code=201)
def create_link_code_endpoint(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Issue a 10-minute linking code for the caller. The plaintext
    code is returned once; only its hash is stored."""
    _member(session, principal, business_id)
    code, row = linking.create_link_code(
        session, business_id=business_id, user_subject=principal.subject
    )
    session.commit()
    return linking.link_code_view(code, row)


@router.get("/links")
def list_links_endpoint(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """The caller's own links in this business, numbers masked."""
    _member(session, principal, business_id)
    return [
        linking.link_view(link)
        for link in linking.list_links(
            session, business_id=business_id, user_subject=principal.subject
        )
    ]


@router.delete("/links/{link_id}", status_code=204)
def revoke_link_endpoint(
    business_id: UUID,
    link_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Revoke a link: the link's owner, or a business owner for any
    link in the business. This is the ONLY way a link ends (§3.2)."""
    membership = _member(session, principal, business_id)
    try:
        linking.revoke_link(
            session,
            business_id=business_id,
            link_id=link_id,
            actor_subject=principal.subject,
            actor_is_owner=membership.role == MembershipRole.OWNER,
        )
    except linking.LinkNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except linking.LinkForbidden as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    session.commit()
    return None


# ---------------------------------------------------------------------------
# Webhook.
# ---------------------------------------------------------------------------


def _business_name(session: Session, business_id: UUID) -> str:
    business = session.get(Business, business_id)
    return business.name if business is not None else "النشاط"


def _send_text(
    session: Session,
    provider: WhatsAppProvider,
    *,
    business_id: UUID,
    to_wa_id: str,
    body: str,
    kind: str = "text",
    conversation_id: UUID | None = None,
    proposal_id: UUID | None = None,
) -> None:
    """Send one text and record it in the ledger. A send failure is
    logged, never raised — the webhook still answers 200 so the
    provider does not retry a message we already claimed."""
    try:
        message_id = provider.send_text(to_wa_id=to_wa_id, body=body)
    except Exception:  # noqa: BLE001 - a transport failure must not fail the webhook
        logger.exception("WhatsApp send failed for business %s", business_id)
        return
    linking.record_outbound(
        session,
        business_id=business_id,
        wamid=message_id,
        wa_id=to_wa_id,
        kind=kind,
        body_preview=body,
        conversation_id=conversation_id,
        proposal_id=proposal_id,
    )


async def _run_pipeline(
    session: Session,
    provider: WhatsAppProvider,
    *,
    business_id: UUID,
    link_subject: str,
    message: InboundMessage,
    transcript: str | None = None,
) -> None:
    """Run one linked message through the existing chat pipeline
    with the linked user's identity, persist the turn via Slice 4
    persistence, and reply with the pipeline's answer.

    With ``transcript`` set (a voice message, phase ص) the
    transcript IS the user's message, and the reply is prefixed
    «فهمت: «النص»» — the user always sees what was understood
    BEFORE the answer or any proposal derived from it. The
    persisted turn records the transcript and the exact sent body,
    so the app history shows precisely what the user saw."""
    understood = (transcript or "").strip()
    effective_text = understood or (message.text or "")
    principal = AuthenticatedPrincipal(subject=link_subject)
    body = assistant_api.ChatInput(message=effective_text)
    try:
        result = await assistant_api._answer_chat(business_id, body, session, principal)
    except HTTPException as exc:
        if exc.status_code == 403:
            # The membership behind this link is gone — the link is
            # stale. Silence (like an unlinked number after its
            # intro): replying would serve an identity that no
            # longer has access.
            logger.info(
                "WhatsApp link for business %s no longer maps to a member; not replying",
                business_id,
            )
            return
        logger.warning(
            "WhatsApp pipeline failed for business %s (HTTP %s)", business_id, exc.status_code
        )
        _send_text(session, provider, business_id=business_id,
                   to_wa_id=message.wa_id, body=_PIPELINE_ERROR)
        return
    except Exception:  # noqa: BLE001 - one bad turn must not fail the webhook
        logger.exception("WhatsApp pipeline crashed for business %s", business_id)
        _send_text(session, provider, business_id=business_id,
                   to_wa_id=message.wa_id, body=_PIPELINE_ERROR)
        return

    answer = result.get("answer", "") if isinstance(result, dict) else ""
    sent_body = answer
    if understood:
        prefix = f"فهمت: «{understood}»"
        sent_body = f"{prefix}\n{answer}" if answer else prefix
    proposal_id = None
    proposal = result.get("proposal") if isinstance(result, dict) else None
    if isinstance(proposal, dict) and proposal.get("id"):
        try:
            proposal_id = UUID(str(proposal["id"]))
        except ValueError:
            proposal_id = None
    conversation_id = None
    try:
        conversation = persistence.record_turn(
            session,
            business_id=business_id,
            user_subject=link_subject,
            conversation_id=linking.last_conversation_id(
                session, business_id=business_id, wa_id=message.wa_id
            ),
            user_message=effective_text,
            assistant_answer=sent_body,
            proposal_id=proposal_id,
        )
        conversation_id = conversation.id
    except Exception:  # noqa: BLE001 - persistence must not lose the reply (chat() rule)
        logger.exception(
            "WhatsApp turn persistence failed for business %s; replying unpersisted",
            business_id,
        )
    if sent_body:
        _send_text(
            session, provider, business_id=business_id, to_wa_id=message.wa_id,
            body=sent_body, conversation_id=conversation_id, proposal_id=proposal_id,
        )


async def _run_voice_pipeline(
    session: Session,
    provider: WhatsAppProvider,
    *,
    business_id: UUID,
    link_subject: str,
    message: InboundMessage,
) -> bool:
    """Try the voice path for one linked audio message (phase ص).

    Returns True when the message was handled — transcribed and run
    through the pipeline, or answered with the polite ask-to-type
    fallback. Returns False when voice is not available for this
    message (no media bytes resolvable, or no STT provider
    configured): the caller then sends the standard text-only
    reply, exactly the pre-voice behavior. Voice never guesses:
    a failed or low-confidence transcription is the fallback
    reply, never a proposal."""
    if media_bytes_resolver is None:
        return False
    try:
        audio = media_bytes_resolver(message)
    except Exception:  # noqa: BLE001 - a media failure must not fail the webhook
        logger.exception("WhatsApp media resolution failed for business %s", business_id)
        return False
    if not audio:
        return False
    if stt_provider_factory is not None:
        stt = stt_provider_factory()
    else:
        try:
            stt = voice.configured_stt_provider()
        except voice.VoiceProviderUnavailable:
            # Fail closed and loud: an explicitly configured but
            # unimplemented STT provider must never silently
            # activate — the channel keeps the text-only behavior.
            logger.warning(
                "Configured STT provider is not implemented in this build; "
                "voice stays text-only for business %s",
                business_id,
            )
            return False
    if stt is None:
        return False
    mime_type = "audio/ogg"
    raw_audio = message.raw.get("audio") if isinstance(message.raw, dict) else None
    if isinstance(raw_audio, dict) and isinstance(raw_audio.get("mime_type"), str):
        mime_type = raw_audio["mime_type"]
    outcome = voice.transcribe_voice(
        provider=stt, audio=audio, mime_type=mime_type
    )
    if not outcome.understood or not outcome.text:
        _send_text(session, provider, business_id=business_id,
                   to_wa_id=message.wa_id, body=_VOICE_NOT_UNDERSTOOD)
        return True
    await _run_pipeline(
        session, provider, business_id=business_id,
        link_subject=link_subject, message=message, transcript=outcome.text,
    )
    return True


async def _process_message(
    session: Session,
    provider: WhatsAppProvider,
    message: InboundMessage,
) -> str:
    """Process one inbound message; returns the outcome for the
    webhook response counts."""
    business_id = linking.business_id_for_phone_number_id(
        session, phone_number_id=message.recipient_phone_number_id
    )
    code = None
    if message.kind == "text" and linking.is_code_shaped(message.text):
        code = linking.find_pending_code(session, code_text=message.text or "")
    if business_id is None and code is not None:
        business_id = code.business_id
    if business_id is None:
        # The payload cannot be attributed to any business (the
        # receiving number is not configured and the text is not a
        # live code): there is no honest reply to send — drop it.
        logger.info("WhatsApp webhook message %s unattributable; dropped", message.wamid)
        return "ignored"
    if code is not None and code.business_id != business_id:
        # A live code for another business sent to this business's
        # number: not usable here — the sender is treated as an
        # ordinary unlinked number for THIS business.
        code = None
    if not linking.channel_enabled(session, business_id=business_id):
        # Kill switch (default OFF): inbound ignored, nothing sent,
        # nothing recorded.
        return "ignored"
    claimed = linking.claim_inbound(
        session,
        business_id=business_id,
        wamid=message.wamid,
        wa_id=message.wa_id,
        kind=message.kind,
        body_preview=message.text,
    )
    if claimed is None:
        return "duplicate"

    name = _business_name(session, business_id)
    if code is not None:
        outcome, _link = linking.complete_link(
            session, code=code, wa_id=message.wa_id, phone_e164=message.phone_e164
        )
        session.commit()
        if outcome == "linked":
            _send_text(session, provider, business_id=business_id,
                       to_wa_id=message.wa_id, body=_WELCOME.format(name=name))
        elif outcome == "number_taken":
            _send_text(session, provider, business_id=business_id,
                       to_wa_id=message.wa_id, body=_NUMBER_TAKEN.format(name=name))
        else:  # user_has_other
            _send_text(session, provider, business_id=business_id,
                       to_wa_id=message.wa_id, body=_USER_HAS_OTHER.format(name=name))
        return "processed"

    link = linking.find_active_link(session, business_id=business_id, wa_id=message.wa_id)
    if link is None:
        if not linking.intro_already_sent(session, business_id=business_id, wa_id=message.wa_id):
            _send_text(session, provider, business_id=business_id,
                       to_wa_id=message.wa_id, body=_INTRO.format(name=name), kind="intro")
        return "processed"
    if message.kind == "audio":
        # Voice (phase ص): transcribed only when media bytes AND a
        # configured STT provider both exist; otherwise the
        # text-only reply below, unchanged from the pre-voice build.
        if await _run_voice_pipeline(
            session, provider, business_id=business_id,
            link_subject=link.user_subject, message=message,
        ):
            return "processed"
    if message.kind != "text" or not (message.text or "").strip():
        # Images/files (design §4): document reading is not built —
        # a polite text-only answer, never a silent drop and never
        # a guess.
        _send_text(session, provider, business_id=business_id,
                   to_wa_id=message.wa_id, body=_TEXT_ONLY)
        return "processed"
    await _run_pipeline(
        session, provider, business_id=business_id,
        link_subject=link.user_subject, message=message,
    )
    return "processed"


@webhook_router.post("/webhook")
async def whatsapp_webhook(
    request: Request,
    session: Session = Depends(get_session),
):
    """Provider webhook: signature-verified, fail-closed.

    No provider implemented / no webhook secret configured -> 503
    and nothing is processed. A bad signature -> 403. Otherwise the
    payload's messages are processed and the answer is 200 (even for
    dropped/duplicated messages — the provider must not retry them).
    """
    try:
        provider = create_provider()
    except WhatsAppProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not getattr(provider, "secret", None):
        raise HTTPException(
            status_code=503,
            detail="WhatsApp channel is not configured (no webhook secret).",
        )
    raw_body = await request.body()
    if not provider.verify_signature(headers=request.headers, raw_body=raw_body):
        raise HTTPException(status_code=403, detail="Invalid webhook signature.")
    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Webhook payload is not valid JSON.") from exc
    counts = {"processed": 0, "duplicate": 0, "ignored": 0}
    for message in provider.parse_webhook(payload):
        outcome = await _process_message(session, provider, message)
        counts[outcome] = counts.get(outcome, 0) + 1
    return {"status": "ok", **counts}
