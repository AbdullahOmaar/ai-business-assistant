"""Create initial business workspaces and memberships.

Revision ID: 0001_initial_businesses
Revises:
Create Date: 2026-10-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_businesses"
down_revision = None
branch_labels = None
depends_on = None

membership_role = postgresql.ENUM(
    "owner",
    "staff",
    name="business_membership_role",
    create_type=False,
)


def upgrade() -> None:
    membership_role.create(op.get_bind(), checkfirst=False)

    op.create_table(
        "businesses",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("locale", sa.String(length=16), server_default="en", nullable=False),
        sa.Column("timezone", sa.String(length=64), server_default="UTC", nullable=False),
        sa.Column("contact_email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "business_memberships",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("user_subject", sa.String(length=128), nullable=False),
        sa.Column("role", membership_role, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name="fk_business_memberships_business_id_businesses",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id",
            "user_subject",
            name="uq_business_user_subject",
        ),
    )


def downgrade() -> None:
    op.drop_table("business_memberships")
    op.drop_table("businesses")
    membership_role.drop(op.get_bind(), checkfirst=False)
