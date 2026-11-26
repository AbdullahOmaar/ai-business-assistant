"""Add assistant conversation persistence (Slice 4).

Revision ID: 0016_assistant_persistence
Revises: 0015_assistant_execution
Create Date: 2026-11-25

Assistant persistence (DESIGN.md §5/§7, ASSISTANT-BUILD-PLAN.md
Slice 4): conversations + messages so a chat survives across
sessions and a staff requester's pending proposal card is reachable
by the owner in their own session. Two new tables, both additive:
no existing table, column or calculation changes. A conversation
belongs to a business + the user who started it; messages carry
role/content + the proposal id when the message carries a proposal
card — the proposal itself is never copied into the message, so a
resumed card re-reads the proposal's current state (5-minute expiry
derived on read).

Rollback/recovery: downgrade drops both tables (messages first).
Applying this migration remains subject to the repository release
gates (exact SQL review and disposable PostgreSQL CI validation
first); the app does not auto-run migrations at startup.
"""
from alembic import op
import sqlalchemy as sa

revision = "0016_assistant_persistence"
down_revision = "0015_assistant_execution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("user_subject", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_conversations_business_updated",
        "assistant_conversations", ["business_id", "updated_at"],
    )
    op.create_index(
        "ix_assistant_conversations_business_subject",
        "assistant_conversations", ["business_id", "user_subject"],
    )
    op.create_table(
        "assistant_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("proposal_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_assistant_messages_role",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["assistant_conversations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"], ["assistant_proposals.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_messages_conversation_created",
        "assistant_messages", ["conversation_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_messages_conversation_created",
        table_name="assistant_messages",
    )
    op.drop_table("assistant_messages")
    op.drop_index(
        "ix_assistant_conversations_business_subject",
        table_name="assistant_conversations",
    )
    op.drop_index(
        "ix_assistant_conversations_business_updated",
        table_name="assistant_conversations",
    )
    op.drop_table("assistant_conversations")
