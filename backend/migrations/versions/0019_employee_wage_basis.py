"""Add the wage basis + trip wage on employees (3A-920 step 2).

Revision ID: 0019_employee_wage_basis
Revises: 0018_employee_driver_flag
Create Date: 2026-11-27

All additive, no existing column or calculation changes:

- ``employees.wage_basis``: 'monthly' (default, today's behavior),
  'daily' or 'per_trip'. A CHECK constraint pins the three values.
- ``employees.trip_wage``: the per-trip wage, nullable (only
  meaningful when the basis is per_trip).
- ``payroll_records.trips`` / ``payroll_records.work_days``: the
  units a payroll base was computed from — the record stays
  self-explanatory after the employee's basis changes later. Only
  one is ever set per record (trips for per_trip, work_days for
  daily, neither for monthly); both are nullable with >= 0 checks.

The base computation (app.employee_payroll_api): monthly stays
``monthly_salary`` (unchanged); daily is ``monthly_salary / 30 ×
work_days`` (the /30 divisor is the standard month derivation —
flagged on 3A-920 for the manager to correct if the owner meant a
separate daily-wage field); per_trip is ``trip_wage × trips``.
Net stays ``base + allowances + bonuses - deductions``, always
server-computed. Approved/paid records stay immutable (only drafts
are editable), so closed periods never change.

Rollback/recovery: downgrade drops the four columns. Applying this
migration remains subject to the repository release gates (exact SQL
review and disposable PostgreSQL CI validation first); the app does
not auto-run migrations at startup.
"""
import sqlalchemy as sa
from alembic import op

revision = "0019_employee_wage_basis"
down_revision = "0018_employee_driver_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("wage_basis", sa.String(length=16), server_default="monthly", nullable=False),
    )
    op.create_check_constraint(
        "ck_employees_wage_basis", "employees",
        "wage_basis IN ('monthly', 'daily', 'per_trip')",
    )
    op.add_column(
        "employees",
        sa.Column("trip_wage", sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        "payroll_records",
        sa.Column("trips", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_payroll_trips_nonnegative", "payroll_records",
        "trips IS NULL OR trips >= 0",
    )
    op.add_column(
        "payroll_records",
        sa.Column("work_days", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_payroll_work_days_nonnegative", "payroll_records",
        "work_days IS NULL OR work_days >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_payroll_work_days_nonnegative", "payroll_records", type_="check")
    op.drop_column("payroll_records", "work_days")
    op.drop_constraint("ck_payroll_trips_nonnegative", "payroll_records", type_="check")
    op.drop_column("payroll_records", "trips")
    op.drop_column("employees", "trip_wage")
    op.drop_constraint("ck_employees_wage_basis", "employees", type_="check")
    op.drop_column("employees", "wage_basis")
