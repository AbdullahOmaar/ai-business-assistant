"""Database models: people domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Employee(Base):
    """Business-scoped employee profile; intentionally separate from login membership."""

    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_employees_id_business"),
        UniqueConstraint("business_id", "employee_code", name="uq_employees_business_code"),
        UniqueConstraint("business_id", "email", name="uq_employees_business_email"),
        CheckConstraint("monthly_salary > 0", name="ck_employees_salary_positive"),
        CheckConstraint(
            "wage_basis IN ('monthly', 'daily', 'per_trip')",
            name="ck_employees_wage_basis",
        ),
        Index("ix_employees_business_active_name", "business_id", "is_active", "name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    employee_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Org assignment (C8): the free-text `department` above stays as legacy
    # display text; the FKs below are the authoritative structure.
    department_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    team_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 3A-920 step 1: enrolled as a driver/delivery agent. Only this flag
    # (never a free-text job title) puts an employee in the invoice
    # drivers list; settable only while transport.enabled is on.
    is_driver: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # 3A-920 step 2: wage basis — 'monthly' (default, today's behavior),
    # 'daily' (monthly_salary / 30 per day) or 'per_trip' (trip_wage per
    # trip). The per_trip option is only selectable while
    # transport.enabled is on (enforced in app.employee_payroll_api).
    wage_basis: Mapped[str] = mapped_column(String(16), nullable=False, default="monthly", server_default="monthly")
    trip_wage: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    monthly_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PayrollRecord(Base):
    """One immutable-period payroll draft with a server-calculated total and expense link."""

    __tablename__ = "payroll_records"
    __table_args__ = (
        ForeignKeyConstraint(
            ["employee_id", "business_id"],
            ["employees.id", "employees.business_id"],
            name="fk_payroll_employee_business",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["expense_id", "business_id"],
            ["expenses.id", "expenses.business_id"],
            name="fk_payroll_expense_business",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("business_id", "employee_id", "period", name="uq_payroll_employee_period"),
        UniqueConstraint("id", "business_id", name="uq_payroll_records_id_business"),
        UniqueConstraint("expense_id", name="uq_payroll_expense"),
        CheckConstraint("base_salary > 0", name="ck_payroll_base_salary_positive"),
        CheckConstraint("allowances >= 0", name="ck_payroll_allowances_nonnegative"),
        CheckConstraint("bonuses >= 0", name="ck_payroll_bonuses_nonnegative"),
        CheckConstraint("deductions >= 0", name="ck_payroll_deductions_nonnegative"),
        CheckConstraint("net_pay > 0", name="ck_payroll_net_pay_positive"),
        CheckConstraint("trips IS NULL OR trips >= 0", name="ck_payroll_trips_nonnegative"),
        CheckConstraint("work_days IS NULL OR work_days >= 0", name="ck_payroll_work_days_nonnegative"),
        CheckConstraint("status IN ('draft', 'approved', 'paid')", name="ck_payroll_status"),
        Index("ix_payroll_business_period_status", "business_id", "period", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    # 3A-920 step 2: the units the base was computed from — the record
    # stays self-explanatory after the employee's basis changes later.
    # Only one is ever set (trips for per_trip, work_days for daily).
    trips: Mapped[int | None] = mapped_column(Integer, nullable=True)
    work_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    allowances: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0), server_default="0")
    bonuses: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0), server_default="0")
    deductions: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0), server_default="0")
    net_pay: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    expense_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    approved_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PayrollPayment(Base):
    """One payment event against a payroll record (3A-920 step 5).

    Partial salary payment: every payment is its own row linked to its
    own Payroll expense, and the record's paid total is the SUM of its
    payments. The record flips to 'paid' only when the sum reaches the
    net pay; until then it stays 'approved' with a remainder due.
    """

    __tablename__ = "payroll_payments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["payroll_record_id", "business_id"],
            ["payroll_records.id", "payroll_records.business_id"],
            name="fk_payroll_payment_record_business",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["expense_id", "business_id"],
            ["expenses.id", "expenses.business_id"],
            name="fk_payroll_payment_expense_business",
            ondelete="RESTRICT",
        ),
        CheckConstraint("amount > 0", name="ck_payroll_payment_amount_positive"),
        Index("ix_payroll_payments_business_record", "business_id", "payroll_record_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    payroll_record_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    expense_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

