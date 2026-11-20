"""Create delegated platform roles and immutable access-change audit records.

Revision ID: 0004_platform_user_roles
Revises: 0003_business_workflows
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_platform_user_roles"
down_revision = "0003_business_workflows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_role_grants",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_subject", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("granted_by_subject", sa.String(length=128), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_by_subject", sa.String(length=128), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_reason", sa.String(length=500), nullable=False),
        sa.CheckConstraint(
            "role IN ('platform_viewer', 'workspace_operator', 'user_manager')",
            name="ck_platform_role_grants_allowed_role",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_subject", "role", name="uq_platform_role_user_role"),
    )
    op.create_index(
        "ix_platform_role_grants_user_subject",
        "platform_role_grants",
        ["user_subject"],
        unique=False,
    )
    op.create_table(
        "platform_admin_audit_events",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("actor_subject", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_subject", sa.String(length=128), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_platform_admin_audit_events_created_at",
        "platform_admin_audit_events",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_platform_admin_audit_events_created_at", table_name="platform_admin_audit_events")
    op.drop_table("platform_admin_audit_events")
    op.drop_index("ix_platform_role_grants_user_subject", table_name="platform_role_grants")
    op.drop_table("platform_role_grants")
