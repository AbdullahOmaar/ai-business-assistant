"""Add the transport/delivery block on invoices (3A-920 step 4).

Revision ID: 0021_invoice_transport_block
Revises: 0020_product_second_unit
Create Date: 2026-11-27

All additive, no existing column or calculation changes:

- ``invoices.driver_employee_id`` + ``transport_trips`` +
  ``transport_from`` / ``transport_to``: the optional «بيانات النقل
  والتوصيل» block — who delivered, how many trips, from/to free text.
  Filled only while the company's master switch is on (the gate lives
  in app.services); all NULL for every invoice that never used it.
- ``invoices.transport_trip_wage``: the driver's trip wage
  snapshotted at ISSUE time (the delivery moment) as the proposed
  entitlement's basis — a later wage change never rewrites it.
- ``invoices.transport_entitlement_status``: NULL until issue, then
  'proposed'; payroll confirmation moves it to 'confirmed' (with
  ``transport_entitlement_payroll_id`` pointing at the draft payroll
  record it became), dismissal to 'dismissed', and voiding a
  still-proposed invoice to 'cancelled'. The entitlement is a
  PROPOSAL only — nothing here posts money automatically, ever.
- ``payroll_records`` gains the (id, business_id) unique constraint
  the composite entitlement FK needs (the same shape employees /
  invoices / customers already carry).

Rollback/recovery: downgrade drops the FKs, the checks, the unique
constraint and the seven columns. Applying this migration remains
subject to the repository release gates (exact SQL review and
disposable PostgreSQL CI validation first); the app does not
auto-run migrations at startup.
"""
import sqlalchemy as sa
from alembic import op

revision = "0021_invoice_transport_block"
down_revision = "0020_product_second_unit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("driver_employee_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("transport_trips", sa.Integer(), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("transport_from", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("transport_to", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("transport_trip_wage", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("transport_entitlement_status", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "invoices",
        sa.Column("transport_entitlement_payroll_id", sa.Uuid(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_payroll_records_id_business", "payroll_records", ["id", "business_id"]
    )
    op.create_foreign_key(
        "fk_invoices_driver_business", "invoices", "employees",
        ["driver_employee_id", "business_id"], ["id", "business_id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_invoices_entitlement_payroll_business", "invoices", "payroll_records",
        ["transport_entitlement_payroll_id", "business_id"], ["id", "business_id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_invoice_transport_trips_nonnegative", "invoices",
        "transport_trips IS NULL OR transport_trips >= 0",
    )
    op.create_check_constraint(
        "ck_invoice_transport_entitlement_status", "invoices",
        "transport_entitlement_status IS NULL OR transport_entitlement_status "
        "IN ('proposed', 'confirmed', 'dismissed', 'cancelled')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_invoice_transport_entitlement_status", "invoices", type_="check"
    )
    op.drop_constraint(
        "ck_invoice_transport_trips_nonnegative", "invoices", type_="check"
    )
    op.drop_constraint(
        "fk_invoices_entitlement_payroll_business", "invoices", type_="foreignkey"
    )
    op.drop_constraint("fk_invoices_driver_business", "invoices", type_="foreignkey")
    op.drop_constraint("uq_payroll_records_id_business", "payroll_records", type_="unique")
    op.drop_column("invoices", "transport_entitlement_payroll_id")
    op.drop_column("invoices", "transport_entitlement_status")
    op.drop_column("invoices", "transport_trip_wage")
    op.drop_column("invoices", "transport_to")
    op.drop_column("invoices", "transport_from")
    op.drop_column("invoices", "transport_trips")
    op.drop_column("invoices", "driver_employee_id")
