"""Extended business endpoints: aging, insights, statements, audit and integrity reports (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from sqlalchemy import (
    Numeric,
    String,
    case,
    cast,
    func,
    literal,
    select,
    union_all,
)
from sqlalchemy.orm import Session

from app.core_features_api import _day_bounds
from app.dependencies import get_principal, get_session
from app.extended_common import (
    ZERO,
    _authorized,
    _payable_classify,
    _payable_outstanding,
    _receivable_aging_bucket,
    _receivable_outstanding,
    router,
)
from app.models import (
    AuditEvent,
    Business,
    Customer,
    Expense,
    Invoice,
    Payment,
    PaymentAllocation,
    Product,
    PurchaseOrder,
    StockMovement,
    Supplier,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    MembershipRole,
    apply_expense_visibility,
    authorize_membership,
)


@router.get("/reports/receivables-aging")
def receivables_aging(
    business_id: UUID,
    as_of: date | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Return open issued-invoice balances by currency without cross-currency netting."""
    try:
        _authorized(session, principal, business_id)
        report_date = as_of or datetime.now(UTC).date()
        invoices = session.scalars(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.status == "issued",
            ).order_by(
                Invoice.currency_code, Invoice.due_date, Invoice.invoice_number
            )
        ).all()

        # Join on both record IDs and workspace IDs so corrupt cross-workspace links
        # cannot influence this business's balances.
        allocation_rows = session.execute(
            select(PaymentAllocation, Payment, Invoice)
            .join(
                Payment,
                (Payment.id == PaymentAllocation.payment_id)
                & (Payment.business_id == PaymentAllocation.business_id),
            )
            .join(
                Invoice,
                (Invoice.id == PaymentAllocation.invoice_id)
                & (Invoice.business_id == PaymentAllocation.business_id),
            )
            .where(
                PaymentAllocation.business_id == business_id,
                Payment.business_id == business_id,
                Invoice.business_id == business_id,
                Invoice.status == "issued",
            )
        ).all()
        allocated_by_invoice: dict[UUID, Decimal] = {}
        mismatched_by_invoice: dict[UUID, dict[str, Decimal]] = {}
        for allocation, payment, invoice in allocation_rows:
            payment_currency = payment.currency_code.strip().upper()
            invoice_currency = invoice.currency_code.strip().upper()
            amount = Decimal(str(allocation.amount))
            if payment_currency == invoice_currency:
                allocated_by_invoice[invoice.id] = (
                    allocated_by_invoice.get(invoice.id, ZERO) + amount
                )
            else:
                # Never add values in different currencies into one numeric total.
                currency_totals = mismatched_by_invoice.setdefault(invoice.id, {})
                currency_totals[payment_currency] = currency_totals.get(
                    payment_currency, ZERO
                ) + amount

        bucket_totals: dict[str, dict[str, Decimal]] = {}
        invoice_rows = []
        data_quality_warnings = []
        for invoice in invoices:
            total = Decimal(str(invoice.total or ZERO))
            paid = allocated_by_invoice.get(invoice.id, ZERO)
            mismatched = mismatched_by_invoice.get(invoice.id, {})
            if mismatched:
                mismatch_details = "; ".join(
                    f"{amount} {currency}"
                    for currency, amount in sorted(mismatched.items())
                )
                data_quality_warnings.append({
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "type": "payment_currency_mismatch",
                    "invoice_currency": invoice.currency_code,
                    "mismatched_allocations_amount": mismatch_details,
                })

            outstanding, overallocated = _receivable_outstanding(total, paid)
            if overallocated:
                data_quality_warnings.append({
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "type": "allocations_exceed_invoice_total",
                    "invoice_currency": invoice.currency_code,
                    "invoice_total": str(total),
                    "allocated_payments": str(paid),
                    "excess_allocated": str(abs(outstanding)),
                })
                # A credit/excess allocation is a data-quality issue, not a negative
                # receivable. Keep it out of all positive aging-bucket totals.
                continue
            if outstanding <= ZERO:
                # Fully settled invoices do not contribute to open receivables aging.
                continue

            due_day = invoice.due_date.date() if invoice.due_date is not None else None
            bucket, days_overdue = _receivable_aging_bucket(due_day, report_date)
            currency = invoice.currency_code
            bucket_totals.setdefault(currency, {})
            bucket_totals[currency][bucket] = (
                bucket_totals[currency].get(bucket, ZERO) + outstanding
            )
            invoice_rows.append({
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "customer_id": str(invoice.customer_id) if invoice.customer_id else None,
                "currency_code": currency,
                "due_date": due_day.isoformat() if due_day else None,
                "invoice_total": str(total),
                "allocated_payments": str(paid),
                "outstanding_amount": str(outstanding),
                "aging_bucket": bucket,
                "days_overdue": days_overdue,
                "customer_link_missing": invoice.customer_id is None,
            })

        summaries = []
        for currency, buckets in sorted(bucket_totals.items()):
            summaries.append({
                "currency_code": currency,
                "buckets": [
                    {"bucket": name, "outstanding_amount": str(buckets[name])}
                    for name in (
                        "not_due", "1_30_days", "31_60_days", "61_90_days",
                        "over_90_days", "no_due_date",
                    )
                    if buckets.get(name, ZERO) > ZERO
                ],
                "total_outstanding": str(sum(buckets.values(), ZERO)),
            })
        return {
            "as_of_date": report_date.isoformat(),
            "source": "issued invoices minus matching-currency payment allocations",
            "currency_policy": (
                "Payment allocations reduce an invoice only when their currency matches; "
                "different currencies are never combined."
            ),
            "invoice_count": len(invoice_rows),
            "by_currency": summaries,
            "invoices": invoice_rows,
            "data_quality_warnings": data_quality_warnings,
            "limitations": [
                "Only issued invoices with a positive remaining balance appear in aging buckets; drafts and void invoices are excluded.",
                "Fully settled invoices are excluded from open receivables aging.",
                "Overallocated invoices are excluded from receivable balances and shown as positive-excess data-quality warnings.",
                "Invoices without due dates are reported separately and are not assumed current.",
                "Legacy invoices without customer links are flagged for review, not auto-corrected.",
                "Currency-mismatched allocations are listed as warnings and never reduce receivables.",
                "This is an accounts-receivable aging report, not net profit or a full general ledger.",
            ],
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/reports/payables-aging")
def payables_aging(
    business_id: UUID,
    as_of: date | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Return what the business owes suppliers, by supplier and currency.

    The mirror of receivables-aging for the purchase side (C2, 3A-726):
    approved and received purchase orders, summed per supplier without
    cross-currency netting. Outstanding equals received totals because
    no supplier-payment records exist yet — that is stated in the
    response, not hidden: supplier bills and payments are the
    documented gap in docs/FINANCIAL_DEPTH_AUDIT.md.
    """
    try:
        _authorized(session, principal, business_id)
        report_date = as_of or datetime.now(UTC).date()
        orders = session.scalars(
            select(PurchaseOrder).where(
                PurchaseOrder.business_id == business_id,
                PurchaseOrder.status.in_((
                    "draft", "approved", "partially_received", "received",
                )),
            ).order_by(
                PurchaseOrder.currency_code, PurchaseOrder.order_number
            )
        ).all()
        suppliers = {
            row.id: row
            for row in session.scalars(
                select(Supplier).where(Supplier.business_id == business_id)
            ).all()
        }

        order_rows = []
        supplier_totals: dict[tuple[UUID, str], dict[str, Decimal]] = {}
        for order in orders:
            counts_ordered, counts_received = _payable_classify(order.status)
            if not counts_ordered and not counts_received:
                continue
            total = Decimal(str(order.total or ZERO))
            supplier = suppliers.get(order.supplier_id)
            key = (order.supplier_id, order.currency_code)
            bucket = supplier_totals.setdefault(key, {
                "ordered": ZERO, "received": ZERO,
            })
            if counts_ordered:
                bucket["ordered"] += total
            if counts_received:
                bucket["received"] += total
            order_rows.append({
                "order_id": str(order.id),
                "order_number": order.order_number,
                "supplier_id": str(order.supplier_id),
                "supplier_name": supplier.name if supplier else None,
                "supplier_link_missing": supplier is None,
                "currency_code": order.currency_code,
                "status": order.status,
                "order_total": str(total),
                "counts_as_ordered": counts_ordered,
                "counts_as_received": counts_received,
            })

        summaries = []
        for (supplier_id, currency), bucket in sorted(
            supplier_totals.items(), key=lambda item: (str(item[0][0]), item[0][1])
        ):
            outstanding, _overpaid = _payable_outstanding(bucket["received"], ZERO)
            supplier = suppliers.get(supplier_id)
            summaries.append({
                "supplier_id": str(supplier_id),
                "supplier_name": supplier.name if supplier else None,
                "currency_code": currency,
                "ordered_total": str(bucket["ordered"]),
                "received_total": str(bucket["received"]),
                "outstanding_total": str(outstanding),
            })
        return {
            "as_of_date": report_date.isoformat(),
            "source": "approved and received purchase orders, grouped by supplier and currency",
            "currency_policy": (
                "Purchase orders are summed per currency only; different "
                "currencies are never combined."
            ),
            "note": (
                "No supplier-payment records exist yet, so outstanding "
                "equals received totals. Supplier bills and payments are "
                "the documented gap in docs/FINANCIAL_DEPTH_AUDIT.md."
            ),
            "order_count": len(order_rows),
            "by_supplier": summaries,
            "orders": order_rows,
            "limitations": [
                "Draft orders commit nothing and are excluded from totals.",
                "Cancelled orders are excluded from the report.",
                "Received totals are goods received, not a valuation: no inventory valuation or COGS exists yet.",
                "This is a supplier-payables report, not net profit or a full general ledger.",
            ],
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/assistant/insights")
def assistant_insights(business_id: UUID,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Deterministic, read-only insights grounded in stored data; no external AI call."""
    try:
        membership = _authorized(session, principal, business_id)
        invoice_rows = session.execute(select(
            Invoice.currency_code, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)
        ).where(Invoice.business_id == business_id, Invoice.status == "issued")
         .group_by(Invoice.currency_code)).all()
        expense_statement = select(
            Expense.currency_code, func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)
        ).where(Expense.business_id == business_id)
        expense_statement = apply_expense_visibility(
            expense_statement, business_id=business_id, role=membership.role
        )
        expense_rows = session.execute(expense_statement.group_by(Expense.currency_code)).all()
        low_stock = []
        tracked = session.scalars(select(Product).where(
            Product.business_id == business_id, Product.is_active.is_(True),
            Product.is_stock_tracked.is_(True),
        )).all()
        for product in tracked:
            quantity = Decimal(str(session.scalar(select(func.coalesce(
                func.sum(StockMovement.quantity_delta), 0
            )).where(StockMovement.business_id == business_id,
                     StockMovement.product_id == product.id)) or 0))
            if quantity <= ZERO:
                low_stock.append({"product_id": str(product.id), "name": product.name,
                                  "stock_quantity": str(quantity)})
        insights = []
        if not invoice_rows:
            insights.append({"type": "info", "message": "No issued invoices are recorded yet."})
        if low_stock:
            insights.append({"type": "attention", "message": f"{len(low_stock)} tracked products have zero or negative calculated stock; review stock movements."})
        if not expense_rows:
            insights.append({"type": "info", "message": "No expenses are recorded yet."})
        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "source": "database-derived deterministic rules",
            "issued_sales_by_currency": [{"currency_code": c, "count": n, "total": str(total)} for c,n,total in invoice_rows],
            "expenses_by_currency": [{"currency_code": c, "count": n, "total": str(total)} for c,n,total in expense_rows],
            "stock_attention": low_stock,
            "insights": insights,
            "limitations": ["This is not an external generative AI response.", "Sales and expenses are not netted into profit.", "Currencies are never combined."]
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

@router.get("/customers/{customer_id}/statement")
def customer_statement(
    business_id: UUID,
    customer_id: UUID,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Build a currency-separated customer statement with SQL-side pagination and balances."""
    try:
        _authorized(session, principal, business_id)
        if from_date is not None and to_date is not None and from_date > to_date:
            raise HTTPException(status_code=422, detail="from_date must be on or before to_date")
        customer = session.scalars(select(Customer).where(
            Customer.id == customer_id,
            Customer.business_id == business_id,
            Customer.is_active.is_(True),
        )).one_or_none()
        if customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")

        business = session.get(Business, business_id)
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found")
        start_utc, end_utc = _day_bounds(from_date, to_date, business.timezone)

        invoice_occurred_at = func.coalesce(Invoice.issue_date, Invoice.created_at)
        invoice_events = select(
            invoice_occurred_at.label("occurred_at"),
            literal("invoice_issued", type_=String()).label("event_type"),
            cast(Invoice.id, String()).label("source_id"),
            Invoice.invoice_number.label("reference"),
            Invoice.currency_code.label("currency_code"),
            Invoice.total.label("debit"),
            literal(0, type_=Numeric(14, 2)).label("credit"),
            literal(True).label("affects_balance"),
            literal(None, type_=String()).label("invoice_id"),
        ).where(
            Invoice.business_id == business_id,
            Invoice.customer_id == customer_id,
            Invoice.status == "issued",
            invoice_occurred_at.is_not(None),
        )
        if start_utc is not None:
            invoice_events = invoice_events.where(invoice_occurred_at >= start_utc)
        if end_utc is not None:
            invoice_events = invoice_events.where(invoice_occurred_at < end_utc)

        allocation_occurred_at = func.coalesce(Payment.received_at, PaymentAllocation.created_at)
        same_currency = Payment.currency_code == Invoice.currency_code
        allocation_events = select(
            allocation_occurred_at.label("occurred_at"),
            case(
                (same_currency, literal("payment_allocation", type_=String())),
                else_=literal("currency_mismatch_allocation", type_=String()),
            ).label("event_type"),
            cast(PaymentAllocation.id, String()).label("source_id"),
            Payment.reference.label("reference"),
            case(
                (same_currency, Invoice.currency_code),
                else_=Payment.currency_code,
            ).label("currency_code"),
            literal(0, type_=Numeric(14, 2)).label("debit"),
            PaymentAllocation.amount.label("credit"),
            same_currency.label("affects_balance"),
            cast(Invoice.id, String()).label("invoice_id"),
        ).join(
            Payment,
            Payment.id == PaymentAllocation.payment_id,
        ).join(
            Invoice,
            Invoice.id == PaymentAllocation.invoice_id,
        ).where(
            PaymentAllocation.business_id == business_id,
            Payment.business_id == business_id,
            Invoice.business_id == business_id,
            Invoice.customer_id == customer_id,
            Invoice.status == "issued",
            allocation_occurred_at.is_not(None),
        )
        if start_utc is not None:
            allocation_events = allocation_events.where(allocation_occurred_at >= start_utc)
        if end_utc is not None:
            allocation_events = allocation_events.where(allocation_occurred_at < end_utc)

        # UNION ALL keeps the event sources in the database. The window function
        # computes running balances per currency before LIMIT/OFFSET is applied.
        events = union_all(invoice_events, allocation_events).cte("customer_statement_events")
        applicable_credit = case(
            (events.c.affects_balance.is_(True), events.c.credit),
            else_=literal(0, type_=Numeric(14, 2)),
        )
        event_order = (events.c.occurred_at, events.c.event_type, events.c.source_id)
        running_balance = func.sum(events.c.debit - applicable_credit).over(
            partition_by=events.c.currency_code,
            order_by=event_order,
            rows=(None, 0),
        )
        windowed = select(
            events,
            running_balance.label("balance"),
        ).cte("customer_statement_windowed")

        total = session.scalar(select(func.count()).select_from(events)) or 0
        page_rows = session.execute(
            select(windowed)
            .order_by(windowed.c.occurred_at, windowed.c.event_type, windowed.c.source_id)
            .offset(offset)
            .limit(limit)
        ).all()

        latest_rank = func.row_number().over(
            partition_by=windowed.c.currency_code,
            order_by=(
                windowed.c.occurred_at.desc(),
                windowed.c.event_type.desc(),
                windowed.c.source_id.desc(),
            ),
        ).label("latest_rank")
        ranked_balances = select(
            windowed.c.currency_code,
            windowed.c.balance,
            latest_rank,
        ).subquery("customer_statement_ranked_balances")
        balance_rows = session.execute(
            select(ranked_balances.c.currency_code, ranked_balances.c.balance)
            .where(ranked_balances.c.latest_rank == 1)
            .order_by(ranked_balances.c.currency_code)
        ).all()

        def as_utc_timestamp(value: datetime) -> datetime:
            # SQLite may return naive values for timezone-aware columns; treat those as UTC.
            if value.tzinfo is None or value.utcoffset() is None:
                return value.replace(tzinfo=UTC)
            return value.astimezone(UTC)

        def decimal_string(value) -> str:
            amount = Decimal(str(value or ZERO))
            return str(ZERO if amount == ZERO else amount)

        items = []
        for row in page_rows:
            item = dict(row._mapping)
            item["occurred_at"] = as_utc_timestamp(item["occurred_at"]).isoformat()
            for key in ("debit", "credit", "balance"):
                item[key] = decimal_string(item[key])
            items.append(item)

        balances_by_currency = {
            currency: decimal_string(balance)
            for currency, balance in balance_rows
        }
        return {
            "customer": {"id": str(customer.id), "name": customer.name},
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "balances_by_currency": balances_by_currency,
            "limitations": [
                "Issued credit notes are excluded from this statement and do not reduce receivables in Stage 1.",
                "Approved sales returns are not treated as receivable credits until Stage 2 is separately approved and implemented.",
                "Allocations with a currency mismatch are shown but do not change the running balance.",
                "Balances represent issued invoices less matching-currency allocations, not a double-entry general ledger.",
            ],
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/audit-events")
def list_audit_events(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None, min_length=1, max_length=80),
    target_type: str | None = Query(default=None, min_length=1, max_length=80),
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Read a paginated business audit trail; only workspace owners may view it."""
    try:
        authorize_membership(
            session,
            principal=principal,
            business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
        if start_at is not None and end_at is not None and start_at > end_at:
            raise HTTPException(status_code=422, detail="start_at must be earlier than or equal to end_at")
        statement = select(AuditEvent).where(AuditEvent.business_id == business_id)
        if action is not None:
            statement = statement.where(AuditEvent.action == action)
        if target_type is not None:
            statement = statement.where(AuditEvent.target_type == target_type)
        if start_at is not None:
            statement = statement.where(AuditEvent.created_at >= start_at)
        if end_at is not None:
            statement = statement.where(AuditEvent.created_at <= end_at)
        total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
        items = session.scalars(
            statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .offset(offset).limit(limit)
        ).all()
        return {
            "items": [
                {
                    "id": str(item.id),
                    "business_id": str(item.business_id),
                    "actor_subject": item.actor_subject,
                    "action": item.action,
                    "target_type": item.target_type,
                    "target_id": item.target_id,
                    "change_summary": item.change_summary,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in items
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

@router.get("/reports/data-integrity")
def report_data_integrity(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Read-only OWNER report for legacy invoice/customer and payment-allocation inconsistencies."""
    try:
        authorize_membership(
            session,
            principal=principal,
            business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
        unlinked = select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.customer_id.is_(None),
        )
        unlinked_total = session.scalar(
            select(func.count()).select_from(unlinked.subquery())
        ) or 0
        unlinked_items = session.scalars(
            unlinked.order_by(Invoice.created_at.desc(), Invoice.id.desc())
            .offset(offset).limit(limit)
        ).all()

        allocation_join = (
            select(PaymentAllocation, Payment, Invoice)
            .join(
                Payment,
                (Payment.id == PaymentAllocation.payment_id)
                & (Payment.business_id == PaymentAllocation.business_id),
            )
            .join(
                Invoice,
                (Invoice.id == PaymentAllocation.invoice_id)
                & (Invoice.business_id == PaymentAllocation.business_id),
            )
            .where(
                PaymentAllocation.business_id == business_id,
                Payment.business_id == business_id,
                Invoice.business_id == business_id,
                Invoice.status == "issued",
            )
        )
        currency_mismatches = allocation_join.where(
            Payment.currency_code != Invoice.currency_code,
        )
        currency_mismatch_total = session.scalar(
            select(func.count()).select_from(currency_mismatches.subquery())
        ) or 0
        currency_mismatch_rows = session.execute(
            currency_mismatches
            .order_by(Payment.received_at.desc(), PaymentAllocation.id.desc())
            .offset(offset).limit(limit)
        ).all()

        customer_mismatches = allocation_join.where(
            Payment.customer_id.is_not(None),
            Invoice.customer_id.is_not(None),
            Payment.customer_id != Invoice.customer_id,
        )
        customer_mismatch_total = session.scalar(
            select(func.count()).select_from(customer_mismatches.subquery())
        ) or 0
        customer_mismatch_rows = session.execute(
            customer_mismatches
            .order_by(Payment.received_at.desc(), PaymentAllocation.id.desc())
            .offset(offset).limit(limit)
        ).all()

        def allocation_item(allocation, payment, invoice):
            return {
                "allocation_id": str(allocation.id),
                "payment_id": str(payment.id),
                "payment_reference": payment.reference,
                "payment_customer_id": str(payment.customer_id) if payment.customer_id else None,
                "payment_currency": payment.currency_code,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "invoice_customer_id": str(invoice.customer_id) if invoice.customer_id else None,
                "invoice_currency": invoice.currency_code,
                "allocated_amount": str(allocation.amount),
            }

        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "read_only": True,
            "unlinked_issued_invoices": {
                "total": int(unlinked_total),
                "items": [
                    {
                        "invoice_id": str(item.id),
                        "invoice_number": item.invoice_number,
                        "status": item.status,
                        "total": str(item.total),
                        "currency_code": item.currency_code,
                        "created_at": item.created_at.isoformat() if item.created_at else None,
                    }
                    for item in unlinked_items
                ],
            },
            "currency_mismatched_allocations": {
                "total": int(currency_mismatch_total),
                "items": [allocation_item(*row) for row in currency_mismatch_rows],
            },
            "customer_mismatched_allocations": {
                "total": int(customer_mismatch_total),
                "items": [allocation_item(*row) for row in customer_mismatch_rows],
            },
            "limit": limit,
            "offset": offset,
            "warning": (
                "This report identifies records for manual review only. It never guesses "
                "customer links or modifies invoices, payments, or allocations."
            ),
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
