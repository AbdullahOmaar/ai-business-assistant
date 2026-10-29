from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app import employee_payroll_api
from app.models import AuditEvent, Base, BusinessMembership, Employee, Expense, MembershipRole, PayrollRecord
from app.security import AuthenticatedPrincipal

OWNER = "employee-payroll-test-owner"
APPROVER = "employee-payroll-test-approver"
STAFF = "employee-payroll-test-staff"


@pytest.fixture
def employee_environment(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    current_subject = {"value": OWNER}
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(current_subject["value"])
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    try:
        client = TestClient(app)
        created = client.post("/api/v1/businesses", json={"name": "Payroll test", "currency_code": "EGP"})
        assert created.status_code == 201
        business_id = created.json()["id"]
        with app.state.session_factory() as session:
            session.add_all([
                BusinessMembership(
                    business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF
                ),
                BusinessMembership(
                    business_id=UUID(business_id), user_subject=APPROVER, role=MembershipRole.OWNER
                ),
            ])
            session.commit()
        yield {"client": client, "business_id": business_id, "subject": current_subject, "engine": engine}
    finally:
        if previous_factory is None:
            if hasattr(app.state, "session_factory"):
                del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            if hasattr(app.state, "principal_resolver"):
                del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
        engine.dispose()


def _create_employee(env, *, name="Mona Ali", code="EMP-01", email="mona@example.test", phone=None, salary="5000.00"):
    response = env["client"].post(f"/api/v1/businesses/{env['business_id']}/employees", json={
        "name": name, "employee_code": code, "email": email, "phone": phone,
        "department": "Sales", "job_title": "Associate", "monthly_salary": salary,
    })
    return response


def test_owner_can_manage_employee_and_deactivation_is_audited(employee_environment):
    env = employee_environment
    created = _create_employee(env)
    assert created.status_code == 201
    employee = created.json()
    assert employee["monthly_salary"] == "5000.00"
    assert employee["is_active"] is True

    updated = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee['id']}",
        json={"is_active": False, "job_title": "Senior Associate"},
    )
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False
    listing = env["client"].get(f"/api/v1/businesses/{env['business_id']}/employees")
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["is_active"] is False
    with app.state.session_factory() as session:
        actions = session.scalars(select(AuditEvent.action).where(
            AuditEvent.business_id == UUID(env["business_id"]),
            AuditEvent.target_type == "employee",
        )).all()
    assert set(actions) == {"employee.created", "employee.updated"}


def test_employee_code_and_email_duplicates_are_rejected(employee_environment):
    env = employee_environment
    assert _create_employee(env).status_code == 201
    duplicate_code = _create_employee(env, name="Other Name", code="emp-01", email="other@example.test")
    duplicate_email = _create_employee(env, name="Other Person", code="EMP-02", email="MONA@example.test")
    assert duplicate_code.status_code == 409
    assert duplicate_email.status_code == 409


def test_staff_cannot_read_or_change_employees_or_payroll_and_no_rows_are_written(employee_environment):
    env = employee_environment
    created = _create_employee(env)
    assert created.status_code == 201
    employee_id = created.json()["id"]
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll = env["client"].post(
        f"{base}/employees/{employee_id}/payroll", json={"period": "2026-11"}
    )
    assert payroll.status_code == 201
    payroll_id = payroll.json()["id"]
    env["subject"]["value"] = STAFF

    endpoints = [
        ("get", f"{base}/employees", None),
        ("post", f"{base}/employees", {"name":"Unauthorized","monthly_salary":"1.00"}),
        ("patch", f"{base}/employees/{employee_id}", {"name":"Unauthorized"}),
        ("get", f"{base}/payroll", None),
        ("post", f"{base}/employees/{employee_id}/payroll", {"period":"2026-12"}),
        ("patch", f"{base}/payroll/{payroll_id}", {"allowances":"1.00"}),
        ("post", f"{base}/payroll/{payroll_id}/approve", {}),
        ("post", f"{base}/payroll/{payroll_id}/pay", {}),
    ]
    for method, url, body in endpoints:
        response = getattr(env["client"], method)(url, json=body) if body is not None else getattr(env["client"], method)(url)
        assert response.status_code == 403

    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Employee)) == 1
        assert session.scalar(select(func.count()).select_from(PayrollRecord)) == 1
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.target_type == "employee"
        )) == 1
        payroll_actions = session.scalars(select(AuditEvent.action).where(
            AuditEvent.target_type == "payroll"
        )).all()
        assert payroll_actions == ["payroll.created"]
        persisted = session.get(PayrollRecord, UUID(payroll_id))
        assert persisted is not None and persisted.status == "draft"



def test_nonmember_cannot_access_or_mutate_employee_payroll_without_side_effects(employee_environment):
    env = employee_environment
    employee_response = _create_employee(env)
    assert employee_response.status_code == 201
    employee_id = employee_response.json()["id"]
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll_response = env["client"].post(
        f"{base}/employees/{employee_id}/payroll", json={"period": "2026-10"}
    )
    assert payroll_response.status_code == 201
    payroll_id = payroll_response.json()["id"]

    # Use a different OWNER to put the record into the paid-eligible state.
    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    # This identity has no membership in the business.
    nonmember = "employee-payroll-test-nonmember"
    env["subject"]["value"] = nonmember
    endpoints = [
        ("get", f"{base}/employees", None),
        ("post", f"{base}/employees", {
            "name": "Unauthorized employee", "employee_code": "UNAUTH-1",
            "email": "unauthorized@example.test", "monthly_salary": "100.00",
        }),
        ("patch", f"{base}/employees/{employee_id}", {"monthly_salary": "1.00"}),
        ("get", f"{base}/payroll", None),
        ("post", f"{base}/employees/{employee_id}/payroll", {"period": "2026-11"}),
        ("patch", f"{base}/payroll/{payroll_id}", {"allowances": "1.00"}),
        ("post", f"{base}/payroll/{payroll_id}/approve", {}),
        ("post", f"{base}/payroll/{payroll_id}/pay", {}),
    ]
    def snapshot():
        with app.state.session_factory() as session:
            persisted = session.get(PayrollRecord, UUID(payroll_id))
            assert persisted is not None
            return (
                session.scalar(select(func.count()).select_from(Employee)),
                session.scalar(select(func.count()).select_from(PayrollRecord)),
                session.scalar(select(func.count()).select_from(Expense)),
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == UUID(env["business_id"])
                )),
                tuple(sorted(session.scalars(select(AuditEvent.action).where(
                    AuditEvent.target_type == "payroll"
                )).all())),
                persisted.status,
                persisted.allowances,
                persisted.bonuses,
                persisted.deductions,
                persisted.net_pay,
                persisted.expense_id,
            )

    for method, url, body in endpoints:
        before = snapshot()
        response = (
            getattr(env["client"], method)(url, json=body)
            if body is not None
            else getattr(env["client"], method)(url)
        )
        assert response.status_code == 403, (
            f"{method.upper()} {url}: expected 403 for non-member, "
            f"got {response.status_code}: {response.text}"
        )
        assert snapshot() == before, (
            f"{method.upper()} {url}: denied non-member request changed payroll, "
            "employee, expense, or audit state"
        )

    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Employee)) == 1
        assert session.scalar(select(func.count()).select_from(PayrollRecord)) == 1
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.target_type == "employee"
        )) == 1
        payroll_actions = session.scalars(select(AuditEvent.action).where(
            AuditEvent.target_type == "payroll"
        ).order_by(AuditEvent.created_at, AuditEvent.action)).all()
        assert set(payroll_actions) == {"payroll.created", "payroll.approved"}
        persisted = session.get(PayrollRecord, UUID(payroll_id))
        assert persisted is not None
        assert persisted.status == "approved"
        assert persisted.expense_id is None


def test_payroll_records_and_employee_ids_cannot_cross_business_boundaries(employee_environment):
    env = employee_environment
    created = _create_employee(env)
    assert created.status_code == 201
    employee_id = created.json()["id"]
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll = env["client"].post(
        f"{base}/employees/{employee_id}/payroll", json={"period": "2026-10"}
    )
    assert payroll.status_code == 201
    payroll_id = payroll.json()["id"]

    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    env["subject"]["value"] = OWNER

    second = env["client"].post(
        "/api/v1/businesses", json={"name": "Payroll isolation target", "currency_code": "USD"}
    )
    assert second.status_code == 201
    second_id = second.json()["id"]
    foreign_base = f"/api/v1/businesses/{second_id}"

    def snapshot():
        with app.state.session_factory() as session:
            record = session.get(PayrollRecord, UUID(payroll_id))
            assert record is not None
            return (
                session.scalar(select(func.count()).select_from(Employee)),
                session.scalar(select(func.count()).select_from(PayrollRecord)),
                session.scalar(select(func.count()).select_from(Expense)),
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id.in_([UUID(env["business_id"]), UUID(second_id)])
                )),
                tuple(sorted(session.scalars(select(AuditEvent.action).where(
                    AuditEvent.business_id == UUID(env["business_id"]),
                    AuditEvent.target_type == "payroll",
                )).all())),
                record.status,
                record.allowances,
                record.bonuses,
                record.deductions,
                record.net_pay,
                record.expense_id,
            )

    attempts = [
        ("patch", f"{foreign_base}/payroll/{payroll_id}", {"allowances": "999.00"}),
        ("post", f"{foreign_base}/payroll/{payroll_id}/approve", {}),
        ("post", f"{foreign_base}/payroll/{payroll_id}/pay", {}),
        ("post", f"{foreign_base}/employees/{employee_id}/payroll", {"period": "2026-11"}),
    ]
    for method, url, payload in attempts:
        before = snapshot()
        response = getattr(env["client"], method)(url, json=payload)
        assert response.status_code == 404, (
            f"{method.upper()} {url}: expected 404 for foreign business record, "
            f"got {response.status_code}: {response.text}"
        )
        assert snapshot() == before, (
            f"{method.upper()} {url}: foreign business request changed payroll, "
            "employee, expense, or audit state"
        )

def test_employee_ids_cannot_be_used_across_businesses(employee_environment):
    env = employee_environment
    created = _create_employee(env)
    employee_id = created.json()["id"]
    second_workspace = env["client"].post("/api/v1/businesses", json={
        "name": "Another business", "currency_code": "USD"
    })
    assert second_workspace.status_code == 201
    second_id = second_workspace.json()["id"]
    listing = env["client"].get(f"/api/v1/businesses/{second_id}/employees")
    read_other = env["client"].patch(f"/api/v1/businesses/{second_id}/employees/{employee_id}", json={"name":"Stolen"})
    assert listing.status_code == 200 and listing.json() == []
    assert read_other.status_code == 404
    assert _create_employee(env).status_code == 409


def test_duplicate_payroll_period_rejected_without_side_effects(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    first = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-11"},
    )
    assert first.status_code == 201

    duplicate = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-11", "allowances": "100.00"},
    )
    assert duplicate.status_code == 409

    with app.state.session_factory() as session:
        records = session.scalars(select(PayrollRecord)).all()
        assert len(records) == 1
        assert records[0].id == UUID(first.json()["id"])
        assert records[0].allowances == Decimal("0.00")
        assert records[0].status == "draft"
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        actions = session.scalars(
            select(AuditEvent.action)
            .where(AuditEvent.target_type == "payroll")
            .order_by(AuditEvent.created_at, AuditEvent.action)
        ).all()
        assert actions == ["payroll.created"]


def test_payroll_math_approval_and_payment_create_one_linked_expense(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    created = env["client"].post(f"{base}/employees/{employee['id']}/payroll", json={
        "period": "2026-10", "allowances": "200.00", "bonuses": "100.00", "deductions": "300.00",
    })
    assert created.status_code == 201
    payroll = created.json()
    assert payroll["base_salary"] == "5000.00"
    assert payroll["net_pay"] == "5000.00"
    assert payroll["status"] == "draft"

    # The client cannot override a server-owned calculation.
    rejected_net = env["client"].post(f"{base}/employees/{employee['id']}/payroll", json={
        "period": "2026-11", "net_pay": "1.00",
    })
    assert rejected_net.status_code == 422
    duplicate_period = env["client"].post(f"{base}/employees/{employee['id']}/payroll", json={
        "period": "2026-10",
    })
    assert duplicate_period.status_code == 409

    self_approval = env["client"].post(f"{base}/payroll/{payroll['id']}/approve", json={})
    assert self_approval.status_code == 409
    assert "different owner" in self_approval.json()["detail"]

    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll['id']}/approve", json={})
    assert approved.status_code == 200
    env["subject"]["value"] = OWNER
    assert approved.json()["status"] == "approved"
    paid = env["client"].post(f"{base}/payroll/{payroll['id']}/pay", json={})
    assert paid.status_code == 200
    assert paid.json()["status"] == "paid"
    assert paid.json()["expense_id"]

    duplicate_payment = env["client"].post(f"{base}/payroll/{payroll['id']}/pay", json={})
    assert duplicate_payment.status_code == 409
    with app.state.session_factory() as session:
        payroll_records = session.scalars(select(PayrollRecord)).all()
        expenses = session.scalars(select(Expense)).all()
        assert len(payroll_records) == 1
        assert len(expenses) == 1
        assert expenses[0].category == "Payroll"
        assert expenses[0].amount == Decimal("5000.00")
        assert str(expenses[0].id) == str(payroll_records[0].expense_id)
        actions = session.scalars(select(AuditEvent.action).where(
            AuditEvent.target_type == "payroll"
        ).order_by(AuditEvent.created_at, AuditEvent.action)).all()
        assert set(actions) == {"payroll.created", "payroll.approved", "payroll.paid"}


def test_payroll_cannot_be_paid_before_approval(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    record = env["client"].post(f"{base}/employees/{employee['id']}/payroll", json={"period":"2026-10"}).json()
    response = env["client"].post(f"{base}/payroll/{record['id']}/pay", json={})
    assert response.status_code == 409
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        persisted = session.get(PayrollRecord, UUID(record["id"]))
        assert persisted is not None and persisted.status == "draft"


def test_payroll_deductions_cannot_exceed_earnings(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    response = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee['id']}/payroll",
        json={"period":"2026-10", "deductions":"5000.01"},
    )
    assert response.status_code == 422
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(PayrollRecord)) == 0

def test_employee_payroll_audit_summaries_exclude_sensitive_values(employee_environment):
    env = employee_environment
    created = _create_employee(
        env, name="Confidential Employee", code="EMP-PRIVATE",
        email="private.person@example.test", phone="+20-100-555-0199", salary="8765.43",
    )
    assert created.status_code == 201
    employee = created.json()
    base = f"/api/v1/businesses/{env['business_id']}"
    updated_email = "updated.private.person@example.test"
    updated_phone = "+20-100-555-0177"
    updated = env["client"].patch(
        f"{base}/employees/{employee['id']}",
        json={"email": updated_email, "phone": updated_phone},
    )
    assert updated.status_code == 200
    payroll = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-11", "allowances": "123.45", "bonuses": "67.89"},
    )
    assert payroll.status_code == 201

    sensitive_values = [
        "private.person@example.test",
        "8765.43",
        "123.45",
        "67.89",
        "+20-100-555-0199",
        updated_email,
        updated_phone,
    ]
    with app.state.session_factory() as session:
        summaries = session.scalars(
            select(AuditEvent.change_summary).where(
                AuditEvent.business_id == UUID(env["business_id"]),
                AuditEvent.target_type.in_(["employee", "payroll"]),
            )
        ).all()
        assert len(summaries) == 3
        for summary in summaries:
            for value in sensitive_values:
                if value:
                    assert value not in summary


def test_approved_payroll_cannot_be_edited_without_side_effects(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    created = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-11", "allowances": "25.00"},
    )
    assert created.status_code == 201
    payroll_id = created.json()["id"]

    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    before = approved.json()

    rejected = env["client"].patch(
        f"{base}/payroll/{payroll_id}",
        json={"allowances": "999.00", "deductions": "10.00"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"] == "Only draft payroll can be edited."

    with app.state.session_factory() as session:
        persisted = session.get(PayrollRecord, UUID(payroll_id))
        assert persisted is not None
        assert persisted.status == "approved"
        assert persisted.allowances == Decimal(before["allowances"])
        assert persisted.bonuses == Decimal(before["bonuses"])
        assert persisted.deductions == Decimal(before["deductions"])
        assert persisted.net_pay == Decimal(before["net_pay"])
        assert persisted.expense_id is None
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        actions = session.scalars(
            select(AuditEvent.action)
            .where(AuditEvent.target_type == "payroll")
            .order_by(AuditEvent.created_at, AuditEvent.action)
        ).all()
        assert len(actions) == 2
        assert set(actions) == {"payroll.created", "payroll.approved"}


def test_payroll_precision_and_unknown_fields_are_rejected_without_side_effects(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    invalid_create_payloads = [
        {"period": "2026-11", "allowances": "1.001"},
        {"period": "2026-11", "bonuses": "1000000000000.00"},
        {"period": "2026-11", "net_pay": "1.00"},
    ]

    for payload in invalid_create_payloads:
        response = env["client"].post(
            f"{base}/employees/{employee['id']}/payroll",
            json=payload,
        )
        assert response.status_code == 422, (
            f"Invalid payroll payload {payload} was not rejected: "
            f"{response.status_code} {response.text}"
        )

    created = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-11", "allowances": "10.00"},
    )
    assert created.status_code == 201
    payroll_id = created.json()["id"]
    before = created.json()

    invalid_update_payloads = [
        {},
        {"allowances": None},
        {"allowances": "1.001"},
        {"allowances": "-0.01"},
        {"bonuses": "-0.01"},
        {"deductions": "-0.01"},
        {"deductions": "1000000000000.00"},
        {"deductions": "5010.00"},  # Would reduce this draft payroll net pay to zero.
        {"net_pay": "1.00"},
    ]
    for payload in invalid_update_payloads:
        response = env["client"].patch(f"{base}/payroll/{payroll_id}", json=payload)
        assert response.status_code == 422, (
            f"Invalid payroll update {payload} was not rejected: "
            f"{response.status_code} {response.text}"
        )

    with app.state.session_factory() as session:
        records = session.scalars(select(PayrollRecord)).all()
        assert len(records) == 1
        persisted = records[0]
        assert str(persisted.id) == payroll_id
        assert persisted.allowances == Decimal(before["allowances"])
        assert persisted.bonuses == Decimal(before["bonuses"])
        assert persisted.deductions == Decimal(before["deductions"])
        assert persisted.net_pay == Decimal(before["net_pay"])
        assert persisted.status == "draft"
        assert persisted.expense_id is None
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        actions = session.scalars(
            select(AuditEvent.action)
            .where(AuditEvent.target_type == "payroll")
            .order_by(AuditEvent.created_at, AuditEvent.action)
        ).all()
        assert actions == ["payroll.created"]


def test_invalid_payroll_components_and_period_have_no_side_effects(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    invalid_payloads = [
        {"period": "2026-11", "allowances": "-0.01"},
        {"period": "2026-11", "bonuses": "-0.01"},
        {"period": "2026-11", "deductions": "-0.01"},
        {"period": "2026-13"},
        {"period": "2026-1"},
    ]

    for payload in invalid_payloads:
        response = env["client"].post(
            f"{base}/employees/{employee['id']}/payroll",
            json=payload,
        )
        assert response.status_code == 422, (
            f"Invalid payroll payload {payload} was not rejected: "
            f"{response.status_code} {response.text}"
        )

    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(PayrollRecord)) == 0
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        assert session.scalars(
            select(AuditEvent.action).where(AuditEvent.target_type == "payroll")
        ).all() == []


def test_inactive_employee_cannot_create_payroll_without_side_effects(employee_environment):
    env = employee_environment
    created = _create_employee(env)
    assert created.status_code == 201
    employee = created.json()
    base = f"/api/v1/businesses/{env['business_id']}"

    deactivated = env["client"].patch(
        f"{base}/employees/{employee['id']}", json={"is_active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    response = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-11"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Active employee not found"

    with app.state.session_factory() as session:
        persisted = session.get(Employee, UUID(employee["id"]))
        assert persisted is not None and persisted.is_active is False
        assert session.scalar(select(func.count()).select_from(PayrollRecord)) == 0
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        payroll_actions = session.scalars(
            select(AuditEvent.action).where(AuditEvent.target_type == "payroll")
        ).all()
        assert payroll_actions == []
        employee_actions = session.scalars(
            select(AuditEvent.action).where(AuditEvent.target_type == "employee")
        ).all()
        assert employee_actions.count("employee.created") == 1
        assert employee_actions.count("employee.updated") == 1

def test_active_only_listing_excludes_deactivated_employees(employee_environment):
    env = employee_environment
    active = _create_employee(
        env, name="Active Employee", code="EMP-ACTIVE", email="active@example.test"
    )
    inactive = _create_employee(
        env, name="Inactive Employee", code="EMP-INACTIVE", email="inactive@example.test"
    )
    assert active.status_code == 201
    assert inactive.status_code == 201

    base = f"/api/v1/businesses/{env['business_id']}"
    deactivated = env["client"].patch(
        f"{base}/employees/{inactive.json()['id']}", json={"is_active": False}
    )
    assert deactivated.status_code == 200

    all_rows = env["client"].get(f"{base}/employees")
    active_rows = env["client"].get(f"{base}/employees?active_only=true")
    assert all_rows.status_code == 200
    assert active_rows.status_code == 200
    assert {row["id"] for row in all_rows.json()} == {
        active.json()["id"], inactive.json()["id"]
    }
    assert [row["id"] for row in active_rows.json()] == [active.json()["id"]]
    assert all(row["is_active"] is True for row in active_rows.json())


def test_employee_update_duplicate_code_and_email_are_rejected_without_side_effects(employee_environment):
    env = employee_environment
    first = _create_employee(env, code="EMP-ONE", email="one@example.test")
    second = _create_employee(
        env, name="Second Employee", code="EMP-TWO", email="two@example.test"
    )
    assert first.status_code == second.status_code == 201
    base = f"/api/v1/businesses/{env['business_id']}"
    attempts = [
        (first.json()["id"], {"employee_code": "EMP-TWO"}),
        (first.json()["id"], {"email": "TWO@example.test"}),
    ]
    for employee_id, payload in attempts:
        before = env["client"].get(f"{base}/employees").json()
        with app.state.session_factory() as session:
            audit_before = session.scalar(select(func.count()).select_from(AuditEvent))
        response = env["client"].patch(f"{base}/employees/{employee_id}", json=payload)
        assert response.status_code == 409
        assert env["client"].get(f"{base}/employees").json() == before
        with app.state.session_factory() as session:
            assert session.scalar(select(func.count()).select_from(AuditEvent)) == audit_before


def test_employee_listing_pagination_is_stable_and_respects_active_filter(employee_environment):
    env = employee_environment
    employees = [
        _create_employee(env, name=name, code=code, email=email).json()
        for name, code, email in [
            ("Cairo", "EMP-C", "c@example.test"),
            ("Alex", "EMP-A", "a@example.test"),
            ("Giza", "EMP-G", "g@example.test"),
        ]
    ]
    base = f"/api/v1/businesses/{env['business_id']}"
    deactivated = env["client"].patch(
        f"{base}/employees/{employees[2]['id']}", json={"is_active": False}
    )
    assert deactivated.status_code == 200
    first_page = env["client"].get(f"{base}/employees?limit=1&offset=0")
    second_page = env["client"].get(f"{base}/employees?limit=1&offset=1")
    active_page = env["client"].get(f"{base}/employees?limit=10&active_only=true")
    assert first_page.status_code == second_page.status_code == active_page.status_code == 200
    assert first_page.json()[0]["name"] == "Alex"
    assert second_page.json()[0]["name"] == "Cairo"
    assert [row["name"] for row in active_page.json()] == ["Alex", "Cairo"]


def test_payroll_listing_period_filter_and_pagination_are_deterministic(employee_environment):
    env = employee_environment
    base = f"/api/v1/businesses/{env['business_id']}"
    for name, code, email, period in [
        ("Mona", "EMP-M", "mona@example.test", "2026-09"),
        ("Ali", "EMP-A", "ali@example.test", "2026-10"),
        ("Sara", "EMP-S", "sara@example.test", "2026-10"),
    ]:
        employee = _create_employee(env, name=name, code=code, email=email).json()
        created = env["client"].post(
            f"{base}/employees/{employee['id']}/payroll", json={"period": period}
        )
        assert created.status_code == 201
    october = env["client"].get(f"{base}/payroll?period=2026-10&limit=10")
    first_page = env["client"].get(f"{base}/payroll?limit=1&offset=0")
    second_page = env["client"].get(f"{base}/payroll?limit=1&offset=1")
    assert october.status_code == first_page.status_code == second_page.status_code == 200
    assert len(october.json()) == 2
    assert {row["period"] for row in october.json()} == {"2026-10"}
    assert first_page.json()[0]["period"] == "2026-10"
    assert second_page.json()[0]["period"] == "2026-10"
    assert first_page.json()[0]["employee_name"] == "Ali"
    assert second_page.json()[0]["employee_name"] == "Sara"


def test_payroll_approval_is_separated_and_repeated_approval_has_no_side_effects(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    created = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll", json={"period": "2026-12"}
    )
    assert created.status_code == 201
    payroll_id = created.json()["id"]
    self_approval = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert self_approval.status_code == 409
    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    snapshot = approved.json()
    with app.state.session_factory() as session:
        audit_before = session.scalar(select(func.count()).select_from(AuditEvent))
    repeated = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert repeated.status_code == 409
    with app.state.session_factory() as session:
        persisted = session.get(PayrollRecord, UUID(payroll_id))
        assert persisted is not None
        assert persisted.status == "approved"
        assert persisted.approved_by_subject == snapshot["approved_by_subject"]
        assert persisted.approved_at is not None
        assert snapshot["approved_at"] is not None
        assert session.scalar(select(func.count()).select_from(AuditEvent)) == audit_before
        assert session.scalar(select(func.count()).select_from(Expense)) == 0


def test_payroll_payment_rolls_back_when_paid_audit_write_fails(employee_environment, monkeypatch):
    from app import employee_payroll_api

    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    created = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll", json={"period": "2026-12"}
    )
    assert created.status_code == 201
    payroll_id = created.json()["id"]
    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    env["subject"]["value"] = OWNER

    original_audit = employee_payroll_api._audit

    def fail_paid_audit(session, business_id, actor, action, target_type, target_id, summary):
        if action == "payroll.paid":
            raise RuntimeError("injected payroll audit failure")
        return original_audit(session, business_id, actor, action, target_type, target_id, summary)

    monkeypatch.setattr(employee_payroll_api, "_audit", fail_paid_audit)
    with pytest.raises(RuntimeError, match="injected payroll audit failure"):
        env["client"].post(f"{base}/payroll/{payroll_id}/pay", json={})

    with app.state.session_factory() as session:
        persisted = session.get(PayrollRecord, UUID(payroll_id))
        assert persisted is not None
        assert persisted.status == "approved"
        assert persisted.expense_id is None
        assert persisted.paid_at is None
        assert persisted.paid_by_subject is None
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        actions = session.scalars(
            select(AuditEvent.action).where(AuditEvent.target_type == "payroll")
        ).all()
        assert set(actions) == {"payroll.created", "payroll.approved"}


# T41 five-workstream regression expansion — test-only changes.

def test_employee_profile_normalization_and_duplicate_update_are_atomic(employee_environment):
    env = employee_environment
    base = f"/api/v1/businesses/{env['business_id']}"
    first = _create_employee(
        env, name="  First Employee  ", code=" first-01 ",
        email=" FIRST@example.test ", phone=" 0100  ",
    )
    second = _create_employee(
        env, name="Second Employee", code="SECOND-02", email="second@example.test",
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["name"] == "First Employee"
    assert first.json()["employee_code"] == "FIRST-01"
    assert first.json()["email"] == "first@example.test"
    assert first.json()["phone"] == "0100"

    before = env["client"].get(f"{base}/employees/{second.json()['id']}")
    # The endpoint intentionally has no employee detail GET; use the response
    # returned by the collection after the rejected update as the persisted view.
    duplicate = env["client"].patch(
        f"{base}/employees/{second.json()['id']}",
        json={"email": " FIRST@example.test ", "name": "Should Not Persist"},
    )
    assert duplicate.status_code == 409
    rows = env["client"].get(f"{base}/employees").json()
    persisted = next(row for row in rows if row["id"] == second.json()["id"])
    assert persisted["name"] == "Second Employee"
    assert persisted["email"] == "second@example.test"
    invalid = env["client"].post(
        f"{base}/employees",
        json={"name": "   ", "email": "not-an-email", "monthly_salary": "10.00"},
    )
    assert invalid.status_code == 422
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Employee)) == 2


def test_employee_directory_pagination_is_stable_and_business_scoped(employee_environment):
    env = employee_environment
    base = f"/api/v1/businesses/{env['business_id']}"
    employees = [
        _create_employee(env, name=name, code=f"PAGE-{i}", email=f"page{i}@example.test")
        for i, name in enumerate(["Charlie", "Alpha", "Bravo", "Delta"])
    ]
    assert all(response.status_code == 201 for response in employees)
    full = env["client"].get(f"{base}/employees?limit=10&offset=0")
    page_one = env["client"].get(f"{base}/employees?limit=2&offset=0")
    page_two = env["client"].get(f"{base}/employees?limit=2&offset=2")
    assert full.status_code == page_one.status_code == page_two.status_code == 200
    expected = [row["id"] for row in full.json()]
    assert [row["id"] for row in page_one.json() + page_two.json()] == expected
    assert [row["name"] for row in full.json()] == ["Alpha", "Bravo", "Charlie", "Delta"]
    second_business = env["client"].post(
        "/api/v1/businesses", json={"name": "Separate workspace", "currency_code": "USD"}
    )
    assert second_business.status_code == 201
    isolated = env["client"].get(
        f"/api/v1/businesses/{second_business.json()['id']}/employees"
    )
    assert isolated.status_code == 200 and isolated.json() == []


def test_payroll_listing_period_filter_and_pagination_are_deterministic(employee_environment):
    env = employee_environment
    base = f"/api/v1/businesses/{env['business_id']}"
    records = []
    for index, (name, period) in enumerate([
        ("Charlie", "2026-10"), ("Alpha", "2026-10"),
        ("Bravo", "2026-11"), ("Delta", "2026-11"),
    ]):
        employee = _create_employee(
            env, name=name, code=f"LIST-{index}", email=f"list{index}@example.test"
        )
        assert employee.status_code == 201
        created = env["client"].post(
            f"{base}/employees/{employee.json()['id']}/payroll",
            json={"period": period},
        )
        assert created.status_code == 201
        records.append(created.json())
    all_rows = env["client"].get(f"{base}/payroll?limit=10&offset=0")
    page_one = env["client"].get(f"{base}/payroll?limit=2&offset=0")
    page_two = env["client"].get(f"{base}/payroll?limit=2&offset=2")
    october = env["client"].get(f"{base}/payroll?period=2026-10")
    assert all_rows.status_code == page_one.status_code == page_two.status_code == october.status_code == 200
    assert [row["id"] for row in page_one.json() + page_two.json()] == [
        row["id"] for row in all_rows.json()
    ]
    assert {row["period"] for row in october.json()} == {"2026-10"}
    assert len(october.json()) == 2
    assert [row["employee_name"] for row in october.json()] == ["Alpha", "Charlie"]


def test_payroll_approval_cannot_be_replayed_or_edited_after_transition(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    draft = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll", json={"period": "2026-12"}
    )
    assert draft.status_code == 201
    payroll_id = draft.json()["id"]
    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    repeated = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    edited = env["client"].patch(
        f"{base}/payroll/{payroll_id}", json={"allowances": "25.00"}
    )
    assert repeated.status_code == 409
    assert edited.status_code == 409
    with app.state.session_factory() as session:
        record = session.get(PayrollRecord, UUID(payroll_id))
        assert record is not None
        assert record.status == "approved"
        assert record.allowances == Decimal("0.00")
        assert record.expense_id is None
        actions = session.scalars(
            select(AuditEvent.action).where(
                AuditEvent.target_type == "payroll",
                AuditEvent.target_id == payroll_id,
            )
        ).all()
        assert sorted(actions) == ["payroll.approved", "payroll.created"]


def test_payment_audit_failure_rolls_back_expense_and_paid_transition(employee_environment, monkeypatch):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    draft = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll", json={"period": "2026-12"}
    )
    assert draft.status_code == 201
    payroll_id = draft.json()["id"]
    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    env["subject"]["value"] = OWNER

    original_audit = employee_payroll_api._audit
    def fail_paid_audit(session, business_id, actor, action, target_type, target_id, summary):
        if action == "payroll.paid":
            raise RuntimeError("injected payroll audit write failure")
        return original_audit(session, business_id, actor, action, target_type, target_id, summary)

    monkeypatch.setattr(employee_payroll_api, "_audit", fail_paid_audit)
    with pytest.raises(RuntimeError, match="injected payroll audit write failure"):
        env["client"].post(f"{base}/payroll/{payroll_id}/pay", json={})

    with app.state.session_factory() as session:
        record = session.get(PayrollRecord, UUID(payroll_id))
        assert record is not None
        assert record.status == "approved"
        assert record.expense_id is None
        assert record.paid_at is None
        assert record.paid_by_subject is None
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        actions = session.scalars(
            select(AuditEvent.action).where(
                AuditEvent.target_type == "payroll",
                AuditEvent.target_id == payroll_id,
            )
        ).all()
        assert sorted(actions) == ["payroll.approved", "payroll.created"]



def test_employee_update_rejects_invalid_values_without_side_effects(employee_environment):
    env = employee_environment
    created = _create_employee(env)
    assert created.status_code == 201
    employee_id = created.json()["id"]
    base = f"/api/v1/businesses/{env['business_id']}"
    invalid_payloads = [{}, {"name": "   "}, {"monthly_salary": None}, {"is_active": None}]
    for payload in invalid_payloads:
        response = env["client"].patch(f"{base}/employees/{employee_id}", json=payload)
        assert response.status_code == 422, (payload, response.status_code, response.text)
    with app.state.session_factory() as session:
        employee = session.get(Employee, UUID(employee_id))
        assert employee is not None
        assert employee.name == "Mona Ali"
        assert employee.monthly_salary == Decimal("5000.00")
        assert employee.is_active is True
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.target_type == "employee"
        )) == 1


def test_employee_update_duplicate_email_and_code_rejected_without_side_effects(employee_environment):
    env = employee_environment
    first = _create_employee(env, name="First", code="EMP-1", email="first@example.test")
    second = _create_employee(env, name="Second", code="EMP-2", email="second@example.test")
    assert first.status_code == second.status_code == 201
    base = f"/api/v1/businesses/{env['business_id']}"
    attempts = [
        (first.json()["id"], {"employee_code": "emp-2"}),
        (first.json()["id"], {"email": "SECOND@example.test"}),
    ]
    for employee_id, payload in attempts:
        before = env["client"].get(f"{base}/employees").json()
        response = env["client"].patch(f"{base}/employees/{employee_id}", json=payload)
        assert response.status_code == 409, (payload, response.status_code, response.text)
        assert env["client"].get(f"{base}/employees").json() == before
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.action == "employee.updated"
        )) == 0


def test_employee_directory_pagination_is_stable_and_bounded(employee_environment):
    env = employee_environment
    for name, code, email in [
        ("Charlie", "EMP-C", "c@example.test"),
        ("Alice", "EMP-A", "a@example.test"),
        ("Bravo", "EMP-B", "b@example.test"),
    ]:
        response = _create_employee(env, name=name, code=code, email=email)
        assert response.status_code == 201
    base = f"/api/v1/businesses/{env['business_id']}/employees"
    first_page = env["client"].get(f"{base}?limit=2&offset=0")
    second_page = env["client"].get(f"{base}?limit=2&offset=2")
    assert first_page.status_code == second_page.status_code == 200
    assert [row["name"] for row in first_page.json()] == ["Alice", "Bravo"]
    assert [row["name"] for row in second_page.json()] == ["Charlie"]
    assert env["client"].get(f"{base}?limit=201").status_code == 422
    assert env["client"].get(f"{base}?offset=-1").status_code == 422


def test_payroll_listing_filters_period_and_paginates_stably(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    for period in ["2026-08", "2026-09", "2026-10"]:
        created = env["client"].post(
            f"{base}/employees/{employee['id']}/payroll", json={"period": period}
        )
        assert created.status_code == 201
    all_rows = env["client"].get(f"{base}/payroll?limit=2&offset=0")
    next_page = env["client"].get(f"{base}/payroll?limit=2&offset=2")
    filtered = env["client"].get(f"{base}/payroll?period=2026-09")
    assert all_rows.status_code == next_page.status_code == filtered.status_code == 200
    assert [row["period"] for row in all_rows.json()] == ["2026-10", "2026-09"]
    assert [row["period"] for row in next_page.json()] == ["2026-08"]
    assert [row["period"] for row in filtered.json()] == ["2026-09"]
    assert env["client"].get(f"{base}/payroll?period=2026-13").status_code == 422


def test_reapproving_payroll_is_rejected_without_duplicate_audit(employee_environment):
    env = employee_environment
    employee = _create_employee(env).json()
    base = f"/api/v1/businesses/{env['business_id']}"
    created = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll", json={"period": "2026-11"}
    )
    assert created.status_code == 201
    payroll_id = created.json()["id"]
    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200
    before = approved.json()
    duplicate = env["client"].post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert duplicate.status_code == 409
    with app.state.session_factory() as session:
        persisted = session.get(PayrollRecord, UUID(payroll_id))
        assert persisted is not None
        assert persisted.status == "approved"
        assert persisted.approved_by_subject == before["approved_by_subject"]
        assert persisted.approved_at is not None
        assert session.scalar(select(func.count()).select_from(Expense)) == 0
        assert session.scalars(select(AuditEvent.action).where(
            AuditEvent.target_type == "payroll"
        ).order_by(AuditEvent.created_at, AuditEvent.action)).all() == [
            "payroll.created", "payroll.approved"
        ]
