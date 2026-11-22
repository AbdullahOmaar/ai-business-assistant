"""Add durable manual stock-movement idempotency identities.

Revision ID: 0010_stock_movement_idem
Revises: 0009_demo_rate_limit_counters
Create Date: 2026-11-22

Additive table only, mirroring 0007_receipt_idem: a business-scoped unique
Idempotency-Key, the canonical request hash, and the original response
snapshot, so a retried manual stock movement replays its first result
instead of recording a second movement. No existing table, column, or row
is touched.

Rollback/recovery: the table is referenced by nothing else and holds no
business data of its own beyond replay identities. Downgrade drops the
index and the table; already-recorded stock movements are unaffected.
Applying this migration to the synthetic pre-release environment remains
subject to the repository release gates (exact SQL review and disposable
PostgreSQL CI validation first).
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_stock_movement_idem"
down_revision = "0009_demo_rate_limit_counters"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_movement_idempotency",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=36), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "length(idempotency_key) = 36",
            name="ck_stock_movement_idempotency_key_length",
        ),
        sa.CheckConstraint(
            "length(request_hash) = 64",
            name="ck_stock_movement_idempotency_hash_length",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"],
            name="fk_stock_movement_idempotency_business",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "idempotency_key",
            name="uq_stock_movement_idempotency_scope_key",
        ),
        sa.UniqueConstraint(
            "id", "business_id",
            name="uq_stock_movement_idempotency_id_business",
        ),
    )
    op.create_index(
        "ix_stock_movement_idempotency_business_created",
        "stock_movement_idempotency",
        ["business_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_stock_movement_idempotency_business_created",
        table_name="stock_movement_idempotency",
    )
    op.drop_table("stock_movement_idempotency")
