"""Business-scoped employee directory and payroll workflow.

Payroll totals are always calculated on the server. Payments against
an approved record are written as Payroll expenses through the
payroll_payments ledger (3A-920 step 5): a partial payment keeps the
remainder due, and the record is marked paid only when its payments
sum to the net pay.
"""
import re
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import (
    AuditEvent,
    Business,
    Employee,
    Expense,
    Invoice,
    MembershipRole,
    PayrollPayment,
    PayrollRecord,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)
from app.transport_settings import (
    DEFAULT_DAILY_DIVISOR,
    daily_divisor,
    transport_enabled,
    transport_unit_name,
)

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["employees and payroll"])
CENT = Decimal("0.01")
PERIOD_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class EmployeeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    employee_code: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    department: str | None = Field(default=None, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    # 3A-920 step 1: driver/delivery-agent enrolment. Only settable while
    # the transport switch is on (enforced in the endpoints below).
    is_driver: bool = False
    # 3A-920 step 2: wage basis. 'per_trip' is only selectable while the
    # transport switch is on (enforced in the endpoints below).
    wage_basis: str = Field(default="monthly", pattern=r"^(monthly|daily|per_trip)$")
    trip_wage: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    monthly_salary: Decimal = Field(gt=0, max_digits=14, decimal_places=2)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Employee name is required")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().lower()
        if len(normalized) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Enter a valid employee email address")
        return normalized

    @field_validator("employee_code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        normalized = value.strip().upper() if value and value.strip() else None
        return normalized


class EmployeeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    employee_code: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    department: str | None = Field(default=None, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    monthly_salary: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    is_active: bool | None = None
    is_driver: bool | None = None
    wage_basis: str | None = Field(default=None, pattern=r"^(monthly|daily|per_trip)$")
    trip_wage: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Employee name cannot be empty")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().lower()
        if len(normalized) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Enter a valid employee email address")
        return normalized

    @field_validator("employee_code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value and value.strip() else None


class PayrollCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    allowances: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    bonuses: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    deductions: Decimal = Field(default=Decimal(0), ge=0, max_digits=14, decimal_places=2)
    # 3A-920 step 2: the units the base is computed from — trips for a
    # per_trip basis, work_days for a daily basis. Monthly takes neither.
    # (Manual entry for now; step 4 derives the trip count from invoices.)
    trips: int | None = Field(default=None, ge=0)
    work_days: int | None = Field(default=None, ge=0, le=31)


class PayrollUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowances: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    bonuses: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    deductions: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)


def _owner(session: Session, principal: AuthenticatedPrincipal, business_id: UUID) -> None:
    try:
        authorize_membership(
            session, principal=principal, business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
    except AuthorizationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def _commit(session: Session, action):
    try:
        result = action()
        session.commit()
        return result
    except HTTPException:
        session.rollback()
        raise
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The operation conflicts with existing employee or payroll data.",
        ) from exc
    except Exception:
        session.rollback()
        raise


def _audit(session: Session, business_id: UUID, actor: str, action: str,
           target_type: str, target_id: UUID, summary: str) -> None:
    session.add(AuditEvent(
        business_id=business_id,
        actor_subject=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        change_summary=summary,
    ))


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _compute_payroll_base(
    employee: Employee, body: "PayrollCreate", *, daily_divisor: int = DEFAULT_DAILY_DIVISOR
) -> Decimal:
    """Server-computed payroll base for one employee + period (3A-920
    step 2). The units must match the basis — anything else is a 422,
    so a record can never be ambiguous about how its base was built.
    The daily divisor is the company's own setting (default 30 —
    manager ruling 2026-11-27), read at creation time only."""
    basis = employee.wage_basis
    if basis == "per_trip":
        if body.trips is None:
            raise HTTPException(status_code=422, detail="Trip count is required for per-trip pay.")
        if body.work_days is not None:
            raise HTTPException(status_code=422, detail="Work days do not apply to per-trip pay.")
        if employee.trip_wage is None:
            raise HTTPException(status_code=422, detail="Trip wage is not set for this employee.")
        return _money(employee.trip_wage * body.trips)
    if basis == "daily":
        if body.work_days is None:
            raise HTTPException(status_code=422, detail="Work days are required for daily pay.")
        if body.trips is not None:
            raise HTTPException(status_code=422, detail="Trip count does not apply to daily pay.")
        return _money(employee.monthly_salary / Decimal(daily_divisor) * body.work_days)
    if body.trips is not None or body.work_days is not None:
        raise HTTPException(status_code=422, detail="Trip count and work days do not apply to monthly pay.")
    return _money(employee.monthly_salary)


def _employee_dict(employee: Employee) -> dict:
    return {
        "id": str(employee.id),
        "business_id": str(employee.business_id),
        "employee_code": employee.employee_code,
        "name": employee.name,
        "email": employee.email,
        "phone": employee.phone,
        "department": employee.department,
        "job_title": employee.job_title,
        "is_driver": employee.is_driver,
        "wage_basis": employee.wage_basis,
        "trip_wage": str(employee.trip_wage) if employee.trip_wage is not None else None,
        "monthly_salary": str(employee.monthly_salary),
        "is_active": employee.is_active,
        "created_at": employee.created_at.isoformat() if employee.created_at else None,
        "updated_at": employee.updated_at.isoformat() if employee.updated_at else None,
    }


def _paid_amount(session: Session, *, business_id: UUID, payroll_record_id: UUID) -> Decimal:
    """3A-920 step 5: the sum of a record's payment events (0 when none)."""
    total = session.scalar(
        select(func.coalesce(func.sum(PayrollPayment.amount), 0)).where(
            PayrollPayment.business_id == business_id,
            PayrollPayment.payroll_record_id == payroll_record_id,
        )
    )
    return _money(Decimal(total))


def _payroll_dict(
    record: PayrollRecord, employee_name: str, paid_amount: Decimal = Decimal(0)
) -> dict:
    paid = _money(paid_amount)
    return {
        "id": str(record.id),
        "business_id": str(record.business_id),
        "employee_id": str(record.employee_id),
        "employee_name": employee_name,
        "period": record.period,
        "trips": record.trips,
        "work_days": record.work_days,
        "base_salary": str(record.base_salary),
        "allowances": str(record.allowances),
        "bonuses": str(record.bonuses),
        "deductions": str(record.deductions),
        "net_pay": str(record.net_pay),
        # 3A-920 step 5: partial-payment progress, derived from the
        # payments ledger — the record's status stays 'approved' until
        # the remainder reaches zero.
        "paid_amount": str(paid),
        "remaining_amount": str(_money(record.net_pay - paid)),
        "status": record.status,
        "expense_id": str(record.expense_id) if record.expense_id else None,
        "approved_by_subject": record.approved_by_subject,
        "approved_at": record.approved_at.isoformat() if record.approved_at else None,
        "paid_by_subject": record.paid_by_subject,
        "paid_at": record.paid_at.isoformat() if record.paid_at else None,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


@router.get("/employees")
def list_employees(
    business_id: UUID,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    active_only: bool = False,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    query = select(Employee).where(Employee.business_id == business_id)
    if active_only:
        query = query.where(Employee.is_active.is_(True))
    rows = session.scalars(query.order_by(Employee.name, Employee.id).offset(offset).limit(limit)).all()
    return [_employee_dict(row) for row in rows]


@router.post("/employees", status_code=201)
def create_employee(
    business_id: UUID,
    body: EmployeeCreate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def operation():
        _owner(session, principal, business_id)
        # 3A-920: enrolling a driver / choosing the per-trip basis are
        # transport writes — rejected while the switch is off. Stored
        # flags and bases are never cleared by this gate; the trip_wage
        # number itself is inert data and stays settable.
        if (body.is_driver or body.wage_basis == "per_trip") and not transport_enabled(session, business_id=business_id):
            raise HTTPException(
                status_code=422,
                detail="Transport is disabled for this business.",
            )
        business = session.scalars(
            select(Business).where(Business.id == business_id, Business.is_active.is_(True))
        ).one_or_none()
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found")
        code = body.employee_code.strip().upper() if body.employee_code else None
        email = body.email.strip().lower() if body.email else None
        if email and session.scalars(select(Employee.id).where(
            Employee.business_id == business_id,
            Employee.email == email,
        )).first() is not None:
            raise HTTPException(status_code=409, detail="An employee with this email already exists.")
        if code and session.scalars(select(Employee.id).where(
            Employee.business_id == business_id,
            Employee.employee_code == code,
        )).first() is not None:
            raise HTTPException(status_code=409, detail="An employee with this code already exists.")
        employee = Employee(
            business_id=business_id,
            employee_code=code,
            name=body.name,
            email=email,
            phone=body.phone.strip() if body.phone and body.phone.strip() else None,
            department=body.department.strip() if body.department and body.department.strip() else None,
            job_title=body.job_title.strip() if body.job_title and body.job_title.strip() else None,
            is_driver=body.is_driver,
            wage_basis=body.wage_basis,
            trip_wage=_money(body.trip_wage) if body.trip_wage is not None else None,
            monthly_salary=_money(body.monthly_salary),
            is_active=True,
        )
        session.add(employee)
        session.flush()
        _audit(session, business_id, principal.subject, "employee.created", "employee", employee.id,
               "Employee profile created.")
        return employee

    return _employee_dict(_commit(session, operation))


@router.patch("/employees/{employee_id}")
def update_employee(
    business_id: UUID,
    employee_id: UUID,
    body: EmployeeUpdate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one employee field must be supplied.")
    if "name" in changes and changes["name"] is None:
        raise HTTPException(status_code=422, detail="Employee name cannot be null.")
    if "monthly_salary" in changes and changes["monthly_salary"] is None:
        raise HTTPException(status_code=422, detail="Monthly salary cannot be null.")
    if "is_active" in changes and changes["is_active"] is None:
        raise HTTPException(status_code=422, detail="Employee active status cannot be null.")
    if "is_driver" in changes and changes["is_driver"] is None:
        raise HTTPException(status_code=422, detail="Driver flag cannot be null.")
    if "wage_basis" in changes and changes["wage_basis"] is None:
        raise HTTPException(status_code=422, detail="Wage basis cannot be null.")

    def operation():
        _owner(session, principal, business_id)
        employee = session.scalars(
            select(Employee).where(
                Employee.id == employee_id, Employee.business_id == business_id
            ).with_for_update()
        ).one_or_none()
        if employee is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        # 3A-920: the gate blocks NEW transport enrolments while the
        # switch is off. Keeping the stored flag/basis is not a new
        # enrolment — editing any other field of a stored driver or
        # per-trip employee stays possible while off (the form always
        # re-sends the stored values). Clearing either (False / monthly)
        # is always allowed.
        if not transport_enabled(session, business_id=business_id):
            if changes.get("is_driver") is True and not employee.is_driver:
                raise HTTPException(
                    status_code=422,
                    detail="Transport is disabled for this business.",
                )
            if changes.get("wage_basis") == "per_trip" and employee.wage_basis != "per_trip":
                raise HTTPException(
                    status_code=422,
                    detail="Transport is disabled for this business.",
                )
        if "employee_code" in changes:
            code = changes["employee_code"]
            if code and session.scalars(select(Employee.id).where(
                Employee.business_id == business_id,
                Employee.employee_code == code,
                Employee.id != employee_id,
            )).first() is not None:
                raise HTTPException(status_code=409, detail="An employee with this code already exists.")
        if "email" in changes:
            email = changes["email"]
            if email and session.scalars(select(Employee.id).where(
                Employee.business_id == business_id,
                Employee.email == email,
                Employee.id != employee_id,
            )).first() is not None:
                raise HTTPException(status_code=409, detail="An employee with this email already exists.")
        for key, value in changes.items():
            if key in {"phone", "department", "job_title"} and value is not None:
                value = value.strip() or None
            setattr(employee, key, value)
        session.flush()
        _audit(session, business_id, principal.subject, "employee.updated", "employee", employee.id,
               "Employee fields updated: " + ", ".join(sorted(changes.keys())) + ".")
        return employee

    return _employee_dict(_commit(session, operation))


@router.get("/payroll")
def list_payroll(
    business_id: UUID,
    period: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    query = (
        select(PayrollRecord, Employee.name)
        .join(Employee, (Employee.id == PayrollRecord.employee_id) &
              (Employee.business_id == PayrollRecord.business_id))
        .where(PayrollRecord.business_id == business_id)
    )
    if period:
        query = query.where(PayrollRecord.period == period)
    rows = session.execute(
        query.order_by(PayrollRecord.period.desc(), Employee.name, PayrollRecord.id)
        .offset(offset).limit(limit)
    ).all()
    # 3A-920 step 5: one grouped sum for the whole page, not one per row.
    paid_by_record: dict[UUID, Decimal] = {}
    record_ids = [record.id for record, _ in rows]
    if record_ids:
        sums = session.execute(
            select(
                PayrollPayment.payroll_record_id,
                func.coalesce(func.sum(PayrollPayment.amount), 0),
            )
            .where(
                PayrollPayment.business_id == business_id,
                PayrollPayment.payroll_record_id.in_(record_ids),
            )
            .group_by(PayrollPayment.payroll_record_id)
        ).all()
        paid_by_record = {record_id: Decimal(total) for record_id, total in sums}
    return [
        _payroll_dict(record, employee_name, paid_by_record.get(record.id, Decimal(0)))
        for record, employee_name in rows
    ]


@router.post("/employees/{employee_id}/payroll", status_code=201)
def create_payroll(
    business_id: UUID,
    employee_id: UUID,
    body: PayrollCreate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def operation():
        _owner(session, principal, business_id)
        employee = session.scalars(
            select(Employee).where(
                Employee.id == employee_id,
                Employee.business_id == business_id,
                Employee.is_active.is_(True),
            ).with_for_update()
        ).one_or_none()
        if employee is None:
            raise HTTPException(status_code=404, detail="Active employee not found")
        # 3A-920 step 2: the base branches on the employee's wage basis —
        # the net formula never changes (base + allowances + bonuses -
        # deductions), and the base is always server-computed. Monthly is
        # today's behavior, unchanged. Daily derives from the monthly
        # salary (/ the company's daily divisor, default 30 — manager
        # ruling 2026-11-27); per-trip multiplies the trip wage by the
        # trip count (manual entry now; step 4 derives it from invoices).
        # Payroll for an already per-trip employee keeps working while
        # the switch is off — the basis is stored data, and blocking pay
        # would strand the employee; the gate governs NEW transport
        # enrolments (flag / per-trip basis), not the pay that follows.
        base_salary = _compute_payroll_base(
            employee, body, daily_divisor=daily_divisor(session, business_id=business_id)
        )
        net_pay = _money(base_salary + body.allowances + body.bonuses - body.deductions)
        if net_pay <= 0:
            raise HTTPException(status_code=422, detail="Deductions must be lower than total earnings.")
        record = PayrollRecord(
            business_id=business_id,
            employee_id=employee.id,
            period=body.period,
            trips=body.trips,
            work_days=body.work_days,
            base_salary=base_salary,
            allowances=_money(body.allowances),
            bonuses=_money(body.bonuses),
            deductions=_money(body.deductions),
            net_pay=net_pay,
            status="draft",
            created_by_subject=principal.subject,
        )
        session.add(record)
        session.flush()
        _audit(session, business_id, principal.subject, "payroll.created", "payroll", record.id,
               f"Payroll draft created for period {record.period}.")
        return record, employee.name

    record, employee_name = _commit(session, operation)
    return _payroll_dict(record, employee_name)


@router.patch("/payroll/{payroll_id}")
def update_payroll(
    business_id: UUID,
    payroll_id: UUID,
    body: PayrollUpdate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one payroll component must be supplied.")
    if any(value is None for value in changes.values()):
        raise HTTPException(status_code=422, detail="Payroll components cannot be null.")

    def operation():
        _owner(session, principal, business_id)
        record = session.scalars(
            select(PayrollRecord).where(
                PayrollRecord.id == payroll_id, PayrollRecord.business_id == business_id
            ).with_for_update()
        ).one_or_none()
        if record is None:
            raise HTTPException(status_code=404, detail="Payroll record not found")
        if record.status != "draft":
            raise HTTPException(status_code=409, detail="Only draft payroll can be edited.")
        for key, value in changes.items():
            setattr(record, key, _money(value))
        record.net_pay = _money(record.base_salary + record.allowances + record.bonuses - record.deductions)
        if record.net_pay <= 0:
            raise HTTPException(status_code=422, detail="Deductions must be lower than total earnings.")
        session.flush()
        _audit(session, business_id, principal.subject, "payroll.updated", "payroll", record.id,
               "Payroll components updated: " + ", ".join(sorted(changes.keys())) + ".")
        employee_name = session.scalar(select(Employee.name).where(
            Employee.id == record.employee_id, Employee.business_id == business_id
        )) or "Employee"
        return record, employee_name

    record, employee_name = _commit(session, operation)
    return _payroll_dict(record, employee_name)


@router.post("/payroll/{payroll_id}/approve")
def approve_payroll(
    business_id: UUID,
    payroll_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def operation():
        _owner(session, principal, business_id)
        record = session.scalars(
            select(PayrollRecord).where(
                PayrollRecord.id == payroll_id, PayrollRecord.business_id == business_id
            ).with_for_update()
        ).one_or_none()
        if record is None:
            raise HTTPException(status_code=404, detail="Payroll record not found")
        if record.status != "draft":
            raise HTTPException(status_code=409, detail="Only draft payroll can be approved.")
        if record.created_by_subject == principal.subject:
            raise HTTPException(
                status_code=409,
                detail="Payroll must be approved by a different owner than its creator.",
            )
        record.status = "approved"
        record.approved_by_subject = principal.subject
        record.approved_at = datetime.now(UTC)
        session.flush()
        _audit(session, business_id, principal.subject, "payroll.approved", "payroll", record.id,
               f"Payroll for {record.period} approved.")
        employee_name = session.scalar(select(Employee.name).where(
            Employee.id == record.employee_id, Employee.business_id == business_id
        )) or "Employee"
        return record, employee_name

    record, employee_name = _commit(session, operation)
    return _payroll_dict(record, employee_name)


def _apply_payroll_payment(
    session: Session,
    *,
    business_id: UUID,
    principal: AuthenticatedPrincipal,
    record: PayrollRecord,
    employee_name: str,
    currency_code: str,
    amount: Decimal,
    paid_at: datetime,
) -> Expense:
    """Write ONE payment event (3A-920 step 5): a Payroll expense in the
    exact shape the full-pay path has always written, plus its ledger
    row. Returns the expense. The caller decides whether this payment
    completes the record."""
    expense = Expense(
        business_id=business_id,
        category="Payroll",
        description=f"Payroll payment — {employee_name} — {record.period}",
        amount=amount,
        currency_code=currency_code,
        incurred_at=paid_at,
        vendor_name=employee_name,
        reference=f"payroll:{record.id}",
    )
    session.add(expense)
    session.flush()
    session.add(PayrollPayment(
        business_id=business_id,
        payroll_record_id=record.id,
        expense_id=expense.id,
        amount=amount,
        created_by_subject=principal.subject,
    ))
    session.flush()
    return expense


def _payable_record(
    session: Session, *, business_id: UUID, payroll_id: UUID
) -> tuple[PayrollRecord, Employee, Business]:
    """The shared guard for both payment paths: an approved record
    whose employee + business references are still available."""
    record = session.scalars(
        select(PayrollRecord).where(
            PayrollRecord.id == payroll_id, PayrollRecord.business_id == business_id
        ).with_for_update()
    ).one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    if record.status != "approved" or record.expense_id is not None:
        raise HTTPException(status_code=409, detail="Only approved, unpaid payroll can be paid.")
    employee = session.scalars(select(Employee).where(
        Employee.id == record.employee_id, Employee.business_id == business_id
    )).one_or_none()
    business = session.scalars(select(Business).where(
        Business.id == business_id, Business.is_active.is_(True)
    )).one_or_none()
    if employee is None or business is None:
        raise HTTPException(status_code=409, detail="Payroll references are no longer available.")
    if record.net_pay <= 0:
        raise HTTPException(status_code=422, detail="Payroll net pay must be greater than zero.")
    return record, employee, business


@router.post("/payroll/{payroll_id}/pay")
def pay_payroll(
    business_id: UUID,
    payroll_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def operation():
        _owner(session, principal, business_id)
        record, employee, business = _payable_record(
            session, business_id=business_id, payroll_id=payroll_id
        )
        # 3A-920 step 5: full pay settles the REMAINDER — for a record
        # with no partial payments that is the full net, exactly as
        # before; the payment lands in the same ledger either way.
        already_paid = _paid_amount(session, business_id=business_id, payroll_record_id=record.id)
        remaining = _money(record.net_pay - already_paid)
        paid_at = datetime.now(UTC)
        expense = _apply_payroll_payment(
            session, business_id=business_id, principal=principal, record=record,
            employee_name=employee.name, currency_code=business.currency_code,
            amount=remaining, paid_at=paid_at,
        )
        record.expense_id = expense.id
        record.status = "paid"
        record.paid_at = paid_at
        record.paid_by_subject = principal.subject
        session.flush()
        _audit(session, business_id, principal.subject, "payroll.paid", "payroll", record.id,
               f"Payroll for {record.period} marked paid and linked to one Payroll expense.")
        return record, employee.name, record.net_pay

    record, employee_name, paid_total = _commit(session, operation)
    return _payroll_dict(record, employee_name, paid_total)


class PayrollPaymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


@router.post("/payroll/{payroll_id}/payments", status_code=201)
def record_payroll_payment(
    business_id: UUID,
    payroll_id: UUID,
    body: PayrollPaymentCreate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """3A-920 step 5 — «دفع جزء»: record one partial payment against an
    approved record and keep the remainder due. The record flips to
    'paid' only when the payments sum reaches the net pay."""

    def operation():
        _owner(session, principal, business_id)
        record, employee, business = _payable_record(
            session, business_id=business_id, payroll_id=payroll_id
        )
        already_paid = _paid_amount(session, business_id=business_id, payroll_record_id=record.id)
        amount = _money(body.amount)
        remaining = _money(record.net_pay - already_paid)
        if amount > remaining:
            raise HTTPException(
                status_code=422, detail="Payment exceeds the remaining amount due."
            )
        paid_at = datetime.now(UTC)
        expense = _apply_payroll_payment(
            session, business_id=business_id, principal=principal, record=record,
            employee_name=employee.name, currency_code=business.currency_code,
            amount=amount, paid_at=paid_at,
        )
        new_paid = _money(already_paid + amount)
        completed = new_paid == record.net_pay
        if completed:
            record.expense_id = expense.id
            record.status = "paid"
            record.paid_at = paid_at
            record.paid_by_subject = principal.subject
        session.flush()
        if completed:
            summary = (
                f"Payroll payment of {amount} for {record.period} completed the "
                f"payment; the record is now fully paid."
            )
        else:
            summary = (
                f"Payroll payment of {amount} for {record.period} recorded; "
                f"{_money(record.net_pay - new_paid)} remains due."
            )
        _audit(session, business_id, principal.subject,
               "payroll.payment_recorded", "payroll", record.id, summary)
        return record, employee.name, new_paid

    record, employee_name, paid_total = _commit(session, operation)
    return _payroll_dict(record, employee_name, paid_total)


# ---------------------------------------------------------------------------
# 3A-920 step 4 — proposed driver entitlements.
#
# Issuing an invoice with a transport block raises a PROPOSED
# entitlement on the invoice (see app.services.issue_invoice). These
# owner-only endpoints are the payroll side of it: list what is
# awaiting a decision, confirm one into a DRAFT payroll record, or
# dismiss it. Nothing here ever posts money on its own — confirmation
# is an explicit owner action, and the record it creates is an
# ordinary draft that still goes through approve + pay like any
# other. Like payroll for an already per-trip employee, the queue
# keeps working while the master switch is off: the switch governs
# NEW transport enrolments, not the pay that follows from recorded
# deliveries.
# ---------------------------------------------------------------------------


class EntitlementConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Defaults to the invoice's issue month; the owner may file the
    # trips under a different period (e.g. the payroll run they
    # belong to).
    period: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


def _entitlement_dict(invoice: Invoice, driver_name: str, unit_name: str) -> dict:
    wage = invoice.transport_trip_wage
    amount = wage * invoice.transport_trips if wage is not None and invoice.transport_trips else None
    return {
        "invoice_id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "issue_date": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "driver_employee_id": str(invoice.driver_employee_id),
        "driver_name": driver_name,
        "trips": invoice.transport_trips,
        "unit_name": unit_name,
        "trip_wage": str(wage) if wage is not None else None,
        "amount": str(amount) if amount is not None else None,
        "currency_code": invoice.currency_code,
    }


@router.get("/transport-entitlements")
def list_transport_entitlements(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    unit_name = transport_unit_name(session, business_id=business_id)
    rows = session.execute(
        select(Invoice, Employee.name)
        .join(Employee, Employee.id == Invoice.driver_employee_id)
        .where(
            Invoice.business_id == business_id,
            Invoice.transport_entitlement_status == "proposed",
        )
        .order_by(Invoice.issue_date, Invoice.id)
    ).all()
    return [_entitlement_dict(invoice, driver_name, unit_name) for invoice, driver_name in rows]


@router.post("/transport-entitlements/{invoice_id}/confirm")
def confirm_transport_entitlement(
    business_id: UUID,
    invoice_id: UUID,
    body: EntitlementConfirm | None = None,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def operation():
        _owner(session, principal, business_id)
        invoice = session.scalars(
            select(Invoice).where(
                Invoice.id == invoice_id, Invoice.business_id == business_id
            ).with_for_update()
        ).one_or_none()
        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.transport_entitlement_status != "proposed":
            raise HTTPException(
                status_code=409, detail="This entitlement is not awaiting confirmation."
            )
        driver = session.scalars(select(Employee).where(
            Employee.id == invoice.driver_employee_id, Employee.business_id == business_id
        )).one_or_none()
        if driver is None or not driver.is_active:
            raise HTTPException(
                status_code=422, detail="The driver is no longer an active employee."
            )
        if driver.wage_basis != "per_trip":
            raise HTTPException(
                status_code=422,
                detail="The driver's wage basis is not per-trip; record the pay manually.",
            )
        if invoice.transport_trip_wage is None or not invoice.transport_trips:
            raise HTTPException(status_code=422, detail="Trip wage is not set for this driver.")
        period = body.period if body is not None else None
        if period is None:
            if invoice.issue_date is None:
                raise HTTPException(status_code=422, detail="A payroll period is required.")
            period = invoice.issue_date.strftime("%Y-%m")
        # The base is the SNAPSHOT wage x trips — the delivery-moment
        # wage, exactly the per-trip branch of _compute_payroll_base
        # with the snapshotted inputs, so a later wage change never
        # rewrites the proposal. The net formula is the same as any
        # payroll record (base + allowances + bonuses - deductions,
        # all zero here; the draft stays editable in payroll).
        base_salary = _money(invoice.transport_trip_wage * invoice.transport_trips)
        record = PayrollRecord(
            business_id=business_id,
            employee_id=driver.id,
            period=period,
            trips=invoice.transport_trips,
            work_days=None,
            base_salary=base_salary,
            allowances=Decimal(0),
            bonuses=Decimal(0),
            deductions=Decimal(0),
            net_pay=base_salary,
            status="draft",
            created_by_subject=principal.subject,
        )
        session.add(record)
        session.flush()
        invoice.transport_entitlement_status = "confirmed"
        invoice.transport_entitlement_payroll_id = record.id
        _audit(session, business_id, principal.subject, "transport.entitlement_confirmed",
               "payroll", record.id,
               f"Driver entitlement from invoice {invoice.invoice_number} "
               f"confirmed as draft payroll for {period}.")
        return record, driver.name, invoice.id

    record, driver_name, confirmed_invoice_id = _commit(session, operation)
    return {**_payroll_dict(record, driver_name), "invoice_id": str(confirmed_invoice_id)}


@router.post("/transport-entitlements/{invoice_id}/dismiss")
def dismiss_transport_entitlement(
    business_id: UUID,
    invoice_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def operation():
        _owner(session, principal, business_id)
        invoice = session.scalars(
            select(Invoice).where(
                Invoice.id == invoice_id, Invoice.business_id == business_id
            ).with_for_update()
        ).one_or_none()
        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        if invoice.transport_entitlement_status != "proposed":
            raise HTTPException(
                status_code=409, detail="This entitlement is not awaiting confirmation."
            )
        invoice.transport_entitlement_status = "dismissed"
        session.flush()
        _audit(session, business_id, principal.subject, "transport.entitlement_dismissed",
               "invoice", invoice.id,
               f"Driver entitlement for invoice {invoice.invoice_number} dismissed.")
        return {"invoice_id": str(invoice.id), "status": "dismissed"}

    return _commit(session, operation)
