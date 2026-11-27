"""Add the driver/delivery-agent flag on employees (3A-920 step 1).

Revision ID: 0018_employee_driver_flag
Revises: 0017_whatsapp_channel
Create Date: 2026-11-27

One additive column, no existing column or calculation changes:

- ``employees.is_driver``: whether the employee is enrolled as a
  driver/delivery agent. It is the flag that makes an employee appear
  in the invoice drivers list (step 4) — a free-text job title alone
  never enrolls anyone. Default false for every existing row; the
  flag is only settable while the per-business transport switch
  (``transport.enabled``) is on, enforced in
  app.employee_payroll_api — turning the switch off never clears the
  stored flag, it only hides the tag.

Rollback/recovery: downgrade drops the column. Applying this
migration remains subject to the repository release gates (exact SQL
review and disposable PostgreSQL CI validation first); the app does
not auto-run migrations at startup.
"""
import sqlalchemy as sa
from alembic import op

revision = "0018_employee_driver_flag"
down_revision = "0017_whatsapp_channel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("is_driver", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("employees", "is_driver")
