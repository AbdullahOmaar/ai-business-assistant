"""WhatsApp provider transport (W-foundation).

WHATSAPP-CHANNEL-DESIGN.md §7: the channel is a transport adapter
over the existing assistant — inbound messages flow into the same
chat pipeline, outbound replies are formatted as WhatsApp messages.
Which provider carries the traffic (Meta Cloud API direct, a BSP,
…) is an OWNER decision (§8 of the design) and therefore pure
configuration here: this module defines the provider interface and
ships exactly one implementation, the Fake used by tests and local
development. The factory FAILS CLOSED for any other configured
provider name — a deployment that names a provider this build does
not implement gets a clear error, never a silent fallback.

The webhook payload shape parsed here is the Meta WhatsApp Business
shape (``entry[].changes[].value.messages[]``) because every route
in §8 (direct Cloud API and the BSPs) delivers that shape or a
superset of it; the Fake parses the same shape so tests exercise
the real parsing path.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Mapping, Protocol
from uuid import uuid4

PROVIDER_ENV = "WHATSAPP_PROVIDER"
SECRET_ENV = "WHATSAPP_WEBHOOK_SECRET"
SIGNATURE_HEADER = "x-hub-signature-256"


class WhatsAppProviderUnavailable(RuntimeError):
    """The configured provider cannot serve traffic in this build.

    Raised for an unimplemented provider name (fail closed) — the
    webhook maps it to 503 so nothing is processed or sent.
    """


@dataclass(frozen=True)
class InboundMessage:
    """One inbound WhatsApp message, provider-shape-free."""

    wamid: str
    wa_id: str
    kind: str  # 'text' | 'audio' | 'image' | 'document' | 'video' | 'other'
    text: str | None
    recipient_phone_number_id: str | None
    timestamp: datetime | None = None
    raw: dict = field(default_factory=dict)

    @property
    def phone_e164(self) -> str:
        """The sender's number in E.164 form (wa_id is digits-only)."""
        return self.wa_id if self.wa_id.startswith("+") else f"+{self.wa_id}"


class WhatsAppProvider(Protocol):
    """The transport contract every provider implementation meets."""

    name: str

    def send_text(self, *, to_wa_id: str, body: str) -> str:
        """Send a free-form text; returns the provider message id."""
        ...

    def send_template(
        self, *, to_wa_id: str, template_name: str, language: str,
        components: list | None = None,
    ) -> str:
        """Send an approved template message; returns the message id."""
        ...

    def send_interactive(self, *, to_wa_id: str, payload: dict) -> str:
        """Send an interactive message (buttons/list); returns the id."""
        ...

    def parse_webhook(self, payload: dict) -> list[InboundMessage]:
        """Extract the inbound messages from a webhook payload.

        Delivery-status callbacks are not messages and are not
        returned (the foundation records outbound status at send
        time; status-callback processing is a later slice).
        """
        ...

    def verify_signature(self, *, headers: Mapping[str, str], raw_body: bytes) -> bool:
        """True only when the webhook signature matches the raw body."""
        ...


def _parse_meta_messages(payload: dict) -> list[InboundMessage]:
    """Parse the Meta-shaped webhook payload into inbound messages."""
    messages: list[InboundMessage] = []
    if not isinstance(payload, dict):
        return messages
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for change in entry.get("changes") or []:
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue
            metadata = value.get("metadata")
            phone_number_id = (
                metadata.get("phone_number_id") if isinstance(metadata, dict) else None
            )
            for raw in value.get("messages") or []:
                if not isinstance(raw, dict):
                    continue
                wamid = raw.get("id")
                wa_id = raw.get("from")
                if not isinstance(wamid, str) or not wamid:
                    continue
                if not isinstance(wa_id, str) or not wa_id:
                    continue
                kind = raw.get("type") if isinstance(raw.get("type"), str) else "other"
                text = None
                if kind == "text":
                    body = raw.get("text")
                    if isinstance(body, dict) and isinstance(body.get("body"), str):
                        text = body["body"]
                timestamp = None
                raw_ts = raw.get("timestamp")
                if isinstance(raw_ts, (int, float)):
                    timestamp = datetime.fromtimestamp(raw_ts, tz=UTC)
                elif isinstance(raw_ts, str) and raw_ts.isdigit():
                    timestamp = datetime.fromtimestamp(int(raw_ts), tz=UTC)
                messages.append(InboundMessage(
                    wamid=wamid,
                    wa_id=wa_id,
                    kind=kind if kind in ("text", "audio", "image", "document", "video") else "other",
                    text=text,
                    recipient_phone_number_id=(
                        phone_number_id if isinstance(phone_number_id, str) else None
                    ),
                    timestamp=timestamp,
                    raw=raw,
                ))
    return messages


def _signature_valid(secret: str | None, headers: Mapping[str, str], raw_body: bytes) -> bool:
    """HMAC-SHA256 webhook signature check (Meta's scheme).

    No secret configured -> always False: signature verification
    fails closed, never open.
    """
    if not secret:
        return False
    provided = None
    for key, value in headers.items():
        if key.lower() == SIGNATURE_HEADER:
            provided = value
            break
    if not provided or not isinstance(provided, str):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    expected = f"sha256={digest}"
    return hmac.compare_digest(provided, expected) or hmac.compare_digest(provided, digest)


class FakeWhatsAppProvider:
    """In-memory provider for tests and local development.

    Sends are recorded in ``outbox`` (nothing leaves the process);
    each send returns a synthetic ``wamid.fake.*`` message id.
    Webhook parsing and signature verification are the REAL
    implementations (shared helpers above), so tests exercise the
    production parsing/signature paths, not a stub of them.
    """

    name = "fake"

    def __init__(self, *, secret: str | None = None) -> None:
        self.secret = secret
        self.outbox: list[dict] = []

    def _record(self, entry: dict) -> str:
        message_id = f"wamid.fake.{uuid4().hex}"
        self.outbox.append({"id": message_id, **entry})
        return message_id

    def send_text(self, *, to_wa_id: str, body: str) -> str:
        return self._record({"kind": "text", "to": to_wa_id, "body": body})

    def send_template(
        self, *, to_wa_id: str, template_name: str, language: str,
        components: list | None = None,
    ) -> str:
        return self._record({
            "kind": "template", "to": to_wa_id,
            "template_name": template_name, "language": language,
            "components": components or [],
        })

    def send_interactive(self, *, to_wa_id: str, payload: dict) -> str:
        return self._record({"kind": "interactive", "to": to_wa_id, "payload": payload})

    def parse_webhook(self, payload: dict) -> list[InboundMessage]:
        return _parse_meta_messages(payload)

    def verify_signature(self, *, headers: Mapping[str, str], raw_body: bytes) -> bool:
        return _signature_valid(self.secret, headers, raw_body)


def create_provider(name: str | None = None, *, secret: str | None = None) -> WhatsAppProvider:
    """Build the configured provider.

    ``WHATSAPP_PROVIDER`` names the provider (default ``fake``);
    ``WHATSAPP_WEBHOOK_SECRET`` is the webhook signing secret. Any
    name other than ``fake`` raises WhatsAppProviderUnavailable:
    real providers (Meta Cloud API, BSPs) are owner-decision
    territory (§8) and are deliberately NOT implemented in the
    foundation — naming one must fail closed, not fall back.
    """
    resolved = (name or os.getenv(PROVIDER_ENV) or "fake").strip().lower()
    resolved_secret = secret if secret is not None else (os.getenv(SECRET_ENV) or None)
    if resolved == "fake":
        return FakeWhatsAppProvider(secret=resolved_secret)
    raise WhatsAppProviderUnavailable(
        f"WhatsApp provider {resolved!r} is not implemented in this build; "
        "the channel fails closed until the owner's provider decision "
        "(WHATSAPP-CHANNEL-DESIGN.md §8) is implemented."
    )
