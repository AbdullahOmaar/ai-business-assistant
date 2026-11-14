"""Add secure business-scoped STAFF invitations.

Revision ID: 0006_business_invitations
Revises: 0005_employee_payroll
Create Date: 2026-11-14
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_business_invitations"
down_revision = "0005_employee_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "business_invitations",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("target_email", sa.String(length=254), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("invited_by_subject", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_subject", sa.String(length=128), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'revoked', 'expired')",
            name="ck_business_invitation_status",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_business_invitation_token_hash"),
    )
    op.create_index("ix_business_invitations_business_status", "business_invitations", ["business_id", "status"])
    op.create_index("ix_business_invitations_business_email", "business_invitations", ["business_id", "target_email"])


def downgrade() -> None:
    op.drop_index("ix_business_invitations_business_email", table_name="business_invitations")
    op.drop_index("ix_business_invitations_business_status", table_name="business_invitations")
    op.drop_table("business_invitations")
