"""PostgreSQL-only financial concurrency regressions for the release gate.

These tests deliberately use a separate temporary schema in the disposable CI
database. They skip outside PostgreSQL; they never point at production and never
drop or truncate the shared database.
"""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import os
import re
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from fastapi.testclient import TestClient

from app.main import app

from app.models import (
    AuditEvent,
    Base,
    Business,
    BusinessMembership,
    Customer,
    Employee,
    Expense,
    Invoice,
    InvoiceLine,
    MembershipRole,
    PayrollRecord,
    Payment,
    PaymentAllocation,
    Product,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
)
from app.operations import approve_sales_return
from app.security import AuthenticatedPrincipal
from app.services import (
    WorkflowError,
    create_invoice,
    create_product,
    issue_invoice,
    record_payment,
    record_stock_movement,
    void_invoice,
)


@pytest.fixture()
def postgres_engine():
    configured_url = os.getenv("TEST_DATABASE_URL")
    if os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true":
        pytest.skip("PostgreSQL concurrency tests require explicit opt-in for isolated-schema creation.")
    if not configured_url:
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database to run concurrency tests.")

    url = make_url(configured_url)
    database_name = (url.database or "").lower()
    if not re.search(r"(?:^|[_-])(?:test|ci|disposable|tmp)(?:$|[_-])", database_name):
        pytest.fail("Refusing schema creation: TEST_DATABASE_URL database name must include test, ci, disposable, or tmp.")
    if url.get_backend_name() != "postgresql":
        pytest.skip("Financial concurrency tests require PostgreSQL row-lock semantics.")

    schema = f"ci_financial_{uuid4().hex}"
    admin_engine = create_engine(url, pool_pre_ping=True)
    engine = None
    schema_created = False
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        schema_created = True

        # Every pooled connection uses the isolated schema as its search path.
        engine = create_engine(
            url,
            connect_args={"options": f"-csearch_path={schema}"},
            pool_size=8,
            max_overflow=0,
            pool_pre_ping=True,
        )
        Base.metadata.create_all(engine)
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        if schema_created:
            with admin_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


@pytest.fixture()
def pg_workspace(postgres_engine):
    principal = AuthenticatedPrincipal(subject="pg-concurrency-owner")
    with Session(postgres_engine) as session:
        business = Business(name="PostgreSQL concurrency test", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Synthetic CI customer")
        session.add(customer)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject=principal.subject,
            role=MembershipRole.OWNER,
        ))
        session.commit()
        values = {
            "business_id": business.id,
            "customer_id": customer.id,
            "principal": principal,
        }
    return values


def _make_issued_invoice(postgres_engine, workspace, number: str, amount: str = "100.00"):
    with Session(postgres_engine) as session:
        invoice = create_invoice(
            session,
            principal=workspace["principal"],
            business_id=workspace["business_id"],
            customer_id=workspace["customer_id"],
            invoice_number=f"{number}-{uuid4().hex[:8]}",
            currency_code="EGP",
            lines=[{
                "description": "Synthetic service",
                "quantity": "1.000",
                "unit_price": amount,
            }],
        )
        issue_invoice(
            session,
            principal=workspace["principal"],
            business_id=workspace["business_id"],
            invoice_id=invoice.id,
        )
        line = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == workspace["business_id"],
        )).one()
        session.commit()
        return invoice.id, line.id


def _run_two_concurrently(operation):
    barrier = Barrier(2)

    def run(index):
        barrier.wait(timeout=15)
        return operation(index)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, i) for i in range(2)]
        return [future.result(timeout=45) for future in futures]


def test_concurrent_retry_with_same_payment_idempotency_key_returns_one_payment(
    postgres_engine, pg_workspace,
):
    invoice_id, _ = _make_issued_invoice(postgres_engine, pg_workspace, "IDEMP")
    key = f"retry-{uuid4().hex}"

    def record(_index):
        with Session(postgres_engine) as session:
            try:
                payment = record_payment(
                    session,
                    principal=pg_workspace["principal"],
                    business_id=pg_workspace["business_id"],
                    customer_id=pg_workspace["customer_id"],
                    amount=Decimal("50.00"),
                    currency_code="EGP",
                    idempotency_key=key,
                    allocations=[(invoice_id, Decimal("50.00"))],
                )
                session.commit()
                return ("ok", payment.id)
            except Exception as exc:
                session.rollback()
                return ("error", type(exc).__name__, str(exc))

    results = _run_two_concurrently(record)
    assert all(result[0] == "ok" for result in results), results
    assert results[0][1] == results[1][1]

    with Session(postgres_engine) as session:
        assert session.scalar(select(func.count()).select_from(Payment)) == 1
        assert session.scalar(select(func.count()).select_from(PaymentAllocation)) == 1
        allocated = session.scalar(select(func.sum(PaymentAllocation.amount)))
        assert allocated == Decimal("50.00")


def test_concurrent_payments_cannot_overallocate_an_invoice(postgres_engine, pg_workspace):
    invoice_id, _ = _make_issued_invoice(postgres_engine, pg_workspace, "OVERALLOC")

    def record(index):
        with Session(postgres_engine) as session:
            try:
                payment = record_payment(
                    session,
                    principal=pg_workspace["principal"],
                    business_id=pg_workspace["business_id"],
                    customer_id=pg_workspace["customer_id"],
                    amount=Decimal("75.00"),
                    currency_code="EGP",
                    idempotency_key=f"overalloc-{index}-{uuid4().hex}",
                    allocations=[(invoice_id, Decimal("75.00"))],
                )
                session.commit()
                return ("ok", payment.id)
            except ValueError as exc:
                session.rollback()
                return ("rejected", str(exc))
            except Exception as exc:
                session.rollback()
                return ("error", type(exc).__name__, str(exc))

    results = _run_two_concurrently(record)
    assert sum(result[0] == "ok" for result in results) == 1, results
    assert sum(result[0] == "rejected" for result in results) == 1, results

    with Session(postgres_engine) as session:
        assert session.scalar(select(func.count()).select_from(Payment)) == 1
        allocated = session.scalar(select(func.sum(PaymentAllocation.amount)))
        assert allocated == Decimal("75.00")
        invoice = session.get(Invoice, invoice_id)
        assert invoice is not None
        assert invoice.total - allocated == Decimal("25.00")


def test_concurrent_stock_sales_cannot_overdraw_inventory(postgres_engine, pg_workspace):
    business_id = pg_workspace["business_id"]
    principal = pg_workspace["principal"]
    with Session(postgres_engine) as session:
        product = create_product(
            session,
            principal=principal,
            business_id=business_id,
            name="Concurrent stock item",
            unit_price=Decimal("10.00"),
            is_stock_tracked=True,
        )
        record_stock_movement(
            session,
            principal=principal,
            business_id=business_id,
            product_id=product.id,
            movement_type="opening",
            quantity_delta=Decimal("5.000"),
        )
        session.commit()
        product_id = product.id

    def sell(_index):
        with Session(postgres_engine) as session:
            try:
                movement = record_stock_movement(
                    session,
                    principal=principal,
                    business_id=business_id,
                    product_id=product_id,
                    movement_type="sale",
                    quantity_delta=Decimal("-4.000"),
                )
                session.commit()
                return ("ok", movement.id)
            except WorkflowError as exc:
                session.rollback()
                return ("rejected", str(exc))
            except Exception as exc:
                session.rollback()
                return ("error", type(exc).__name__, str(exc))

    results = _run_two_concurrently(sell)
    assert sum(result[0] == "ok" for result in results) == 1, results
    assert sum(result[0] == "rejected" for result in results) == 1, results

    with Session(postgres_engine) as session:
        movements = session.scalars(select(StockMovement).where(
            StockMovement.product_id == product_id,
            StockMovement.business_id == business_id,
        )).all()
        assert sum((movement.quantity_delta for movement in movements), Decimal("0")) == Decimal("1.000")
        assert sum(movement.movement_type == "sale" for movement in movements) == 1


def test_concurrent_approvals_cannot_overreturn_invoice_line(postgres_engine, pg_workspace):
    business_id = pg_workspace["business_id"]
    principal = pg_workspace["principal"]
    invoice_id, invoice_line_id = _make_issued_invoice(postgres_engine, pg_workspace, "RETURN-RACE")
    return_ids = []
    with Session(postgres_engine) as session:
        for _ in range(2):
            sales_return = SalesReturn(
                business_id=business_id,
                invoice_id=invoice_id,
                status="draft",
                total=Decimal("75.00"),
            )
            session.add(sales_return)
            session.flush()
            session.add(SalesReturnLine(
                business_id=business_id,
                sales_return_id=sales_return.id,
                invoice_line_id=invoice_line_id,
                quantity=Decimal("0.750"),
                amount=Decimal("75.00"),
            ))
            return_ids.append(sales_return.id)
        session.commit()

    def approve(index):
        with Session(postgres_engine) as session:
            try:
                result = approve_sales_return(
                    session,
                    principal=principal,
                    business_id=business_id,
                    sales_return_id=return_ids[index],
                )
                session.commit()
                return ("ok", result.id)
            except ValueError as exc:
                session.rollback()
                return ("rejected", str(exc))
            except Exception as exc:
                session.rollback()
                return ("error", type(exc).__name__, str(exc))

    results = _run_two_concurrently(approve)
    assert sum(result[0] == "ok" for result in results) == 1, results
    assert sum(result[0] == "rejected" for result in results) == 1, results

    with Session(postgres_engine) as session:
        approved = session.scalars(select(SalesReturn).where(
            SalesReturn.business_id == business_id,
            SalesReturn.invoice_id == invoice_id,
            SalesReturn.status == "approved",
        )).all()
        assert len(approved) == 1
        assert sum((item.total for item in approved), Decimal("0")) == Decimal("75.00")
        line = session.get(InvoiceLine, invoice_line_id)
        assert line is not None and line.quantity == Decimal("1.000")


def test_concurrent_invoice_void_and_approved_return_never_double_restore(
    postgres_engine, pg_workspace,
):
    business_id = pg_workspace["business_id"]
    customer_id = pg_workspace["customer_id"]
    principal = pg_workspace["principal"]

    with Session(postgres_engine) as session:
        product = create_product(
            session,
            principal=principal,
            business_id=business_id,
            name="Concurrent returned stock",
            unit_price=Decimal("10.00"),
            is_stock_tracked=True,
        )
        record_stock_movement(
            session,
            principal=principal,
            business_id=business_id,
            product_id=product.id,
            movement_type="opening",
            quantity_delta=Decimal("10.000"),
            reason="Opening stock",
        )
        invoice = create_invoice(
            session,
            principal=principal,
            business_id=business_id,
            customer_id=customer_id,
            invoice_number=f"VOID-RETURN-RACE-{uuid4().hex[:8]}",
            currency_code="EGP",
            lines=[{"product_id": str(product.id), "quantity": "10"}],
        )
        issue_invoice(
            session,
            principal=principal,
            business_id=business_id,
            invoice_id=invoice.id,
        )
        invoice_line = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        )).one()
        sales_return = SalesReturn(
            business_id=business_id,
            invoice_id=invoice.id,
            status="draft",
            total=Decimal("30.00"),
        )
        session.add(sales_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_id,
            sales_return_id=sales_return.id,
            invoice_line_id=invoice_line.id,
            quantity=Decimal("3.000"),
            amount=Decimal("30.00"),
        ))
        session.commit()
        invoice_id, return_id, product_id = invoice.id, sales_return.id, product.id

    def approve(_index):
        with Session(postgres_engine) as session:
            try:
                result = approve_sales_return(
                    session,
                    principal=principal,
                    business_id=business_id,
                    sales_return_id=return_id,
                )
                session.commit()
                return ("approved", result.id)
            except ValueError as exc:
                session.rollback()
                return ("rejected", str(exc))
            except Exception as exc:
                session.rollback()
                return ("error", type(exc).__name__, str(exc))

    def void(_index):
        with Session(postgres_engine) as session:
            try:
                result = void_invoice(
                    session,
                    principal=principal,
                    business_id=business_id,
                    invoice_id=invoice_id,
                    reason="Concurrent void/return regression",
                )
                session.commit()
                return ("voided", result.id)
            except ValueError as exc:
                session.rollback()
                return ("rejected", str(exc))
            except Exception as exc:
                session.rollback()
                return ("error", type(exc).__name__, str(exc))

    results = _run_two_concurrently(lambda index: approve(index) if index == 0 else void(index))
    assert sum(result[0] in {"approved", "voided"} for result in results) == 1, results
    assert sum(result[0] == "rejected" for result in results) == 1, results

    with Session(postgres_engine) as session:
        invoice = session.get(Invoice, invoice_id)
        sales_return = session.get(SalesReturn, return_id)
        assert invoice is not None and sales_return is not None
        movements = session.scalars(select(StockMovement).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product_id,
        )).all()
        balance = sum((item.quantity_delta for item in movements), Decimal("0"))
        void_movements = [
            item for item in movements
            if item.reference_type == "invoice_void" and item.reference_id == invoice_id
        ]
        return_movements = [
            item for item in movements
            if item.reference_type == "sales_return" and item.reference_id == return_id
        ]
        if invoice.status == "issued":
            assert sales_return.status == "approved"
            assert balance == Decimal("3.000")
            assert not void_movements
            assert sum((item.quantity_delta for item in return_movements), Decimal("0")) == Decimal("3.000")
            expected_audit_action = "sales_return.approved"
        else:
            assert invoice.status == "void"
            assert sales_return.status == "draft"
            assert balance == Decimal("10.000")
            assert sum((item.quantity_delta for item in void_movements), Decimal("0")) == Decimal("10.000")
            assert not return_movements
            expected_audit_action = "invoice.voided"

        lifecycle_events = session.scalars(select(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.target_id.in_([str(invoice_id), str(return_id)]),
            AuditEvent.action.in_(["sales_return.approved", "invoice.voided"]),
        )).all()
        assert len(lifecycle_events) == 1, (
            "only the winning lifecycle transition may append an audit event"
        )
        assert lifecycle_events[0].action == expected_audit_action


def test_concurrent_payroll_creation_for_same_employee_period_commits_once(
    postgres_engine, pg_workspace, monkeypatch,
):
    """Real PostgreSQL row locking + unique constraint must allow one payroll only."""
    business_id = pg_workspace["business_id"]
    principal = pg_workspace["principal"]
    with Session(postgres_engine) as session:
        employee = Employee(
            business_id=business_id,
            employee_code="PAYROLL-RACE",
            name="Concurrent payroll employee",
            monthly_salary=Decimal("4200.00"),
            is_active=True,
        )
        session.add(employee)
        session.commit()
        employee_id = employee.id

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    monkeypatch.setattr(
        app.state, "session_factory",
        sessionmaker(bind=postgres_engine, expire_on_commit=False),
        raising=False,
    )
    monkeypatch.setattr(
        app.state, "principal_resolver",
        lambda request: principal,
        raising=False,
    )
    barrier = Barrier(2)
    base = f"/api/v1/businesses/{business_id}"

    def create(_index):
        client = TestClient(app)
        barrier.wait(timeout=15)
        response = client.post(
            f"{base}/employees/{employee_id}/payroll",
            json={"period": "2026-12", "allowances": "125.00"},
        )
        return response.status_code, response.json()

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(create, range(2)))

        assert sorted(status for status, _ in results) == [201, 409], results
        with Session(postgres_engine) as session:
            records = session.scalars(select(PayrollRecord).where(
                PayrollRecord.business_id == business_id,
                PayrollRecord.employee_id == employee_id,
                PayrollRecord.period == "2026-12",
            )).all()
            assert len(records) == 1
            assert records[0].status == "draft"
            assert records[0].net_pay == Decimal("4325.00")
            assert session.scalar(select(func.count()).select_from(Expense).where(
                Expense.business_id == business_id,
            )) == 0
            actions = session.scalars(select(AuditEvent.action).where(
                AuditEvent.business_id == business_id,
                AuditEvent.target_type == "payroll",
                AuditEvent.target_id == str(records[0].id),
            )).all()
            assert actions == ["payroll.created"]
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


def test_concurrent_payroll_payment_records_one_expense_and_paid_audit(
    postgres_engine, pg_workspace, monkeypatch,
):
    """Concurrent recorded /pay requests must create one linked expense and audit."""
    business_id = pg_workspace["business_id"]
    principal = pg_workspace["principal"]
    with Session(postgres_engine) as session:
        employee = Employee(
            business_id=business_id,
            employee_code="PAYROLL-PAY-RACE",
            name="Concurrent payout employee",
            monthly_salary=Decimal("4200.00"),
            is_active=True,
        )
        session.add(employee)
        session.commit()
        employee_id = employee.id

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    monkeypatch.setattr(
        app.state, "session_factory",
        sessionmaker(bind=postgres_engine, expire_on_commit=False),
        raising=False,
    )
    monkeypatch.setattr(
        app.state, "principal_resolver",
        lambda request: principal,
        raising=False,
    )

    base = f"/api/v1/businesses/{business_id}"
    client = TestClient(app)
    created = client.post(
        f"{base}/employees/{employee_id}/payroll",
        json={"period": "2026-12"},
    )
    assert created.status_code == 201, created.text
    payroll_id = created.json()["id"]
    approved = client.post(f"{base}/payroll/{payroll_id}/approve", json={})
    assert approved.status_code == 200, approved.text

    def pay(_index):
        response = TestClient(app).post(f"{base}/payroll/{payroll_id}/pay")
        return response.status_code, response.json()

    try:
        results = _run_two_concurrently(pay)
        assert sorted(status for status, _ in results) == [200, 409], results

        with Session(postgres_engine) as session:
            record = session.scalars(select(PayrollRecord).where(
                PayrollRecord.id == payroll_id,
                PayrollRecord.business_id == business_id,
            )).one()
            expenses = session.scalars(select(Expense).where(
                Expense.business_id == business_id,
                Expense.id == record.expense_id,
            )).all()
            assert record.status == "paid"
            assert record.expense_id is not None
            assert len(expenses) == 1
            assert expenses[0].amount == record.net_pay
            assert expenses[0].reference == f"payroll:{record.id}"

            payroll_actions = session.scalars(select(AuditEvent.action).where(
                AuditEvent.business_id == business_id,
                AuditEvent.target_type == "payroll",
                AuditEvent.target_id == str(record.id),
            )).all()
            assert payroll_actions.count("payroll.created") == 1
            assert payroll_actions.count("payroll.approved") == 1
            assert payroll_actions.count("payroll.paid") == 1
            assert len(payroll_actions) == 3
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
