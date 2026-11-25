"""Add assistant execution proposals and confirmation opt-outs (Slice 1).

Revision ID: 0015_assistant_execution
Revises: 0014_org_structure
Create Date: 2026-11-25

Assistant execution foundation (DESIGN.md §5/§7, owner decisions
2026-11-25): proposals bind an action to its exact payload (hash),
approvals are one-use and expire 5 minutes after creation, and an
owner may waive the second-approval question per action ("don't ask
again"). Two new tables, both additive: no existing table, column or
calculation changes. Proposal expiry is derived on read, so the
``expired`` status value exists in the check constraint but is never
written by a lazy migration-side transition.

Rollback/recovery: downgrade drops both tables (opt-outs first).
Applying this migration remains subject to the repository release
gates (exact SQL review and disposable PostgreSQL CI validation
first); the app does not auto-run migrations at startup.
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_assistant_execution"
down_revision = "0014_org_structure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_proposals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("requester_subject", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("approver_subject", sa.String(length=128), nullable=True),
        sa.Column("approved_action", sa.String(length=80), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_target_type", sa.String(length=80), nullable=True),
        sa.Column("result_target_id", sa.String(length=128), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('proposed', 'approved', 'executing', 'executed', 'expired', 'rejected')",
            name="ck_assistant_proposals_status",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_proposals_business_created",
        "assistant_proposals", ["business_id", "created_at"],
    )
    op.create_index(
        "ix_assistant_proposals_business_status",
        "assistant_proposals", ["business_id", "status"],
    )
    op.create_table(
        "assistant_confirmation_opt_outs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("user_subject", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "user_subject", "action",
            name="uq_assistant_opt_outs_business_user_action",
        ),
    )
    op.create_index(
        "ix_assistant_opt_outs_business_user",
        "assistant_confirmation_opt_outs", ["business_id", "user_subject"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_opt_outs_business_user",
        table_name="assistant_confirmation_opt_outs",
    )
    op.drop_table("assistant_confirmation_opt_outs")
    op.drop_index(
        "ix_assistant_proposals_business_status",
        table_name="assistant_proposals",
    )
    op.drop_index(
        "ix_assistant_proposals_business_created",
        table_name="assistant_proposals",
    )
    op.drop_table("assistant_proposals")
