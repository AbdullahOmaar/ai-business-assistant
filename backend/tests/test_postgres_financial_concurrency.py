"""PostgreSQL-only financial concurrency regressions for the release gate.

These tests deliberately use a separate temporary schema in the disposable CI
database. They skip outside PostgreSQL; they never point at production and never
drop or truncate the shared database.
"""
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import os
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models import (
    Base,
    Business,
    BusinessMembership,
    Customer,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Payment,
    PaymentAllocation,
    Product,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
)
from app.operations import WorkflowError as OperationsWorkflowError, approve_sales_return
from app.security import AuthenticatedPrincipal
from app.services import (
    WorkflowError,
    create_invoice,
    create_product,
    issue_invoice,
    record_payment,
    record_stock_movement,
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
    if not any(marker in database_name for marker in ("test", "ci", "disposable", "tmp")):
        pytest.fail("Refusing schema creation: TEST_DATABASE_URL database name must include test, ci, disposable, or tmp.")
    if url.get_backend_name() != "postgresql":
        pytest.skip("Financial concurrency tests require PostgreSQL row-lock semantics.")

    schema = f"ci_financial_{uuid4().hex}"
    admin_engine = create_engine(url, pool_pre_ping=True)
    engine = None
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))

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
            except WorkflowError as exc:
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
            except OperationsWorkflowError as exc:
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
