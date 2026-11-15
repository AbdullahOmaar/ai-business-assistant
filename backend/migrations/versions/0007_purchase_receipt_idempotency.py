"""Add durable purchase-receipt idempotency identities.

Revision ID: 0007_receipt_idem
Revises: 0006_business_invitations
Create Date: 2026-11-15

Additive T39 receipt-replay table. Owner-authorized for the synthetic pre-release environment after exact migration review, PostgreSQL CI validation, and rollback/recovery planning. Production application remains subject to release gates.
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_receipt_idem"
down_revision = "0006_business_invitations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purchase_receipt_idempotency",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("purchase_order_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=36), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "length(idempotency_key) = 36",
            name="ck_purchase_receipt_idempotency_key_length",
        ),
        sa.CheckConstraint(
            "length(request_hash) = 64",
            name="ck_purchase_receipt_idempotency_hash_length",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"],
            name="fk_purchase_receipt_idempotency_business",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["purchase_order_id", "business_id"],
            ["purchase_orders.id", "purchase_orders.business_id"],
            name="fk_purchase_receipt_idempotency_order_business",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "purchase_order_id", "idempotency_key",
            name="uq_purchase_receipt_idempotency_scope_key",
        ),
        sa.UniqueConstraint(
            "id", "business_id",
            name="uq_purchase_receipt_idempotency_id_business",
        ),
    )
    op.create_index(
        "ix_purchase_receipt_idempotency_order_created",
        "purchase_receipt_idempotency",
        ["business_id", "purchase_order_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_purchase_receipt_idempotency_order_created",
        table_name="purchase_receipt_idempotency",
    )
    op.drop_table("purchase_receipt_idempotency")
