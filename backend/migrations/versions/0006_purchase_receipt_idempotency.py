"""Persist business-scoped idempotency results for purchase-order receipts.

Revision ID: 0006_purchase_receipt_idempotency
Revises: 0005_employee_payroll
Create Date: 2026-11-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_purchase_receipt_idempotency"
down_revision = "0005_employee_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purchase_receipt_idempotency",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("purchase_order_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_status", sa.Integer(), server_default="200", nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("length(idempotency_key) BETWEEN 1 AND 128", name="ck_purchase_receipt_idempotency_key_length"),
        sa.CheckConstraint("length(request_hash) = 64", name="ck_purchase_receipt_idempotency_hash_length"),
        sa.CheckConstraint("response_status BETWEEN 100 AND 599", name="ck_purchase_receipt_idempotency_response_status"),
        sa.ForeignKeyConstraint(
            ["purchase_order_id", "business_id"],
            ["purchase_orders.id", "purchase_orders.business_id"],
            name="fk_purchase_receipt_idempotency_order_business",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('business_id', 'idempotency_key', name='uq_purchase_receipt_idempotency_business_key'),
    )
    op.create_index(
        "ix_purchase_receipt_idempotency_order_created",
        "purchase_receipt_idempotency",
        ["business_id", "purchase_order_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_purchase_receipt_idempotency_order_created",
        table_name="purchase_receipt_idempotency",
    )
    op.drop_table("purchase_receipt_idempotency")
