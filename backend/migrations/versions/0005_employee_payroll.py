"""Add business employees and auditable payroll records.

Revision ID: 0005_employee_payroll
Revises: 0004_platform_user_roles
Create Date: 2026-10-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_employee_payroll"
down_revision = "0004_platform_user_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite target keys guarantee payroll links cannot cross business boundaries.
    op.create_unique_constraint(
        "uq_expenses_id_business", "expenses", ["id", "business_id"]
    )
    op.create_table(
        "employees",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("employee_code", sa.String(length=40), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("department", sa.String(length=120), nullable=True),
        sa.Column("job_title", sa.String(length=120), nullable=True),
        sa.Column("monthly_salary", sa.Numeric(14, 2), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("monthly_salary > 0", name="ck_employees_salary_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_employees_id_business"),
        sa.UniqueConstraint("business_id", "employee_code", name="uq_employees_business_code"),
        sa.UniqueConstraint("business_id", "email", name="uq_employees_business_email"),
    )
    op.create_index(
        "ix_employees_business_active_name", "employees",
        ["business_id", "is_active", "name"], unique=False
    )
    op.create_table(
        "payroll_records",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("employee_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("period", sa.String(length=7), nullable=False),
        sa.Column("base_salary", sa.Numeric(14, 2), nullable=False),
        sa.Column("allowances", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("bonuses", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("deductions", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("net_pay", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("expense_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("created_by_subject", sa.String(length=128), nullable=False),
        sa.Column("approved_by_subject", sa.String(length=128), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_by_subject", sa.String(length=128), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("allowances >= 0", name="ck_payroll_allowances_nonnegative"),
        sa.CheckConstraint("base_salary > 0", name="ck_payroll_base_salary_positive"),
        sa.CheckConstraint("bonuses >= 0", name="ck_payroll_bonuses_nonnegative"),
        sa.CheckConstraint("deductions >= 0", name="ck_payroll_deductions_nonnegative"),
        sa.CheckConstraint("net_pay > 0", name="ck_payroll_net_pay_positive"),
        sa.CheckConstraint("status IN ('draft', 'approved', 'paid')", name="ck_payroll_status"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["employee_id", "business_id"],
            ["employees.id", "employees.business_id"],
            name="fk_payroll_employee_business",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["expense_id", "business_id"],
            ["expenses.id", "expenses.business_id"],
            name="fk_payroll_expense_business",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "employee_id", "period", name="uq_payroll_employee_period"),
        sa.UniqueConstraint("expense_id", name="uq_payroll_expense"),
    )
    op.create_index(
        "ix_payroll_business_period_status", "payroll_records",
        ["business_id", "period", "status"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_payroll_business_period_status", table_name="payroll_records")
    op.drop_table("payroll_records")
    op.drop_index("ix_employees_business_active_name", table_name="employees")
    op.drop_table("employees")
    op.drop_constraint("uq_expenses_id_business", "expenses", type_="unique")
