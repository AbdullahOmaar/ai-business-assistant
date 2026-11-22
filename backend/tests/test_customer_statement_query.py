"""SQL-side customer statement pagination, balances, currencies and timezone regressions."""
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import customer_statement
from app.models import (
    Base,
    Business,
    BusinessMembership,
    Customer,
    Invoice,
    MembershipRole,
    Payment,
    PaymentAllocation,
)
from app.security import AuthenticatedPrincipal


def _statement_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    utc = UTC
    with Session(engine) as session:
        business = Business(
            name="Statement SQL Test",
            currency_code="USD",
            timezone="America/New_York",
        )
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Statement Customer", is_active=True)
        session.add(customer)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="statement-owner",
            role=MembershipRole.OWNER,
        ))
        session.flush()

        def invoice(number, currency, total, issued_at, status="issued"):
            return Invoice(
                business_id=business.id,
                customer_id=customer.id,
                invoice_number=number,
                status=status,
                currency_code=currency,
                issue_date=datetime.fromisoformat(issued_at).replace(tzinfo=utc),
                subtotal=Decimal(total),
                tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"),
                total=Decimal(total),
                created_at=datetime.fromisoformat(issued_at).replace(tzinfo=utc),
            )

        usd_invoice = invoice("INV-USD-1", "USD", "100.00", "2026-11-18T23:30:00")
        eur_invoice = invoice("INV-EUR-1", "EUR", "50.00", "2026-11-19T01:00:00")
        next_local_day = invoice("INV-NEXT-DAY", "USD", "40.00", "2026-11-19T05:30:00")
        draft_invoice = invoice("INV-DRAFT", "USD", "999.00", "2026-11-18T22:00:00", status="draft")
        session.add_all([usd_invoice, eur_invoice, next_local_day, draft_invoice])
        session.flush()

        usd_payment = Payment(
            business_id=business.id,
            customer_id=customer.id,
            amount=Decimal("30.00"),
            currency_code="USD",
            received_at=datetime(2026, 11, 19, 2, 0, tzinfo=utc),
            method="cash",
            reference="PAY-USD",
            idempotency_key="statement-payment-usd",
        )
        mismatch_payment = Payment(
            business_id=business.id,
            customer_id=customer.id,
            amount=Decimal("10.00"),
            currency_code="USD",
            received_at=datetime(2026, 11, 19, 3, 0, tzinfo=utc),
            method="cash",
            reference="PAY-MISMATCH",
            idempotency_key="statement-payment-mismatch",
        )
        session.add_all([usd_payment, mismatch_payment])
        session.flush()
        session.add_all([
            PaymentAllocation(
                business_id=business.id,
                payment_id=usd_payment.id,
                invoice_id=usd_invoice.id,
                amount=Decimal("30.00"),
            ),
            PaymentAllocation(
                business_id=business.id,
                payment_id=mismatch_payment.id,
                invoice_id=eur_invoice.id,
                amount=Decimal("10.00"),
            ),
        ])
        session.commit()
        ids = business.id, customer.id
    return engine, ids


def test_customer_statement_keeps_currency_and_local_day_semantics_with_sql_pagination():
    engine, (business_id, customer_id) = _statement_workspace()
    statements = []

    def capture_sql(connection, cursor, statement, parameters, context, executemany):
        if "customer_statement_windowed" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_sql)
    try:
        with Session(engine) as session:
            page = customer_statement(
                business_id=business_id,
                customer_id=customer_id,
                from_date=datetime(2026, 11, 18).date(),
                to_date=datetime(2026, 11, 18).date(),
                limit=2,
                offset=1,
                session=session,
                principal=AuthenticatedPrincipal(subject="statement-owner"),
            )
        assert page["customer"]["name"] == "Statement Customer"
        assert page["total"] == 4
        assert page["limit"] == 2 and page["offset"] == 1
        assert [item["event_type"] for item in page["items"]] == [
            "invoice_issued",
            "payment_allocation",
        ]
        assert page["items"][0]["reference"] == "INV-EUR-1"
        assert page["items"][1]["reference"] == "PAY-USD"
        assert page["items"][1]["balance"] == "70.00"
        assert page["balances_by_currency"] == {"EUR": "50.00", "USD": "70.00"}
        assert any("LIMIT" in sql.upper() and "OFFSET" in sql.upper()
                   and "customer_statement_windowed" in sql for sql in statements)
    finally:
        event.remove(engine, "before_cursor_execute", capture_sql)
        engine.dispose()


def test_customer_statement_mismatch_allocations_are_visible_but_never_reduce_balance():
    engine, (business_id, customer_id) = _statement_workspace()
    try:
        with Session(engine) as session:
            statement = customer_statement(
                business_id=business_id,
                customer_id=customer_id,
                from_date=datetime(2026, 11, 18).date(),
                to_date=datetime(2026, 11, 18).date(),
                limit=20,
                offset=0,
                session=session,
                principal=AuthenticatedPrincipal(subject="statement-owner"),
            )
        mismatch = next(item for item in statement["items"]
                        if item["event_type"] == "currency_mismatch_allocation")
        assert mismatch["reference"] == "PAY-MISMATCH"
        assert mismatch["currency_code"] == "USD"
        assert mismatch["credit"] == "10.00"
        assert mismatch["affects_balance"] is False
        assert mismatch["balance"] == "70.00"
        assert statement["balances_by_currency"] == {"EUR": "50.00", "USD": "70.00"}
        assert any("Issued credit notes are excluded" in item
                   for item in statement["limitations"])
    finally:
        engine.dispose()
