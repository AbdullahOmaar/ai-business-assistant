"""Morning brief (Slice 4) — real business data only.

``GET /assistant/brief`` answers the owner's DESIGN.md §4.3/§7.4
morning brief: what needs attention today, from the business's own
records — overdue invoices, low stock, recurring invoices due
tomorrow, and sales growth vs the previous period. No synthetic or
demo numbers anywhere: every figure is a stored record (or an
explicitly stated absence), currencies are never combined, and the
windows/thresholds are stated in the response so the UI can show
them. The brief is off-switchable: ``assistant.morning_brief.enabled``
(default ON per the owner decision) is toggled by the user through
the existing settings endpoints; when it is off the endpoint returns
``enabled: false`` and no sections. The greeting dialect comes from
the ``assistant.dialect`` setting (default friendly Egyptian); the
dialect currently drives this greeting only — the full dialect-aware
chat follows with the provider path.
"""
from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Business,
    BusinessSetting,
    Customer,
    Invoice,
    PaymentAllocation,
    Product,
    RecurringInvoiceSchedule,
    StockMovement,
)

BRIEF_ENABLED_KEY = "assistant.morning_brief.enabled"
DIALECT_KEY = "assistant.dialect"
DIALECTS = ("egyptian", "formal", "english")
LOW_STOCK_THRESHOLD = 10
SALES_WINDOW_DAYS = 7
_SECTION_LIMIT = 5
_ZERO = Decimal("0")


def brief_enabled(session: Session, *, business_id: UUID) -> bool:
    """The off switch. Absent setting = ON (owner decision 2026-11-25);
    only an explicit ``false`` turns the brief off."""
    row = session.scalar(select(BusinessSetting.setting_value).where(
        BusinessSetting.business_id == business_id,
        BusinessSetting.setting_key == BRIEF_ENABLED_KEY,
    ))
    if row is None:
        return True
    return row.strip().casefold() not in ("false", "0", "no", "off")


def dialect_for(session: Session, *, business_id: UUID) -> str:
    """Dialect setting, validated — an unknown stored value falls back
    to friendly Egyptian instead of breaking the brief."""
    row = session.scalar(select(BusinessSetting.setting_value).where(
        BusinessSetting.business_id == business_id,
        BusinessSetting.setting_key == DIALECT_KEY,
    ))
    if row is not None and row.strip().casefold() in DIALECTS:
        return row.strip().casefold()
    return "egyptian"


def _business_timezone(session: Session, business_id: UUID) -> tuple[str, ZoneInfo]:
    name = session.scalar(select(Business.timezone).where(Business.id == business_id))
    if name:
        try:
            return name, ZoneInfo(name)
        except ZoneInfoNotFoundError:
            pass
    return "UTC", ZoneInfo("UTC")


def _decimal(value) -> str:
    return str(Decimal(str(value or 0)))


def _money(value) -> str:
    """Money amounts always render with two decimals, even when the
    value never touched the database (a zero window total renders
    \"0.00\", not \"0\")."""
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def _as_aware(value: datetime) -> datetime:
    """Treat a naive stored timestamp as UTC (SQLite returns naive
    values) before any timezone conversion — calling astimezone() on a
    naive value would silently assume the server's local zone."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _overdue_invoices(session: Session, *, business_id: UUID, today, tz) -> list[dict]:
    """Issued invoices past their due date with money still outstanding
    (total less recorded allocations). Oldest first. The cutoff is
    midnight at the start of the business-local today, so an invoice
    due yesterday evening in the business timezone counts even when
    its stored timestamp is still \"today\" in UTC."""
    today_start = datetime.combine(today, time.min, tzinfo=tz).astimezone(UTC)
    allocated = select(
        PaymentAllocation.invoice_id.label("invoice_id"),
        func.coalesce(func.sum(PaymentAllocation.amount), 0).label("allocated_total"),
    ).where(PaymentAllocation.business_id == business_id).group_by(
        PaymentAllocation.invoice_id
    ).subquery()
    rows = session.execute(
        select(
            Invoice,
            func.coalesce(allocated.c.allocated_total, 0).label("allocated_total"),
            Customer.name.label("customer_name"),
        )
        .outerjoin(allocated, allocated.c.invoice_id == Invoice.id)
        .outerjoin(Customer, Customer.id == Invoice.customer_id)
        .where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.due_date.is_not(None),
            Invoice.due_date < today_start,
        )
        .order_by(Invoice.due_date.asc())
        .limit(_SECTION_LIMIT)
    ).all()
    overdue = []
    for invoice, allocated_total, customer_name in rows:
        outstanding = Decimal(str(invoice.total)) - Decimal(str(allocated_total))
        if outstanding <= _ZERO:
            continue
        due_date = _as_aware(invoice.due_date).astimezone(tz).date()
        overdue.append({
            "invoice_id": str(invoice.id),
            "invoice_number": invoice.invoice_number,
            "customer_name": customer_name,
            "currency_code": invoice.currency_code,
            "total": _money(invoice.total),
            "outstanding": _money(outstanding),
            "days_overdue": (today - due_date).days,
            "due_date": due_date.isoformat(),
        })
    return overdue


def _low_stock(session: Session, *, business_id: UUID) -> list[dict]:
    """Stock-tracked active products whose calculated stock (signed
    movements) is at or under the threshold — out of stock first, then
    running low, lowest quantity first. The threshold is stated in the
    response; the ≤ 0 band reuses the existing stock-attention rule
    from ``assistant_insights``."""
    tracked = session.scalars(select(Product).where(
        Product.business_id == business_id, Product.is_active.is_(True),
        Product.is_stock_tracked.is_(True),
    )).all()
    items = []
    for product in tracked:
        quantity = Decimal(str(session.scalar(select(func.coalesce(
            func.sum(StockMovement.quantity_delta), 0
        )).where(StockMovement.business_id == business_id,
                 StockMovement.product_id == product.id)) or 0))
        if quantity > LOW_STOCK_THRESHOLD:
            continue
        items.append({
            "product_id": str(product.id),
            "name": product.name,
            "stock_quantity": _decimal(quantity),
            "state": "out_of_stock" if quantity <= _ZERO else "running_low",
        })
    items.sort(key=lambda item: (Decimal(item["stock_quantity"]), item["name"]))
    return items[:_SECTION_LIMIT]


def _recurring_due_tomorrow(session: Session, *, business_id: UUID, tomorrow, tz) -> list[dict]:
    """Active recurring schedules whose next run falls tomorrow
    (business-local date, as a half-open datetime range — the same
    range rule the app's other date filters use)."""
    tomorrow_start = datetime.combine(tomorrow, time.min, tzinfo=tz).astimezone(UTC)
    tomorrow_end = tomorrow_start + timedelta(days=1)
    rows = session.execute(
        select(RecurringInvoiceSchedule, Customer.name.label("customer_name"))
        .outerjoin(Customer, Customer.id == RecurringInvoiceSchedule.customer_id)
        .where(
            RecurringInvoiceSchedule.business_id == business_id,
            RecurringInvoiceSchedule.is_active.is_(True),
            RecurringInvoiceSchedule.next_run_at >= tomorrow_start,
            RecurringInvoiceSchedule.next_run_at < tomorrow_end,
        )
        .order_by(RecurringInvoiceSchedule.next_run_at.asc())
        .limit(_SECTION_LIMIT)
    ).all()
    return [{
        "schedule_id": str(schedule.id),
        "customer_name": customer_name,
        "next_run_at": _as_aware(schedule.next_run_at).isoformat() if schedule.next_run_at else None,
        "interval_days": schedule.interval_days,
    } for schedule, customer_name in rows]


def _sales_growth(session: Session, *, business_id: UUID, today, tz) -> list[dict]:
    """Issued-invoice totals per currency for the last 7 days vs the
    previous 7 days (issue-date windows, business-local dates, as
    half-open datetime ranges). ``change_pct`` is null when the
    previous window is empty — a first week of sales is not
    \"infinite growth\". Invoices without an issue date cannot be
    placed in a window and are excluded (stated in the limitations)."""
    current_start = today - timedelta(days=SALES_WINDOW_DAYS)
    previous_start = today - timedelta(days=2 * SALES_WINDOW_DAYS)
    windows = (
        ("current", current_start, today),
        ("previous", previous_start, current_start),
    )
    totals: dict[str, dict[str, Decimal]] = {}
    for label, start, end in windows:
        start_dt = datetime.combine(start, time.min, tzinfo=tz).astimezone(UTC)
        end_dt = datetime.combine(end, time.min, tzinfo=tz).astimezone(UTC)
        rows = session.execute(select(
            Invoice.currency_code,
            func.coalesce(func.sum(Invoice.total), 0),
        ).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.issue_date.is_not(None),
            Invoice.issue_date >= start_dt,
            Invoice.issue_date < end_dt,
        ).group_by(Invoice.currency_code)).all()
        for currency, total in rows:
            totals.setdefault(currency, {})[label] = Decimal(str(total))
    growth = []
    for currency in sorted(totals):
        current_total = totals[currency].get("current", _ZERO)
        previous_total = totals[currency].get("previous", _ZERO)
        if previous_total > _ZERO:
            change_pct = float((current_total - previous_total) / previous_total * 100)
        else:
            change_pct = None
        growth.append({
            "currency_code": currency,
            "current_total": _money(current_total),
            "previous_total": _money(previous_total),
            "change_pct": change_pct,
            "current_window": {
                "start_date": current_start.isoformat(), "end_date": today.isoformat(),
            },
            "previous_window": {
                "start_date": previous_start.isoformat(), "end_date": current_start.isoformat(),
            },
        })
    return growth


def _summary(dialect: str, *, overdue: list[dict], low_stock: list[dict],
             recurring: list[dict], growth: list[dict]) -> str:
    """One short greeting built ONLY from the computed sections —
    counts and the single oldest/top item, never a summed total across
    currencies. Mirrors the DESIGN.md §4.3 example shape."""
    overdue_count = len(overdue)
    low_count = len(low_stock)
    recurring_count = len(recurring)
    if dialect == "english":
        if not overdue and not low_stock and not recurring:
            return "Good morning! Nothing urgent today — no overdue invoices and no low stock."
        parts = ["Good morning!"]
        if overdue:
            top = overdue[0]
            parts.append(
                f"You have {overdue_count} overdue invoice(s); the oldest is "
                f"{top['invoice_number']} ({top['outstanding']} {top['currency_code']}, "
                f"{top['days_overdue']} days overdue)."
            )
        if low_stock:
            top = low_stock[0]
            parts.append(f"{top['name']} is running low ({top['stock_quantity']} left).")
        if recurring:
            parts.append(f"{recurring_count} recurring invoice(s) due tomorrow.")
        return " ".join(parts)
    if dialect == "formal":
        if not overdue and not low_stock and not recurring:
            return "صباح الخير! لا يوجد ما يستدعي الانتباه اليوم — لا فواتير متأخرة ولا مخزون منخفض."
        parts = ["صباح الخير!"]
        if overdue:
            top = overdue[0]
            parts.append(
                f"لديك {overdue_count} فاتورة متأخرة؛ أقدمها الفاتورة {top['invoice_number']} "
                f"({top['outstanding']} {top['currency_code']}، متأخرة {top['days_overdue']} يومًا)."
            )
        if low_stock:
            top = low_stock[0]
            parts.append(f"الصنف {top['name']} على وشك النفاد (المتبقي {top['stock_quantity']}).")
        if recurring:
            parts.append(f"{recurring_count} فاتورة متكررة تستحق غدًا.")
        return " ".join(parts)
    # Friendly Egyptian (default).
    if not overdue and not low_stock and not recurring:
        return "صباح الخير ☀️ مفيش حاجة مستعجلة النهاردة — لا فواتير متأخرة ولا مخزون ناقص."
    parts = ["صباح الخير ☀️"]
    if overdue:
        top = overdue[0]
        parts.append(
            f"عندك {overdue_count} فواتير متأخرة، أقدمها فاتورة {top['invoice_number']} "
            f"({top['outstanding']} {top['currency_code']} بقالها {top['days_overdue']} يوم)."
        )
    if low_stock:
        top = low_stock[0]
        parts.append(f"وصنف {top['name']} قرب يخلص (فاضل {top['stock_quantity']}).")
    if recurring:
        parts.append(f"وفي {recurring_count} فواتير متكررة مستحقة بكره.")
    return " ".join(parts)


def build_brief(session: Session, *, business_id: UUID, now: datetime | None = None) -> dict:
    """Compute the brief for a business. ``now`` is injectable so tests
    can pin the date; production passes nothing (real current time)."""
    timezone_name, tz = _business_timezone(session, business_id)
    moment = now or datetime.now(UTC)
    today = moment.astimezone(tz).date()
    tomorrow = today + timedelta(days=1)
    generated_at = moment.isoformat()
    dialect = dialect_for(session, business_id=business_id)
    if not brief_enabled(session, business_id=business_id):
        return {
            "generated_at": generated_at,
            "business_timezone": timezone_name,
            "date": today.isoformat(),
            "enabled": False,
            "dialect": dialect,
            "summary": None,
            "overdue_invoices": [],
            "low_stock": [],
            "recurring_due_tomorrow": [],
            "sales_growth": [],
            "low_stock_threshold": LOW_STOCK_THRESHOLD,
            "limitations": [
                "The morning brief is switched off (assistant.morning_brief.enabled).",
            ],
        }
    overdue = _overdue_invoices(session, business_id=business_id, today=today, tz=tz)
    low_stock = _low_stock(session, business_id=business_id)
    recurring = _recurring_due_tomorrow(session, business_id=business_id, tomorrow=tomorrow, tz=tz)
    growth = _sales_growth(session, business_id=business_id, today=today, tz=tz)
    return {
        "generated_at": generated_at,
        "business_timezone": timezone_name,
        "date": today.isoformat(),
        "enabled": True,
        "dialect": dialect,
        "summary": _summary(
            dialect, overdue=overdue, low_stock=low_stock,
            recurring=recurring, growth=growth,
        ),
        "overdue_invoices": overdue,
        "low_stock": low_stock,
        "recurring_due_tomorrow": recurring,
        "sales_growth": growth,
        "low_stock_threshold": LOW_STOCK_THRESHOLD,
        "limitations": [
            "Currencies are never combined; each total names its currency.",
            f"Low stock means calculated stock at or under {LOW_STOCK_THRESHOLD} units.",
            f"Sales growth compares the last {SALES_WINDOW_DAYS} days with the previous {SALES_WINDOW_DAYS} days.",
            "Issued invoices without an issue date are excluded from the sales windows.",
            "Each section lists at most 5 items; counts in the summary cover the listed items only.",
        ],
    }
