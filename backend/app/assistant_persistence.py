"""Assistant conversation persistence (Slice 4).

Conversations + messages so a chat survives across sessions and a
staff requester's pending proposal card is reachable by the owner in
their own session. This module writes NO business data — it only
bookkeeps the chat itself — so it does not go through the
assistant-write policy gate (``verdict()`` governs business writes
only); the tripwire test (``test_assistant_write_policy.py``) allows
exactly these routes as the named ``persistence`` set. Business
writes still reach the database only through
``app.assistant_execution``.

A proposal is never copied into a message: the message stores only
the proposal id, and the read path re-reads the proposal from its
own table, so a resumed card shows the proposal's CURRENT state — a
proposal whose 5 minutes elapsed reads ``expired``, honestly, never
as still-valid.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import assistant_execution as execution
from app.models import (
    AssistantConversation,
    AssistantMessage,
    AssistantProposal,
)

_TITLE_MAX = 160
_CONTENT_MAX = 10000
_LIST_LIMIT = 20
_LIST_LIMIT_MAX = 50
_ROLES = ("user", "assistant")


class ConversationNotFound(Exception):
    """No conversation with this id in this business."""


def _iso(value: datetime | None) -> str | None:
    # SQLite returns naive timestamps; normalize to aware UTC so every
    # timestamp in the API has the same shape (same rule as
    # assistant_execution.proposal_view).
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def _title_from(first_message: str) -> str:
    """The conversation title is the first user message, truncated to
    one line — never model-generated, never a guess."""
    single_line = " ".join(first_message.split())
    if len(single_line) <= _TITLE_MAX:
        return single_line
    return single_line[: _TITLE_MAX - 1].rstrip() + "…"


def create_conversation(
    session: Session,
    *,
    business_id: UUID,
    user_subject: str,
    title: str | None = None,
) -> AssistantConversation:
    """Start a conversation (no commit — the caller owns the transaction)."""
    if title is not None and len(title) > _TITLE_MAX:
        raise ValueError("Conversation title is too long.")
    # Timestamps are set here in Python (microsecond precision):
    # the database server default has only second precision, and two
    # rows created in the same second would otherwise tie on
    # created_at/updated_at and order nondeterministically.
    now = datetime.now(UTC)
    conversation = AssistantConversation(
        business_id=business_id,
        user_subject=user_subject,
        title=title.strip() if title and title.strip() else None,
        created_at=now,
        updated_at=now,
    )
    session.add(conversation)
    session.flush()
    return conversation


def get_conversation(
    session: Session, *, business_id: UUID, conversation_id: UUID
) -> AssistantConversation:
    """Load a conversation, business-scoped (any member may open any
    conversation in the business — the owner needs a staff requester's
    conversation to approve its proposal card)."""
    conversation = session.get(AssistantConversation, conversation_id)
    if conversation is None or conversation.business_id != business_id:
        raise ConversationNotFound("Conversation not found.")
    return conversation


def list_conversations(
    session: Session, *, business_id: UUID, limit: int = _LIST_LIMIT
) -> list[AssistantConversation]:
    """Most recently active first, so the history list shows the live
    threads at the top."""
    capped = max(1, min(limit, _LIST_LIMIT_MAX))
    return list(session.scalars(
        select(AssistantConversation)
        .where(AssistantConversation.business_id == business_id)
        .order_by(
            AssistantConversation.updated_at.desc(),
            AssistantConversation.created_at.desc(),
        )
        .limit(capped)
    ).all())


def append_message(
    session: Session,
    *,
    conversation: AssistantConversation,
    role: str,
    content: str,
    proposal_id: UUID | None = None,
) -> AssistantMessage:
    """Append one message (no commit — the caller owns the transaction).
    The conversation's updated_at moves so the history list re-orders
    by most recent activity."""
    if role not in _ROLES:
        raise ValueError("Message role must be 'user' or 'assistant'.")
    if not content.strip() or len(content) > _CONTENT_MAX:
        raise ValueError("Message content must be 1-10000 characters.")
    if proposal_id is not None:
        proposal = session.get(AssistantProposal, proposal_id)
        if proposal is None or proposal.business_id != conversation.business_id:
            raise ValueError("Proposal not found in this business.")
    message = AssistantMessage(
        conversation_id=conversation.id,
        business_id=conversation.business_id,
        role=role,
        content=content,
        proposal_id=proposal_id,
        # Explicit microsecond timestamp (see create_conversation):
        # two messages of one turn must never tie on created_at.
        created_at=datetime.now(UTC),
    )
    session.add(message)
    conversation.updated_at = datetime.now(UTC)
    session.flush()
    return message


def record_turn(
    session: Session,
    *,
    business_id: UUID,
    user_subject: str,
    conversation_id: UUID | None,
    user_message: str,
    assistant_answer: str,
    proposal_id: UUID | None = None,
) -> AssistantConversation:
    """Persist one chat turn atomically: the conversation (created from
    the first user message when no id is given) plus the user message
    and the assistant reply, in ONE transaction — a failed commit
    persists nothing, so a turn is never half-saved. The caller passes
    the assistant reply already computed; a persistence failure
    surfaces (the chat wrapper turns it into a 500) instead of
    silently dropping the turn."""
    if conversation_id is None:
        conversation = create_conversation(
            session, business_id=business_id, user_subject=user_subject,
            title=_title_from(user_message),
        )
    else:
        conversation = get_conversation(
            session, business_id=business_id, conversation_id=conversation_id
        )
    append_message(session, conversation=conversation, role="user", content=user_message)
    append_message(
        session, conversation=conversation, role="assistant",
        content=assistant_answer, proposal_id=proposal_id,
    )
    session.commit()
    session.refresh(conversation)
    return conversation


def conversation_view(conversation: AssistantConversation, *, message_count: int | None = None) -> dict:
    """The API shape of a conversation (derived values only, no ORM leakage)."""
    view: dict = {
        "id": str(conversation.id),
        "business_id": str(conversation.business_id),
        "user_subject": conversation.user_subject,
        "title": conversation.title,
        "created_at": _iso(conversation.created_at),
        "updated_at": _iso(conversation.updated_at),
    }
    if message_count is not None:
        view["message_count"] = message_count
    return view


def message_view(session: Session, message: AssistantMessage) -> dict:
    """The API shape of a message. The attached proposal is re-read
    from its own table on every call, so the returned state is the
    proposal's CURRENT state (``expired`` once its 5 minutes elapsed);
    a proposal row that no longer exists reads as ``None`` and the
    message itself is kept."""
    proposal = None
    if message.proposal_id is not None:
        row = session.get(AssistantProposal, message.proposal_id)
        if row is not None:
            proposal = execution.proposal_view(row)
    return {
        "id": str(message.id),
        "conversation_id": str(message.conversation_id),
        "role": message.role,
        "content": message.content,
        "proposal_id": str(message.proposal_id) if message.proposal_id else None,
        "proposal": proposal,
        "created_at": _iso(message.created_at),
    }


def conversation_detail_view(session: Session, conversation: AssistantConversation) -> dict:
    """A conversation with its messages in order, each with the
    CURRENT proposal state for its attached proposal."""
    messages = session.scalars(
        select(AssistantMessage)
        .where(AssistantMessage.conversation_id == conversation.id)
        .order_by(AssistantMessage.created_at.asc(), AssistantMessage.id.asc())
    ).all()
    return {
        **conversation_view(conversation, message_count=len(messages)),
        "messages": [message_view(session, message) for message in messages],
    }


def list_conversation_views(
    session: Session, *, business_id: UUID, limit: int = _LIST_LIMIT
) -> list[dict]:
    """History-list rows with message counts, in two queries (no N+1):
    the conversations ordered by most recent activity, plus one
    grouped count per conversation."""
    conversations = list_conversations(session, business_id=business_id, limit=limit)
    if not conversations:
        return []
    counts = dict(session.execute(
        select(
            AssistantMessage.conversation_id,
            func.count(AssistantMessage.id),
        )
        .where(AssistantMessage.conversation_id.in_([c.id for c in conversations]))
        .group_by(AssistantMessage.conversation_id)
    ).all())
    return [
        conversation_view(conversation, message_count=counts.get(conversation.id, 0))
        for conversation in conversations
    ]
