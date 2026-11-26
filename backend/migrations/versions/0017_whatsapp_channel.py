"""Add the WhatsApp channel foundation (W-foundation).

Revision ID: 0017_whatsapp_channel
Revises: 0016_assistant_persistence
Create Date: 2026-11-26

WhatsApp channel foundation (WHATSAPP-CHANNEL-DESIGN.md §7/§9 W1):
the transport + linking data model only — no provider, number or
account is configured by this migration (those are owner decisions,
§8 of the design). Three new tables, all additive: no existing
table, column or calculation changes.

- ``whatsapp_links``: a team member's phone number bound to their
  account in one business ('linked'/'revoked'; revoked rows are the
  audit trail, so there is no unique constraint — one-active-link is
  enforced in app.whatsapp_linking).
- ``whatsapp_messages``: the channel ledger. The inbound provider
  message id (``wamid``) is UNIQUE — that is the webhook dedupe
  mechanism. Conversation/proposal links are by id only (SET NULL),
  the same pattern as assistant_messages.
- ``whatsapp_link_codes``: single-use linking codes, hash only,
  10-minute expiry.

Rollback/recovery: downgrade drops all three tables (messages and
codes first, links last — no FKs between them, order is cosmetic).
Applying this migration remains subject to the repository release
gates (exact SQL review and disposable PostgreSQL CI validation
first); the app does not auto-run migrations at startup.
"""
from alembic import op
import sqlalchemy as sa

revision = "0017_whatsapp_channel"
down_revision = "0016_assistant_persistence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("user_subject", sa.String(length=128), nullable=False),
        sa.Column("phone_e164", sa.String(length=32), nullable=False),
        sa.Column("wa_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('linked', 'revoked')",
            name="ck_whatsapp_links_status",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_whatsapp_links_business_wa",
        "whatsapp_links", ["business_id", "wa_id"],
    )
    op.create_index(
        "ix_whatsapp_links_business_user",
        "whatsapp_links", ["business_id", "user_subject"],
    )
    op.create_table(
        "whatsapp_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("wamid", sa.String(length=128), nullable=False),
        sa.Column("wa_id", sa.String(length=32), nullable=True),
        sa.Column("conversation_id", sa.Uuid(), nullable=True),
        sa.Column("proposal_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("body_preview", sa.String(length=500), nullable=True),
        sa.Column("template_name", sa.String(length=128), nullable=True),
        sa.Column("provider_status", sa.String(length=32), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.CheckConstraint(
            "direction IN ('in', 'out')",
            name="ck_whatsapp_messages_direction",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["assistant_conversations.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"], ["assistant_proposals.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("wamid", name="uq_whatsapp_messages_wamid"),
    )
    op.create_index(
        "ix_whatsapp_messages_business_created",
        "whatsapp_messages", ["business_id", "created_at"],
    )
    op.create_index(
        "ix_whatsapp_messages_business_wa",
        "whatsapp_messages", ["business_id", "wa_id"],
    )
    op.create_table(
        "whatsapp_link_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("user_subject", sa.String(length=128), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_whatsapp_link_codes_hash",
        "whatsapp_link_codes", ["code_hash"],
    )
    op.create_index(
        "ix_whatsapp_link_codes_business_user",
        "whatsapp_link_codes", ["business_id", "user_subject"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_whatsapp_link_codes_business_user",
        table_name="whatsapp_link_codes",
    )
    op.drop_index(
        "ix_whatsapp_link_codes_hash",
        table_name="whatsapp_link_codes",
    )
    op.drop_table("whatsapp_link_codes")
    op.drop_index(
        "ix_whatsapp_messages_business_wa",
        table_name="whatsapp_messages",
    )
    op.drop_index(
        "ix_whatsapp_messages_business_created",
        table_name="whatsapp_messages",
    )
    op.drop_table("whatsapp_messages")
    op.drop_index(
        "ix_whatsapp_links_business_user",
        table_name="whatsapp_links",
    )
    op.drop_index(
        "ix_whatsapp_links_business_wa",
        table_name="whatsapp_links",
    )
    op.drop_table("whatsapp_links")
