from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base, Business, BusinessMembership, Employee, Expense, MembershipRole, PayrollRecord
from app.security import AuthenticatedPrincipal
from app.operations import financial_summary

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


def _create_employee(env, *, name="Mona Ali", code="EMP-01", email="mona@example.test", salary="5000.00"):
    response = env["client"].post(f"/api/v1/businesses/{env['business_id']}/employees", json={
        "name": name, "employee_code": code, "email": email,
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



def test_staff_cannot_read_payroll_expense_through_broad_surfaces(employee_environment, monkeypatch):
    """Payroll-linked expenses stay OWNER-only across list, reports and AI context."""
    env = employee_environment
    employee = _create_employee(env, name="Confidential Payroll Employee").json()
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-10"},
    )
    assert payroll.status_code == 201, payroll.text

    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll.json()['id']}/approve", json={})
    assert approved.status_code == 200, approved.text
    env["subject"]["value"] = OWNER
    paid = env["client"].post(f"{base}/payroll/{payroll.json()['id']}/pay", json={})
    assert paid.status_code == 200, paid.text

    ordinary_expense = env["client"].post(
        f"{base}/expenses",
        json={
            "category": "Office",
            "description": "Office supplies",
            "amount": "100.00",
            "currency_code": "EGP",
            "incurred_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        },
    )
    assert ordinary_expense.status_code == 201, ordinary_expense.text
    monkeypatch.setenv("OPENAI_API_KEY", "")

    env["subject"]["value"] = STAFF
    # The payroll expense is newer. Hiding it must happen before LIMIT/OFFSET,
    # otherwise STAFF receives an empty first page instead of the ordinary row.
    staff_expenses = env["client"].get(f"{base}/expenses", params={"limit": 1})
    assert staff_expenses.status_code == 200, staff_expenses.text
    assert len(staff_expenses.json()) == 1
    assert staff_expenses.json()[0]["description"] == "Office supplies"
    assert all("Confidential Payroll Employee" not in str(row) for row in staff_expenses.json())

    staff_export = env["client"].get(f"{base}/exports/expenses.csv")
    assert staff_export.status_code == 403
    with app.state.session_factory() as session:
        staff_internal_summary = financial_summary(
            session,
            principal=AuthenticatedPrincipal(STAFF),
            business_id=UUID(env["business_id"]),
        )
    assert staff_internal_summary["expenses"] == {"EGP": Decimal("100.00")}

    summary = env["client"].get(f"{base}/reports/summary")
    dashboard = env["client"].get(f"{base}/dashboard")
    profit_loss = env["client"].get(f"{base}/profit-loss", params={"period": "all"})
    insights = env["client"].get(f"{base}/assistant/insights")
    chat = env["client"].post(
        f"{base}/assistant/chat",
        json={"message": "Show me my expenses."},
    )
    for response in (summary, dashboard, profit_loss, insights, chat):
        assert response.status_code == 200, response.text

    assert summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 1, "total": "100.00"}
    ]
    assert dashboard.json()["expenses"] == [
        {"currency_code": "EGP", "count": 1, "total": "100.00"}
    ]
    profit_currency = next(
        row for row in profit_loss.json()["currencies"]
        if row["currency_code"] == "EGP"
    )
    assert profit_currency["expenses"] == "100.00"
    assert profit_currency["expense_count"] == 1
    assert insights.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 1, "total": "100.00"}
    ]
    assert "Confidential Payroll Employee" not in chat.text
    assert "5000.00" not in chat.text
    assert "payroll:" not in chat.text

    # OWNER retains access to the linked payroll expense and its totals.
    env["subject"]["value"] = OWNER
    owner_expenses = env["client"].get(f"{base}/expenses")
    assert owner_expenses.status_code == 200, owner_expenses.text
    assert len(owner_expenses.json()) == 2
    payroll_rows = [row for row in owner_expenses.json() if row["category"] == "Payroll"]
    assert len(payroll_rows) == 1
    assert payroll_rows[0]["vendor_name"] == "Confidential Payroll Employee"
    owner_summary = env["client"].get(f"{base}/reports/summary")
    assert owner_summary.status_code == 200, owner_summary.text
    assert owner_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 2, "total": "5100.00"}
    ]
    owner_export = env["client"].get(f"{base}/exports/expenses.csv")
    assert owner_export.status_code == 200
    assert "Confidential Payroll Employee" in owner_export.text

    # A payroll link in business A must not suppress ordinary expenses in business B.
    other_business = env["client"].post(
        "/api/v1/businesses",
        json={"name": "Second workspace", "currency_code": "EGP"},
    )
    assert other_business.status_code == 201, other_business.text
    other_business_id = other_business.json()["id"]
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=UUID(other_business_id),
            user_subject=STAFF,
            role=MembershipRole.STAFF,
        ))
        session.commit()
    other_expense = env["client"].post(
        f"/api/v1/businesses/{other_business_id}/expenses",
        json={
            "category": "Office",
            "description": "Second business supplies",
            "amount": "25.00",
            "currency_code": "EGP",
            "incurred_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert other_expense.status_code == 201, other_expense.text
    env["subject"]["value"] = STAFF
    other_staff_expenses = env["client"].get(
        f"/api/v1/businesses/{other_business_id}/expenses"
    )
    assert other_staff_expenses.status_code == 200, other_staff_expenses.text
    assert [row["description"] for row in other_staff_expenses.json()] == [
        "Second business supplies"
    ]



def test_payroll_visibility_composes_with_local_date_filters_and_offset_pagination(employee_environment):
    """Visibility is applied before every local-date filter and offset/limit page."""
    env = employee_environment
    employee = _create_employee(env, name="Date Filter Payroll Employee").json()
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll = env["client"].post(
        f"{base}/employees/{employee['id']}/payroll",
        json={"period": "2026-10"},
    )
    assert payroll.status_code == 201, payroll.text

    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll.json()['id']}/approve", json={})
    assert approved.status_code == 200, approved.text
    env["subject"]["value"] = OWNER
    paid = env["client"].post(f"{base}/payroll/{payroll.json()['id']}/pay", json={})
    assert paid.status_code == 200, paid.text

    with app.state.session_factory() as session:
        business = session.get(Business, UUID(env["business_id"]))
        business.timezone = "Africa/Cairo"
        payroll_record = session.get(PayrollRecord, UUID(payroll.json()["id"]))
        payroll_expense = session.get(Expense, payroll_record.expense_id)
        payroll_expense.incurred_at = datetime(2026, 1, 16, 22, 30, tzinfo=timezone.utc)
        session.commit()

    ordinary_expenses = [
        ("Ordinary Jan 14 late", datetime(2026, 1, 14, 21, 0, tzinfo=timezone.utc)),
        ("Ordinary Jan 15 noon", datetime(2026, 1, 15, 10, 0, tzinfo=timezone.utc)),
        ("Ordinary Jan 16 early", datetime(2026, 1, 15, 22, 30, tzinfo=timezone.utc)),
        ("Ordinary Jan 16 noon", datetime(2026, 1, 16, 10, 0, tzinfo=timezone.utc)),
    ]
    for description, incurred_at in ordinary_expenses:
        response = env["client"].post(
            f"{base}/expenses",
            json={
                "category": "Office",
                "description": description,
                "amount": "10.00",
                "currency_code": "EGP",
                "incurred_at": incurred_at.isoformat(),
            },
        )
        assert response.status_code == 201, response.text

    env["subject"]["value"] = STAFF
    # Start-only includes Jan 15 onward. Payroll Jan 17 is newer than every
    # ordinary row, so limit=1 proves the visibility predicate precedes pagination.
    staff_start_only = env["client"].get(
        f"{base}/expenses", params={"start_date": "2026-01-15", "limit": 1},
    )
    assert staff_start_only.status_code == 200, staff_start_only.text
    assert [row["description"] for row in staff_start_only.json()] == ["Ordinary Jan 16 noon"]

    # End-only includes dates through the Cairo-local Jan 15 half-open boundary.
    staff_end_only = env["client"].get(
        f"{base}/expenses",
        params={"end_date": "2026-01-15", "offset": 1, "limit": 1},
    )
    assert staff_end_only.status_code == 200, staff_end_only.text
    assert [row["description"] for row in staff_end_only.json()] == ["Ordinary Jan 14 late"]

    # Combined range plus a later offset must still page only visible ordinary rows.
    staff_combined = env["client"].get(
        f"{base}/expenses",
        params={
            "start_date": "2026-01-15",
            "end_date": "2026-01-16",
            "offset": 2,
            "limit": 1,
        },
    )
    assert staff_combined.status_code == 200, staff_combined.text
    assert [row["description"] for row in staff_combined.json()] == ["Ordinary Jan 15 noon"]

    staff_pay_attempt = env["client"].post(
        f"{base}/payroll/{payroll.json()['id']}/pay", json={},
    )
    assert staff_pay_attempt.status_code == 403
    staff_export_attempt = env["client"].get(f"{base}/exports/expenses.csv")
    assert staff_export_attempt.status_code == 403

    with app.state.session_factory() as session:
        before_expenses = session.scalar(
            select(func.count(Expense.id)).where(Expense.business_id == UUID(env["business_id"]))
        )
        before_audits = session.scalar(
            select(func.count(AuditEvent.id)).where(AuditEvent.business_id == UUID(env["business_id"]))
        )
        payroll_status = session.get(PayrollRecord, UUID(payroll.json()["id"])).status
    assert payroll_status == "paid"

    env["subject"]["value"] = OWNER
    owner_start_only = env["client"].get(
        f"{base}/expenses", params={"start_date": "2026-01-15", "limit": 1},
    )
    assert owner_start_only.status_code == 200, owner_start_only.text
    assert owner_start_only.json()[0]["category"] == "Payroll"
    owner_payroll_day = env["client"].get(
        f"{base}/expenses",
        params={"start_date": "2026-01-17", "end_date": "2026-01-17"},
    )
    assert owner_payroll_day.status_code == 200, owner_payroll_day.text
    assert [row["category"] for row in owner_payroll_day.json()] == ["Payroll"]

    with app.state.session_factory() as session:
        after_expenses = session.scalar(
            select(func.count(Expense.id)).where(Expense.business_id == UUID(env["business_id"]))
        )
        after_audits = session.scalar(
            select(func.count(AuditEvent.id)).where(AuditEvent.business_id == UUID(env["business_id"]))
        )
        after_status = session.get(PayrollRecord, UUID(payroll.json()["id"])).status
    assert after_expenses == before_expenses
    assert after_audits == before_audits
    assert after_status == payroll_status
