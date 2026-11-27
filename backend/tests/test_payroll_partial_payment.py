"""3A-920 step 5 — partial salary payment («دفع جزء»).

An approved payroll record can receive partial payments: each one is
its own Payroll expense plus a payroll_payments ledger row, and the
remainder stays due. The record flips to 'paid' only when the
payments sum reaches the net pay. The full-pay endpoint settles the
remainder — for a record with no partial payments its behavior is
exactly what it was before this step.
"""
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, Expense, MembershipRole, PayrollPayment
from app.security import AuthenticatedPrincipal

OWNER = "payroll-partial-test-owner"
APPROVER = "payroll-partial-test-approver"
STAFF = "payroll-partial-test-staff"


@pytest.fixture
def partial_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Partial pay test", "currency_code": "EGP"})
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


def _as(env, subject):
    env["subject"]["value"] = subject


def _make_approved_payroll(env, *, salary="1000.00", period="2026-11", code="EMP-01"):
    client = env["client"]
    base = f"/api/v1/businesses/{env['business_id']}"
    employee = client.post(f"{base}/employees", json={
        "name": f"Employee {code}", "employee_code": code,
        "email": f"{code.lower()}@example.test", "monthly_salary": salary,
    })
    assert employee.status_code == 201, employee.text
    payroll = client.post(f"{base}/employees/{employee.json()['id']}/payroll", json={
        "period": period, "allowances": "0", "bonuses": "0", "deductions": "0",
    })
    assert payroll.status_code == 201, payroll.text
    payroll_id = payroll.json()["id"]
    _as(env, APPROVER)
    approved = client.post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200, approved.text
    _as(env, OWNER)
    return payroll_id


def _pay_part(env, payroll_id, amount):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/payroll/{payroll_id}/payments",
        json={"amount": amount},
    )


def _pay_full(env, payroll_id):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/payroll/{payroll_id}/pay", json={}
    )


def _listed(env, payroll_id):
    rows = env["client"].get(f"/api/v1/businesses/{env['business_id']}/payroll")
    assert rows.status_code == 200, rows.text
    return next(row for row in rows.json() if row["id"] == payroll_id)


def _payment_expenses(env, payroll_id):
    with app.state.session_factory() as session:
        return list(session.scalars(
            select(Expense).where(Expense.reference == f"payroll:{payroll_id}")
        ))


def _ledger_rows(env, payroll_id):
    with app.state.session_factory() as session:
        return list(session.scalars(
            select(PayrollPayment).where(PayrollPayment.payroll_record_id == UUID(payroll_id))
        ))


def test_partial_payment_keeps_remainder_due(partial_environment):
    env = partial_environment
    payroll_id = _make_approved_payroll(env)
    response = _pay_part(env, payroll_id, "400.00")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["paid_amount"] == "400.00"
    assert body["remaining_amount"] == "600.00"
    assert body["status"] == "approved"
    assert body["expense_id"] is None
    assert body["paid_at"] is None
    listed = _listed(env, payroll_id)
    assert listed["paid_amount"] == "400.00"
    assert listed["remaining_amount"] == "600.00"
    expenses = _payment_expenses(env, payroll_id)
    assert len(expenses) == 1
    assert expenses[0].amount == Decimal("400.00")
    assert expenses[0].category == "Payroll"
    ledger = _ledger_rows(env, payroll_id)
    assert len(ledger) == 1
    assert ledger[0].amount == Decimal("400.00")
    assert ledger[0].expense_id == expenses[0].id


def test_second_partial_completes_the_record(partial_environment):
    env = partial_environment
    payroll_id = _make_approved_payroll(env)
    assert _pay_part(env, payroll_id, "400.00").status_code == 201
    response = _pay_part(env, payroll_id, "600.00")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "paid"
    assert body["paid_amount"] == "1000.00"
    assert body["remaining_amount"] == "0.00"
    assert body["paid_at"] is not None
    expenses = _payment_expenses(env, payroll_id)
    assert sum(e.amount for e in expenses) == Decimal("1000.00")
    completing = next(e for e in expenses if e.amount == Decimal("600.00"))
    assert body["expense_id"] == str(completing.id)
    assert len(_ledger_rows(env, payroll_id)) == 2


def test_full_pay_after_partial_settles_remainder_only(partial_environment):
    env = partial_environment
    payroll_id = _make_approved_payroll(env)
    assert _pay_part(env, payroll_id, "250.00").status_code == 201
    response = _pay_full(env, payroll_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "paid"
    assert body["paid_amount"] == "1000.00"
    assert body["remaining_amount"] == "0.00"
    expenses = _payment_expenses(env, payroll_id)
    assert sorted(e.amount for e in expenses) == [Decimal("250.00"), Decimal("750.00")]
    assert len(_ledger_rows(env, payroll_id)) == 2


def test_full_pay_without_partials_is_unchanged(partial_environment):
    env = partial_environment
    payroll_id = _make_approved_payroll(env)
    response = _pay_full(env, payroll_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "paid"
    assert body["paid_amount"] == "1000.00"
    assert body["remaining_amount"] == "0.00"
    expenses = _payment_expenses(env, payroll_id)
    assert len(expenses) == 1
    assert expenses[0].amount == Decimal("1000.00")
    assert body["expense_id"] == str(expenses[0].id)
    assert len(_ledger_rows(env, payroll_id)) == 1


def test_payment_guards(partial_environment):
    env = partial_environment
    client = env["client"]
    base = f"/api/v1/businesses/{env['business_id']}"
    employee = client.post(f"{base}/employees", json={
        "name": "Draft Employee", "employee_code": "EMP-DRAFT",
        "email": "draft@example.test", "monthly_salary": "1000.00",
    })
    draft = client.post(f"{base}/employees/{employee.json()['id']}/payroll", json={
        "period": "2026-11", "allowances": "0", "bonuses": "0", "deductions": "0",
    })
    draft_id = draft.json()["id"]
    # Drafts cannot receive payments.
    assert _pay_part(env, draft_id, "10.00").status_code == 409
    payroll_id = _make_approved_payroll(env, code="EMP-02", period="2026-12")
    # Overpayment and non-positive amounts are refused.
    assert _pay_part(env, payroll_id, "1000.01").status_code == 422
    assert _pay_part(env, payroll_id, "0").status_code == 422
    assert _pay_part(env, payroll_id, "-5").status_code == 422
    # Unknown record.
    assert _pay_part(env, "00000000-0000-0000-0000-000000000000", "1.00").status_code == 404
    # Staff cannot pay.
    _as(env, STAFF)
    assert _pay_part(env, payroll_id, "1.00").status_code == 403
    _as(env, OWNER)
    # A completed record refuses further payments on both paths.
    assert _pay_full(env, payroll_id).status_code == 200
    assert _pay_part(env, payroll_id, "1.00").status_code == 409
    assert _pay_full(env, payroll_id).status_code == 409


def test_partial_payment_is_tenant_scoped(partial_environment):
    env = partial_environment
    payroll_id = _make_approved_payroll(env)
    other = env["client"].post("/api/v1/businesses", json={"name": "Other", "currency_code": "EGP"})
    assert other.status_code == 201
    response = env["client"].post(
        f"/api/v1/businesses/{other.json()['id']}/payroll/{payroll_id}/payments",
        json={"amount": "1.00"},
    )
    assert response.status_code == 404, response.text
