"""WhatsApp linking + channel bookkeeping (W-foundation).

WHATSAPP-CHANNEL-DESIGN.md §3: linking is identity. A signed-in
member creates a short-lived code IN THE APP; the link completes
only when that code arrives in a WhatsApp message from the number
being linked. Link management (create code / revoke) lives in the
app only — the assistant can never link, unlink or swap numbers
from inside WhatsApp (a natural extension of the B6 ban on the
assistant changing settings/memberships itself).

This module owns: link codes, link completion (with the §3.2
conflict rules), revocation, the per-business channel configuration
reads (kill switch + receiving-number mapping, both plain
BusinessSetting rows written through the existing owner-only
settings endpoints), and the whatsapp_messages ledger writes
(dedupe claim + outbound records).
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    BusinessSetting,
    WhatsAppLink,
    WhatsAppLinkCode,
    WhatsAppMessage,
)

# Channel configuration keys (BusinessSetting rows, per business).
CHANNEL_ENABLED_KEY = "whatsapp.channel.enabled"
CHANNEL_PHONE_NUMBER_ID_KEY = "whatsapp.channel.phone_number_id"

CODE_TTL = timedelta(minutes=10)
# Unambiguous alphabet: no 0/O, 1/I/L — a code is read off a screen
# and typed on a phone, so look-alike characters are excluded.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 6

_LINKED = "linked"
_REVOKED = "revoked"


class LinkNotFound(Exception):
    """No link with this id in this business."""


class LinkForbidden(Exception):
    """The actor may not revoke this link (not theirs, not owner)."""


def _iso(value: datetime | None) -> str | None:
    # SQLite returns naive timestamps; normalize to aware UTC (same
    # rule as assistant_persistence._iso).
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _now() -> datetime:
    return datetime.now(UTC)


def _code_hash(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def is_code_shaped(text: str | None) -> bool:
    """True when a message is exactly a plausible link code."""
    if not text:
        return False
    candidate = text.strip().upper()
    return len(candidate) == _CODE_LENGTH and all(
        char in _CODE_ALPHABET for char in candidate
    )


def mask_phone(phone: str) -> str:
    """Mask a phone number for display: first 4 + last 2 visible."""
    if len(phone) <= 6:
        return "*" * len(phone)
    return phone[:4] + "•" * (len(phone) - 6) + phone[-2:]


# ---------------------------------------------------------------------------
# Channel configuration (reads; writes go through the existing
# owner-only settings endpoints — this module never writes settings).
# ---------------------------------------------------------------------------


def _setting(session: Session, *, business_id: UUID, key: str) -> str | None:
    return session.scalar(
        select(BusinessSetting.setting_value).where(
            BusinessSetting.business_id == business_id,
            BusinessSetting.setting_key == key,
        )
    )


def channel_enabled(session: Session, *, business_id: UUID) -> bool:
    """The per-business kill switch (design §7). DEFAULT OFF: only an
    explicit true value enables the channel — a business that never
    configured WhatsApp processes nothing and sends nothing."""
    value = _setting(session, business_id=business_id, key=CHANNEL_ENABLED_KEY)
    return (value or "").strip().lower() in ("true", "1", "yes", "on")


def business_id_for_phone_number_id(
    session: Session, *, phone_number_id: str | None
) -> UUID | None:
    """Resolve which business a webhook payload was delivered for,
    from the receiving number's provider id (deployment config —
    the number itself is an owner decision, §8; only the mapping
    mechanism lives here)."""
    if not phone_number_id:
        return None
    return session.scalar(
        select(BusinessSetting.business_id).where(
            BusinessSetting.setting_key == CHANNEL_PHONE_NUMBER_ID_KEY,
            BusinessSetting.setting_value == phone_number_id,
        )
    )


# ---------------------------------------------------------------------------
# Link codes.
# ---------------------------------------------------------------------------


def create_link_code(
    session: Session, *, business_id: UUID, user_subject: str
) -> tuple[str, WhatsAppLinkCode]:
    """Create a fresh code for the caller (flush only — the caller
    commits). Earlier unused codes of the same member in the same
    business are superseded, so at most one live code exists per
    member per business."""
    now = _now()
    for stale in session.scalars(
        select(WhatsAppLinkCode).where(
            WhatsAppLinkCode.business_id == business_id,
            WhatsAppLinkCode.user_subject == user_subject,
            WhatsAppLinkCode.used_at.is_(None),
        )
    ).all():
        stale.used_at = now
    code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
    row = WhatsAppLinkCode(
        business_id=business_id,
        user_subject=user_subject,
        code_hash=_code_hash(code),
        expires_at=now + CODE_TTL,
        created_at=now,
    )
    session.add(row)
    session.flush()
    return code, row


def find_pending_code(session: Session, *, code_text: str) -> WhatsAppLinkCode | None:
    """The live (unused, unexpired) code row for an inbound code
    message, preferring the earliest expiring when several rows
    somehow share a hash."""
    now = _now()
    rows = session.scalars(
        select(WhatsAppLinkCode)
        .where(
            WhatsAppLinkCode.code_hash == _code_hash(code_text),
            WhatsAppLinkCode.used_at.is_(None),
        )
        .order_by(WhatsAppLinkCode.expires_at.asc())
    ).all()
    for row in rows:
        expires_at = row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at > now:
            return row
    return None


# ---------------------------------------------------------------------------
# Links.
# ---------------------------------------------------------------------------


def find_active_link(
    session: Session, *, business_id: UUID, wa_id: str
) -> WhatsAppLink | None:
    """The active link for a sender number in a business, if any."""
    return session.scalars(
        select(WhatsAppLink).where(
            WhatsAppLink.business_id == business_id,
            WhatsAppLink.wa_id == wa_id,
            WhatsAppLink.status == _LINKED,
        )
    ).first()


def complete_link(
    session: Session, *, code: WhatsAppLinkCode, wa_id: str, phone_e164: str
) -> tuple[str, WhatsAppLink | None]:
    """Bind the sender's number to the code's account (§3.2 rules).

    Outcomes: ``linked`` (a new link, or the same account re-confirming
    its own number — the code is consumed either way),
    ``number_taken`` (the number is actively linked to a DIFFERENT
    account in this business — refused, code NOT consumed), and
    ``user_has_other`` (the account already has a different active
    number — refused per §3.2: revoke in the app first; code NOT
    consumed). Flush only — the caller commits.
    """
    business_id = code.business_id
    by_number = find_active_link(session, business_id=business_id, wa_id=wa_id)
    if by_number is not None:
        if by_number.user_subject == code.user_subject:
            code.used_at = _now()
            session.flush()
            return "linked", by_number
        return "number_taken", None
    by_user = session.scalars(
        select(WhatsAppLink).where(
            WhatsAppLink.business_id == business_id,
            WhatsAppLink.user_subject == code.user_subject,
            WhatsAppLink.status == _LINKED,
        )
    ).first()
    if by_user is not None:
        return "user_has_other", None
    now = _now()
    link = WhatsAppLink(
        business_id=business_id,
        user_subject=code.user_subject,
        phone_e164=phone_e164,
        wa_id=wa_id,
        status=_LINKED,
        linked_at=now,
        created_at=now,
    )
    session.add(link)
    code.used_at = now
    session.flush()
    return "linked", link


def list_links(
    session: Session, *, business_id: UUID, user_subject: str
) -> list[WhatsAppLink]:
    """The caller's own links in the business, newest first
    (revoked rows included — the surface shows the history)."""
    return list(session.scalars(
        select(WhatsAppLink)
        .where(
            WhatsAppLink.business_id == business_id,
            WhatsAppLink.user_subject == user_subject,
        )
        .order_by(WhatsAppLink.created_at.desc(), WhatsAppLink.id.desc())
    ).all())


def revoke_link(
    session: Session,
    *,
    business_id: UUID,
    link_id: UUID,
    actor_subject: str,
    actor_is_owner: bool,
) -> WhatsAppLink:
    """Revoke a link (flush only). The link's owner may revoke their
    own link; a business owner may revoke any link in the business.
    Revoking an already-revoked link is a no-op success."""
    link = session.get(WhatsAppLink, link_id)
    if link is None or link.business_id != business_id:
        raise LinkNotFound("WhatsApp link not found.")
    if link.user_subject != actor_subject and not actor_is_owner:
        raise LinkForbidden("Only the link's owner or a business owner may revoke it.")
    if link.status != _REVOKED:
        link.status = _REVOKED
        link.revoked_at = _now()
        session.flush()
    return link


def link_view(link: WhatsAppLink) -> dict:
    """The API shape of a link — the phone number is ALWAYS masked."""
    return {
        "id": str(link.id),
        "business_id": str(link.business_id),
        "user_subject": link.user_subject,
        "phone_masked": mask_phone(link.phone_e164),
        "status": link.status,
        "linked_at": _iso(link.linked_at),
        "revoked_at": _iso(link.revoked_at),
        "created_at": _iso(link.created_at),
    }


def link_code_view(code: str, row: WhatsAppLinkCode) -> dict:
    """The create-code response: the plaintext code is returned ONCE,
    to the signed-in member who asked for it — only its hash is ever
    stored."""
    return {"code": code, "expires_at": _iso(row.expires_at)}


# ---------------------------------------------------------------------------
# The whatsapp_messages ledger: dedupe claim + outbound records.
# ---------------------------------------------------------------------------


def claim_inbound(
    session: Session,
    *,
    business_id: UUID,
    wamid: str,
    wa_id: str,
    kind: str,
    body_preview: str | None,
) -> WhatsAppMessage | None:
    """Insert-first dedupe: record the inbound message and commit.

    Returns the row, or None when this wamid was already claimed
    (a provider redelivery) — the caller then processes nothing.
    The commit is deliberate: the claim must survive even when the
    subsequent processing fails, or a redelivery would reprocess.
    """
    row = WhatsAppMessage(
        business_id=business_id,
        direction="in",
        wamid=wamid,
        wa_id=wa_id,
        kind=kind,
        body_preview=(body_preview or "")[:500] or None,
        provider_status="received",
        created_at=_now(),
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        return None
    return row


def record_outbound(
    session: Session,
    *,
    business_id: UUID,
    wamid: str,
    wa_id: str,
    kind: str,
    body_preview: str | None = None,
    template_name: str | None = None,
    conversation_id: UUID | None = None,
    proposal_id: UUID | None = None,
) -> WhatsAppMessage:
    """Record one sent message (commits — the send already happened,
    so the ledger write must not be lost with a later failure)."""
    row = WhatsAppMessage(
        business_id=business_id,
        direction="out",
        wamid=wamid,
        wa_id=wa_id,
        kind=kind,
        body_preview=(body_preview or "")[:500] or None,
        template_name=template_name,
        provider_status="sent",
        conversation_id=conversation_id,
        proposal_id=proposal_id,
        created_at=_now(),
    )
    session.add(row)
    session.commit()
    return row


def intro_already_sent(session: Session, *, business_id: UUID, wa_id: str) -> bool:
    """The unlinked-number rule (§3.2): exactly ONE polite intro per
    number per business, then silence. The intro ledger row is the
    record that it was sent."""
    return session.scalar(
        select(WhatsAppMessage.id).where(
            WhatsAppMessage.business_id == business_id,
            WhatsAppMessage.wa_id == wa_id,
            WhatsAppMessage.direction == "out",
            WhatsAppMessage.kind == "intro",
        )
    ) is not None


def last_conversation_id(
    session: Session, *, business_id: UUID, wa_id: str
) -> UUID | None:
    """The conversation this number's WhatsApp thread most recently
    used, so a WhatsApp conversation continues across messages (and
    is the same Slice 4 history the app shows)."""
    return session.scalar(
        select(WhatsAppMessage.conversation_id)
        .where(
            WhatsAppMessage.business_id == business_id,
            WhatsAppMessage.wa_id == wa_id,
            WhatsAppMessage.conversation_id.is_not(None),
        )
        .order_by(WhatsAppMessage.created_at.desc(), WhatsAppMessage.id.desc())
        .limit(1)
    )
