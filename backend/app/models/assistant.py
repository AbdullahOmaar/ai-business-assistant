"""Database models: assistant domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AssistantProposal(Base):
    """One assistant-proposed write, bound to its exact payload (Slice 1).

    The lifecycle is request -> proposal -> (second approval, when the
    action is in the 19) -> execute -> result. The payload is stored
    server-side and never changes between proposal and execution; the
    approval binds to its hash, so a tampered or re-issued payload can
    never ride an old approval. ``expires_at`` is creation + 5 minutes
    (owner decision 2026-11-25); expiry is derived on read — no lazy
    write mutates the row — so ``status`` stays ``proposed``/``approved``
    in the database and the API reports ``expired`` once the deadline
    passes. ``approved_action`` records the effective action the
    approval was granted for (draft vs issued invoice update), so an
    approval given for a draft edit cannot execute an issued edit if
    the invoice's status changed underneath. ``executing`` is a
    transient claim state: the execute step atomically moves the
    proposal to ``executing`` (committed before dispatch) so a second
    concurrent execute cannot dispatch the same payload again; a
    failed dispatch releases the claim back to the pre-execution
    status, so the approval is not burned.
    """

    __tablename__ = "assistant_proposals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('proposed', 'approved', 'executing', 'executed', 'expired', 'rejected')",
            name="ck_assistant_proposals_status",
        ),
        Index("ix_assistant_proposals_business_created", "business_id", "created_at"),
        Index("ix_assistant_proposals_business_status", "business_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    requester_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="proposed")
    approver_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_action: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_target_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    result_target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AssistantConfirmationOptOut(Base):
    """An owner's explicit per-action waiver of the second-approval question.

    Slice 1 (owner decision 2026-11-25, DESIGN.md §5.3): the owner may
    enable "don't ask again" for any of the 19 sensitive actions. The
    waiver covers only the *question*: role, payload binding and audit
    still apply, and it waives approval only for the owner's own
    requests — a staff member's money action always needs a live owner
    approval. One row per (business, owner, action).
    """

    __tablename__ = "assistant_confirmation_opt_outs"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "user_subject", "action",
            name="uq_assistant_opt_outs_business_user_action",
        ),
        Index("ix_assistant_opt_outs_business_user", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AssistantConversation(Base):
    """One persisted assistant chat thread (Slice 4).

    A conversation belongs to a business and to the user who started
    it, but it is business-visible: any member may list and resume any
    conversation in the business — the cross-owner approval path needs
    the owner to open a staff requester's conversation and click
    approve on the proposal card that lives in it. ``title`` is the
    first user message truncated, never model-generated.
    ``updated_at`` moves on every appended message so the history list
    orders by most recent activity.
    """

    __tablename__ = "assistant_conversations"
    __table_args__ = (
        Index("ix_assistant_conversations_business_updated", "business_id", "updated_at"),
        Index("ix_assistant_conversations_business_subject", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AssistantMessage(Base):
    """One persisted chat turn (Slice 4).

    ``role`` is 'user' or 'assistant'; ``content`` is the exact text
    shown. ``proposal_id`` links the message that carried a proposal
    card to its proposal row — the proposal itself is never copied
    into the message: GET-one re-reads the proposal from its own
    table, so a resumed card shows the proposal's CURRENT state (a
    proposal whose 5 minutes elapsed reads ``expired``, honestly,
    never as still-valid). ON DELETE SET NULL keeps the message even
    if its proposal row is ever removed.
    """

    __tablename__ = "assistant_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_assistant_messages_role",
        ),
        Index("ix_assistant_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    proposal_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppLink(Base):
    """A team member's phone number bound to their account (W-foundation).

    WhatsApp channel (WHATSAPP-CHANNEL-DESIGN.md §3): linking starts
    in the app (a short-lived code) and completes when the code
    arrives from the number being linked. One active link per
    (business, number) and per (business, user) — enforced in
    app.whatsapp_linking, not by a unique constraint, because revoked
    rows are kept as the audit trail. ``status`` is 'linked' or
    'revoked'; a revoked link is never silently resurrected — linking
    again creates a fresh row through a fresh code.
    """

    __tablename__ = "whatsapp_links"
    __table_args__ = (
        CheckConstraint(
            "status IN ('linked', 'revoked')",
            name="ck_whatsapp_links_status",
        ),
        Index("ix_whatsapp_links_business_wa", "business_id", "wa_id"),
        Index("ix_whatsapp_links_business_user", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    phone_e164: Mapped[str] = mapped_column(String(32), nullable=False)
    wa_id: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="linked")
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppMessage(Base):
    """One WhatsApp channel ledger row (W-foundation).

    Every inbound message the webhook accepts and every outbound
    message the channel sends is recorded here. The inbound ``wamid``
    is UNIQUE — that is the dedupe mechanism: a provider redelivery
    of the same message collides on insert and is processed zero
    additional times. Outbound rows carry the provider's message id
    as their ``wamid``. ``conversation_id``/``proposal_id`` tie a
    WhatsApp turn to its Slice 4 conversation and any proposal it
    produced — the ledger rows are how a conversation is marked as a
    WhatsApp-channel conversation (Slice 4 tables stay untouched).
    ``wa_id`` is the counterparty: the sender for inbound rows, the
    recipient for outbound rows. ``body_preview`` is a bounded copy
    for support/debugging, never the channel of record.
    """

    __tablename__ = "whatsapp_messages"
    __table_args__ = (
        CheckConstraint(
            "direction IN ('in', 'out')",
            name="ck_whatsapp_messages_direction",
        ),
        UniqueConstraint("wamid", name="uq_whatsapp_messages_wamid"),
        Index("ix_whatsapp_messages_business_created", "business_id", "created_at"),
        Index("ix_whatsapp_messages_business_wa", "business_id", "wa_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    wamid: Mapped[str] = mapped_column(String(128), nullable=False)
    wa_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    conversation_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
    proposal_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="text")
    body_preview: Mapped[str | None] = mapped_column(String(500), nullable=True)
    template_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppLinkCode(Base):
    """A single-use, 10-minute linking code (W-foundation).

    Created in the app by a signed-in member; only the SHA-256 hash
    of the code is stored, so a database read never reveals a live
    code. The code completes exactly one link (``used_at`` is set on
    completion); creating a new code supersedes the member's earlier
    unused codes in the same business.
    """

    __tablename__ = "whatsapp_link_codes"
    __table_args__ = (
        Index("ix_whatsapp_link_codes_hash", "code_hash"),
        Index("ix_whatsapp_link_codes_business_user", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
