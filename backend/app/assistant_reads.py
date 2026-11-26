"""Deterministic READ/REPORT tools for the assistant chat (Phase ق-1).

FULL-PLAN-complete-assistant.md §٩ classifies every assistant
capability by governance tier; the ⚪ tier — questions, reports and
summaries — is not a write at all and is available to any caller in
their own role. Slices 1–4 gave the chat a provider path plus a
small local fallback that sees only the 20 most recent issued
invoices and 20 most recent expenses. This module is the read side
of phase ق: deterministic tools that answer §٩'s ⚪ questions from
the business's FULL records, wired into ``_answer_chat`` on the
question path before the provider/fallback path.

Rules every tool follows (DESIGN.md §٣.٢ + the plan's honesty rules):

- Figures mirror the app's own report rules, never a private
  re-invention: outstanding follows the receivables-aging rule
  (an allocation reduces an invoice only when its currency matches;
  mismatches are surfaced, never netted), the operating result
  follows the profit-loss rule (approved returns shown separately,
  never netted), the customer statement follows the statement rule
  (issued invoices as debits, same-currency allocations as credits),
  and the treasury balance is the cashbox's signed-entry sum.
- Currencies are NEVER combined; every total names its currency.
- The two standing caveats are stated every time their figures
  appear: the operating result is preliminary, before cost of
  goods; the tax summary does not replace the official return.
  Credit notes never reduce a customer's debt and never appear in
  the statement — when a customer has credit notes the answer says
  so explicitly instead of netting them.
- Role discipline mirrors the underlying app surfaces: payroll
  (§٩.٧), the audit log, data integrity and operations health are
  OWNER-only reads — a staff caller gets the honest role refusal.
  Expense figures pass through ``apply_expense_visibility`` so a
  staff caller never sees payroll-linked expenses, exactly like
  the profit-loss endpoint.
- No invented figures: empty data gets an honest "no records"
  answer, never zeros dressed as facts. A figure the data cannot
  support (e.g. coverage days with no recent sales) is stated as
  not computable, with the reason.
- Names resolve with Slice 3's discipline (exact full name wins,
  unique one-token match, two or more matches = ONE clarification
  question, never a guess), reusing ``assistant_intent``'s helpers.

Answers use the existing chat answer shape: the dispatcher returns
a ``ReadAnswer`` (answer text + sources) and the caller wraps it in
the local-fallback envelope. Sources cite the records the answer
lists (same dict shape as the provider path: type/id/date plus
invoice_number/category where relevant) and one section source per
tool naming the app section the figures come from.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app import assistant_brief as brief
from app.assistant_intent import (
    _ALEF_NORMALIZE,
    _clean_name,
    _find_invoice,
    _fold_light,
    _fold_name,
    _is_arabic_message,
    _raw_slice,
    _resolve_by_name,
)
from app.core_features_api import _day_bounds
from app.domain_rules import money
from app.models import (
    AuditEvent,
    CashboxClosing,
    CashboxEntry,
    CreditNote,
    Customer,
    Employee,
    Expense,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Notification,
    Payment,
    PaymentAllocation,
    PayrollRecord,
    Product,
    PurchaseOrder,
    RecurringInvoiceSchedule,
    SalesReturn,
    StockMovement,
    Supplier,
)
from app.security import apply_expense_visibility

_ZERO = Decimal("0")
_LIST_LIMIT = 5


@dataclass
class ReadAnswer:
    answer: str
    sources: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Shared helpers.
# ---------------------------------------------------------------------------


def _fmt(value) -> str:
    """Money/quantity rendering: money always two decimals (the chat
    fallback's convention); quantities keep up to 3 decimals."""
    return str(money(Decimal(str(value or 0))))


def _qty(value) -> str:
    number = Decimal(str(value or 0))
    if number == number.to_integral_value():
        return str(number.quantize(Decimal("1")))
    return str(number.normalize())


def _join(parts: list[str], *, arabic: bool) -> str:
    return ("؛ ".join(parts) if arabic else "; ".join(parts))


def _per_currency(totals: dict[str, Decimal]) -> list[str]:
    """``["100.00 EGP", "50.00 USD"]`` — sorted, zero currencies dropped."""
    return [
        f"{_fmt(amount)} {currency}"
        for currency, amount in sorted(totals.items())
        if amount != _ZERO
    ]


def _section_source(section: str) -> dict:
    return {"type": "section", "id": section, "date": None}


def _record_source(kind: str, row, *, invoice_number: str | None = None,
                   category: str | None = None, when=None) -> dict:
    source = {
        "type": kind,
        "id": str(row.id),
        "date": when.isoformat() if when is not None else None,
    }
    if invoice_number is not None:
        source["invoice_number"] = invoice_number
    if category is not None:
        source["category"] = category
    return source


def _role_refusal(*, arabic: bool) -> ReadAnswer:
    if arabic:
        return ReadAnswer(
            "التقرير ده من صلاحيات المالك بس — مش متاح لدورك الحالي. "
            "المالك يقدر يطلبه مني أو يشوفه من التطبيق."
        )
    return ReadAnswer(
        "That report is owner-only — it isn't available to your current "
        "role. The owner can ask me for it or view it in the app."
    )


def _allocated_by_invoice(
    session: Session, *, business_id: UUID
) -> tuple[dict[UUID, Decimal], dict[UUID, dict[str, Decimal]]]:
    """Same-currency allocations per issued invoice (the
    receivables-aging rule): an allocation reduces an invoice only
    when the payment's currency matches the invoice's; mismatched
    amounts are returned separately and never netted."""
    rows = session.execute(
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
    allocated: dict[UUID, Decimal] = {}
    mismatched: dict[UUID, dict[str, Decimal]] = {}
    for allocation, payment, invoice in rows:
        amount = Decimal(str(allocation.amount))
        if payment.currency_code.strip().upper() == invoice.currency_code.strip().upper():
            allocated[invoice.id] = allocated.get(invoice.id, _ZERO) + amount
        else:
            by_currency = mismatched.setdefault(invoice.id, {})
            key = payment.currency_code
            by_currency[key] = by_currency.get(key, _ZERO) + amount
    return allocated, mismatched


def _outstanding(invoice: Invoice, allocated: dict[UUID, Decimal]) -> Decimal:
    """Total less same-currency allocations; negative means the
    invoice is overallocated (a data-quality case the aging report
    excludes from balances)."""
    return Decimal(str(invoice.total)) - allocated.get(invoice.id, _ZERO)


# ---------------------------------------------------------------------------
# Period windows (business-local dates, half-open UTC bounds via the
# same _day_bounds helper the report endpoints use).
# ---------------------------------------------------------------------------

_WINDOW_CUES = (
    ("last_month", (
        r"last month", r"الشهر اللي فات", r"الشهر الماضي", r"الشهر السابق",
    )),
    ("last_30", (
        r"last 30 days", r"اخر 30 يوم", r"آخر 30 يوم",
    )),
    ("week", (
        r"this week", r"last 7 days", r"الاسبوع ده", r"الأسبوع ده",
        r"اخر 7 ايام", r"آخر 7 أيام",
    )),
    ("today", (
        r"today", r"النهارده", r"النهاردة", r"اليوم",
    )),
    ("month", (
        r"this month", r"الشهر ده", r"الشهر الحالي",
    )),
)


def _window_kind(folded: str, *, default: str) -> str:
    for kind, cues in _WINDOW_CUES:
        for cue in cues:
            if re.search(cue, folded, re.IGNORECASE):
                return kind
    return default


def _window(
    kind: str, today: date, tz_name: str
) -> tuple[datetime | None, datetime | None, str, str]:
    """(start_utc, end_utc, label_ar, label_en) for a window kind."""
    if kind == "today":
        start, end = today, today
        label_ar, label_en = "النهارده", "today"
    elif kind == "week":
        start, end = today - timedelta(days=6), today
        label_ar, label_en = "آخر ٧ أيام", "the last 7 days"
    elif kind == "last_30":
        start, end = today - timedelta(days=29), today
        label_ar, label_en = "آخر ٣٠ يوم", "the last 30 days"
    elif kind == "last_month":
        first = today.replace(day=1)
        end = first - timedelta(days=1)
        start = end.replace(day=1)
        label_ar, label_en = "الشهر اللي فات", "last month"
    else:  # month (current calendar month to date)
        start, end = today.replace(day=1), today
        label_ar, label_en = "الشهر ده", "this month"
    start_utc, end_utc = _day_bounds(start, end, tz_name)
    return start_utc, end_utc, label_ar, label_en


def _in_window(value: datetime | None, start: datetime | None, end: datetime | None) -> bool:
    if value is None:
        return False
    moment = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if start is not None and moment < start:
        return False
    if end is not None and moment >= end:
        return False
    return True


# ---------------------------------------------------------------------------
# §٩.٧ Payroll reports — OWNER-ONLY (the plan pins the role rule).
# ---------------------------------------------------------------------------


def _payroll_report(
    session: Session, *, business_id: UUID, arabic: bool,
    business_currency: str, folded: str,
) -> ReadAnswer:
    period_match = re.search(r"\b(\d{4}-\d{2})\b", folded)
    records = session.scalars(
        select(PayrollRecord)
        .where(PayrollRecord.business_id == business_id)
        .order_by(PayrollRecord.period.desc(), PayrollRecord.created_at.asc())
    ).all()
    if not records:
        if arabic:
            return ReadAnswer("مفيش سجلات مرتبات مسجلة لحد دلوقتي.",
                              [_section_source("payroll")])
        return ReadAnswer("No payroll records are recorded yet.",
                          [_section_source("payroll")])
    period = period_match.group(1) if period_match else records[0].period
    rows = [record for record in records if record.period == period]
    if not rows:
        if arabic:
            return ReadAnswer(f"مفيش سجلات مرتبات للفترة {period}.",
                              [_section_source("payroll")])
        return ReadAnswer(f"No payroll records for period {period}.",
                          [_section_source("payroll")])
    counts: dict[str, int] = {}
    net_total = _ZERO
    for record in rows:
        counts[record.status] = counts.get(record.status, 0) + 1
        net_total += Decimal(str(record.net_pay))
    status_ar = {"draft": "مسودة", "approved": "معتمدة", "paid": "مدفوعة"}
    if arabic:
        parts = [f"{status_ar.get(status, status)}: {count}" for status, count in sorted(counts.items())]
        answer = (
            f"مرتبات فترة {period}: {len(rows)} سجل ({_join(parts, arabic=True)})، "
            f"وإجمالي الصافي {_fmt(net_total)} {business_currency}."
        )
    else:
        parts = [f"{status}: {count}" for status, count in sorted(counts.items())]
        answer = (
            f"Payroll for {period}: {len(rows)} records ({_join(parts, arabic=False)}), "
            f"total net {_fmt(net_total)} {business_currency}."
        )
    sources = [_section_source("payroll")] + [
        _record_source("payroll", record, when=record.created_at)
        for record in rows[:_LIST_LIMIT]
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٩ Audit-log query — OWNER-ONLY (mirrors /audit-events).
# ---------------------------------------------------------------------------

_AUDIT_PHRASES_AR = ("سجل العمليات", "سجل التدقيق", "مين عمل", "اخر العمليات", "آخر العمليات")
_AUDIT_PHRASES_EN = ("audit log", "activity log", "who did", "recent activity")


def _audit_query(
    session: Session, *, business_id: UUID, arabic: bool, tz,
) -> ReadAnswer:
    events = session.scalars(
        select(AuditEvent)
        .where(AuditEvent.business_id == business_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(_LIST_LIMIT)
    ).all()
    total = session.scalar(
        select(func.count(AuditEvent.id)).where(AuditEvent.business_id == business_id)
    ) or 0
    if not events:
        if arabic:
            return ReadAnswer("سجل العمليات فاضي — مفيش أحداث مسجلة لحد دلوقتي.",
                              [_section_source("audit")])
        return ReadAnswer("The audit log is empty — no events recorded yet.",
                          [_section_source("audit")])
    lines = []
    for event in events:
        created = event.created_at
        aware = created if created.tzinfo is not None else created.replace(tzinfo=UTC)
        local = aware.astimezone(tz)
        actor = event.actor_subject.split("@")[0] if event.actor_subject else "—"
        # The backend stores action codes; localized labels live in
        # the app's audit surface (frontend), so the chat shows the
        # stored code verbatim rather than inventing a translation.
        lines.append(
            f"• {event.action} — {actor} — {local.date().isoformat()} {local.strftime('%H:%M')}"
        )
    if arabic:
        answer = f"آخر {len(events)} حدث من أصل {total} في سجل العمليات:\n" + "\n".join(lines)
    else:
        answer = f"Latest {len(events)} of {total} audit events:\n" + "\n".join(lines)
    sources = [_section_source("audit")] + [
        _record_source("audit_event", event, when=event.created_at) for event in events
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٩ Data-integrity results — OWNER-ONLY, display only.
# ---------------------------------------------------------------------------


def _integrity_report(
    session: Session, *, business_id: UUID, arabic: bool,
) -> ReadAnswer:
    unlinked = session.scalar(
        select(func.count(Invoice.id)).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.customer_id.is_(None),
        )
    ) or 0
    mismatch_rows = session.execute(
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
        )
    ).all()
    currency_mismatch = 0
    customer_mismatch = 0
    for _allocation, payment, invoice in mismatch_rows:
        if payment.currency_code.strip().upper() != invoice.currency_code.strip().upper():
            currency_mismatch += 1
        if (
            payment.customer_id is not None
            and invoice.customer_id is not None
            and payment.customer_id != invoice.customer_id
        ):
            customer_mismatch += 1
    problems = []
    if arabic:
        if unlinked:
            problems.append(f"{unlinked} فاتورة صادرة من غير عميل مرتبط")
        if currency_mismatch:
            problems.append(f"{currency_mismatch} تخصيص دفع بعملة مختلفة عن عملة فاتورته")
        if customer_mismatch:
            problems.append(f"{customer_mismatch} تخصيص دفع عميله مختلف عن عميل فاتورته")
        if not problems:
            answer = (
                "فحص سلامة البيانات: مفيش تعارضات معروفة — كل الفواتير الصادرة "
                "مرتبطة بعملاء، وكل التخصيصات متوافقة في العملة والعميل."
            )
        else:
            answer = (
                "فحص سلامة البيانات لقى: " + _join(problems, arabic=True) + ". "
                "بعرض النتائج بس — المساعد ما بيصلّحش البيانات؛ التصحيح من الشاشات المختصة."
            )
    else:
        if unlinked:
            problems.append(f"{unlinked} issued invoices with no linked customer")
        if currency_mismatch:
            problems.append(f"{currency_mismatch} payment allocations in a different currency than their invoice")
        if customer_mismatch:
            problems.append(f"{customer_mismatch} payment allocations whose customer differs from the invoice's customer")
        if not problems:
            answer = (
                "Data-integrity check: no known inconsistencies — every issued "
                "invoice is linked to a customer and every allocation matches "
                "its invoice on currency and customer."
            )
        else:
            answer = (
                "Data-integrity check found: " + _join(problems, arabic=False) + ". "
                "I only display these results — the assistant never repairs "
                "data; corrections happen in the relevant screens."
            )
    return ReadAnswer(answer, [_section_source("integrity")])


# ---------------------------------------------------------------------------
# §٩.٩ System-status summary — OWNER-ONLY (mirrors /operations/health).
# ---------------------------------------------------------------------------


def _system_status(
    session: Session, *, business_id: UUID, arabic: bool,
) -> ReadAnswer:
    database_connected = False
    migration_revision = None
    migration_available = False
    try:
        session.execute(text("SELECT 1"))
        database_connected = True
        revision = session.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        ).scalar()
        if revision is not None:
            migration_available = True
            migration_revision = str(revision)
    except SQLAlchemyError:
        session.rollback()
    ai_configured = bool(os.getenv("OPENAI_API_KEY"))
    if arabic:
        db_part = "قاعدة البيانات متصلة" if database_connected else "قاعدة البيانات مش بترد"
        migration_part = (
            f"إصدار الهجرات {migration_revision}" if migration_available
            else "جدول الهجرات مش موجود"
        )
        ai_part = "مزود الذكاء مضبوط" if ai_configured else "مزود الذكاء مش مضبوط (الردود المحلية شغالة)"
        answer = (
            f"حالة النظام: {db_part}؛ {migration_part}؛ {ai_part}؛ "
            "عامل توصيل الإشعارات وعامل الفواتير الدورية غير مهيأين حاليًا "
            "(الإشعارات قائمة مخزنة بس، والفواتير الدورية إعدادات جدولة بس)."
        )
    else:
        db_part = "database connected" if database_connected else "database not responding"
        migration_part = (
            f"migration revision {migration_revision}" if migration_available
            else "migration table not present"
        )
        ai_part = "AI provider configured" if ai_configured else "AI provider not configured (local answers active)"
        answer = (
            f"System status: {db_part}; {migration_part}; {ai_part}; "
            "the notification delivery worker and the recurring-invoice "
            "worker are not configured (notifications are a stored queue "
            "only, recurring invoices are scheduling settings only)."
        )
    return ReadAnswer(answer, [_section_source("operations")])


# ---------------------------------------------------------------------------
# §٩.٦ Treasury (cashbox) — READ ONLY.
# ---------------------------------------------------------------------------


def _treasury(
    session: Session, *, business_id: UUID, arabic: bool, today_start_utc: datetime,
) -> ReadAnswer:
    entries = session.scalars(
        select(CashboxEntry)
        .where(CashboxEntry.business_id == business_id)
        .order_by(CashboxEntry.created_at.asc())
    ).all()
    if not entries:
        if arabic:
            return ReadAnswer("الخزنة مفيش فيها حركات مسجلة لحد دلوقتي.",
                              [_section_source("cashbox")])
        return ReadAnswer("The cashbox has no recorded entries yet.",
                          [_section_source("cashbox")])
    balances: dict[str, Decimal] = {}
    today_in: dict[str, Decimal] = {}
    today_out: dict[str, Decimal] = {}
    for entry in entries:
        amount = Decimal(str(entry.amount))
        signed = -amount if entry.kind == "withdrawal" else amount
        balances[entry.currency_code] = balances.get(entry.currency_code, _ZERO) + signed
        created = entry.created_at
        aware = created if created.tzinfo is not None else created.replace(tzinfo=UTC)
        if aware >= today_start_utc:
            target = today_out if entry.kind == "withdrawal" else today_in
            target[entry.currency_code] = target.get(entry.currency_code, _ZERO) + amount
    closing = session.scalars(
        select(CashboxClosing)
        .where(CashboxClosing.business_id == business_id)
        .order_by(CashboxClosing.closed_date.desc())
    ).first()
    if arabic:
        parts = [f"رصيد الخزنة: {_join(_per_currency(balances), arabic=True) or 'صفر في كل العملات'}"]
        if today_in or today_out:
            in_text = _join(_per_currency(today_in), arabic=True) or "لا شيء"
            out_text = _join(_per_currency(today_out), arabic=True) or "لا شيء"
            parts.append(f"النهارده دخل {in_text} وخرج {out_text}")
        if closing is not None:
            parts.append(
                f"آخر إغلاق ({closing.closed_date.isoformat()}): المتوقع "
                f"{_fmt(closing.expected_amount)} {closing.currency_code}، المعدود "
                f"{_fmt(closing.counted_amount)}، الفرق {_fmt(closing.variance)}"
            )
        parts.append("الرصيد محسوب من حركات الخزنة المسجلة — مش رصيد بنكي.")
        answer = "؛ ".join(parts) + "."
    else:
        parts = [f"Cashbox balance: {_join(_per_currency(balances), arabic=False) or 'zero in every currency'}"]
        if today_in or today_out:
            in_text = _join(_per_currency(today_in), arabic=False) or "nothing"
            out_text = _join(_per_currency(today_out), arabic=False) or "nothing"
            parts.append(f"today in {in_text} and out {out_text}")
        if closing is not None:
            parts.append(
                f"latest closing ({closing.closed_date.isoformat()}): expected "
                f"{_fmt(closing.expected_amount)} {closing.currency_code}, counted "
                f"{_fmt(closing.counted_amount)}, variance {_fmt(closing.variance)}"
            )
        parts.append("The balance is computed from recorded cashbox entries — it is not a bank balance.")
        answer = "; ".join(parts) + "."
    sources = [_section_source("cashbox")] + [
        _record_source("cashbox_entry", entry, when=entry.created_at)
        for entry in entries[-_LIST_LIMIT:]
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.١ Invoice detail / lines by number.
# ---------------------------------------------------------------------------

_INVOICE_NUMBER = r"(?P<number>[A-Za-z]{0,4}-?\d+)"
_DETAIL_PATTERNS = (
    re.compile(
        r"\bshow\s+(?:me\s+)?(?:the\s+)?invoice\s+(?:number\s+|#\s*)?" + _INVOICE_NUMBER,
        re.IGNORECASE,
    ),
    re.compile(
        r"\binvoice\s+(?:number\s+|#\s*)?" + _INVOICE_NUMBER
        + r"\b[^?؟]*\b(?:details?|lines?|items|breakdown)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bdetails?\s+of\s+invoice\s+(?:number\s+|#\s*)?" + _INVOICE_NUMBER,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعرض|اظهر|تفاصيل|بنود|كشف)\s+[^؟?]*?(?:فاتوره)\s+(?:رقم\s+|#\s*)?" + _INVOICE_NUMBER,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:فاتوره)\s+(?:رقم\s+)?" + _INVOICE_NUMBER + r"\s+(?:تفاصيل|بنود)",
        re.IGNORECASE,
    ),
)


def _invoice_detail(
    session: Session, *, business_id: UUID, arabic: bool, number: str,
) -> ReadAnswer:
    invoice = _find_invoice(session, business_id=business_id, number=number)
    if invoice is None:
        if arabic:
            return ReadAnswer(f"مش لاقي فاتورة برقم {number} في سجلات النشاط ده.")
        return ReadAnswer(f"I can't find an invoice numbered {number} in this business's records.")
    lines = session.scalars(
        select(InvoiceLine)
        .where(
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
        )
    ).all()
    customer_name = None
    if invoice.customer_id is not None:
        customer = session.scalar(
            select(Customer).where(
                Customer.business_id == business_id,
                Customer.id == invoice.customer_id,
            )
        )
        customer_name = customer.name if customer is not None else None
    allocated, _mismatched = _allocated_by_invoice(session, business_id=business_id)
    paid = allocated.get(invoice.id, _ZERO)
    outstanding = Decimal(str(invoice.total)) - paid
    status_ar = {"draft": "مسودة", "issued": "صادرة", "void": "ملغاة"}
    line_texts = [
        f"• {line.description}: {_qty(line.quantity)} × {_fmt(line.unit_price)} = "
        f"{_fmt(line.line_total)} {invoice.currency_code}"
        for line in lines[:_LIST_LIMIT]
    ]
    if len(lines) > _LIST_LIMIT:
        line_texts.append(f"… +{len(lines) - _LIST_LIMIT}")
    issued = (
        invoice.issue_date.date().isoformat()
        if invoice.issue_date is not None
        else (invoice.created_at.date().isoformat() if invoice.created_at else "—")
    )
    if arabic:
        head = (
            f"الفاتورة {invoice.invoice_number} ({status_ar.get(invoice.status, invoice.status)})"
            + (f" للعميل {customer_name}" if customer_name else "")
            + f" — الإصدار {issued}"
            + (f"، الاستحقاق {invoice.due_date.date().isoformat()}" if invoice.due_date else "")
            + f". الإجمالي {_fmt(invoice.total)} {invoice.currency_code}"
            + (f"، منها ضريبة {_fmt(invoice.tax_total)}" if invoice.tax_total else "")
            + "."
        )
        if invoice.status == "issued":
            head += (
                f" المدفوع منها {_fmt(paid)}، والمتبقي {_fmt(outstanding)} "
                f"{invoice.currency_code}."
            )
        body = ("\n" + "\n".join(line_texts)) if line_texts else ""
        answer = head + (body if body else (" مفيش بنود مسجلة للفاتورة دي." if arabic else ""))
    else:
        head = (
            f"Invoice {invoice.invoice_number} ({invoice.status})"
            + (f" for {customer_name}" if customer_name else "")
            + f" — issued {issued}"
            + (f", due {invoice.due_date.date().isoformat()}" if invoice.due_date else "")
            + f". Total {_fmt(invoice.total)} {invoice.currency_code}"
            + (f", including tax {_fmt(invoice.tax_total)}" if invoice.tax_total else "")
            + "."
        )
        if invoice.status == "issued":
            head += (
                f" Paid so far {_fmt(paid)}, outstanding {_fmt(outstanding)} "
                f"{invoice.currency_code}."
            )
        body = ("\n" + "\n".join(line_texts)) if line_texts else " No lines are recorded for this invoice."
        answer = head + body
    return ReadAnswer(
        answer,
        [_record_source("invoice", invoice, invoice_number=invoice.invoice_number,
                        when=invoice.created_at)],
    )


# ---------------------------------------------------------------------------
# §٩.١ Outstanding + overdue with aging buckets (receivables-aging rule).
# ---------------------------------------------------------------------------

_AGING_BUCKETS = (
    ("not_due", "لسه ما استحققتش", "not yet due"),
    ("no_due_date", "من غير تاريخ استحقاق", "no due date"),
    ("1_30_days", "متأخرة ١–٣٠ يوم", "1–30 days overdue"),
    ("31_60_days", "متأخرة ٣١–٦٠ يوم", "31–60 days overdue"),
    ("61_90_days", "متأخرة ٦١–٩٠ يوم", "61–90 days overdue"),
    ("over_90_days", "متأخرة أكتر من ٩٠ يوم", "over 90 days overdue"),
)


def _aging_bucket(due_date, as_of: date) -> str:
    if due_date is None:
        return "no_due_date"
    days = (as_of - due_date.date()).days
    if days <= 0:
        return "not_due"
    if days <= 30:
        return "1_30_days"
    if days <= 60:
        return "31_60_days"
    if days <= 90:
        return "61_90_days"
    return "over_90_days"


def _outstanding_report(
    session: Session, *, business_id: UUID, arabic: bool, today: date,
) -> ReadAnswer:
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
        )
    ).all()
    allocated, mismatched = _allocated_by_invoice(session, business_id=business_id)
    open_rows = []  # (invoice, outstanding)
    overallocated = 0
    for invoice in invoices:
        balance = _outstanding(invoice, allocated)
        if balance > 0:
            open_rows.append((invoice, balance))
        elif balance < 0:
            overallocated += 1
    if not open_rows:
        if arabic:
            answer = "مفيش مستحقات مفتوحة — كل الفواتير الصادرة مدفوعة بالكامل."
        else:
            answer = "No open receivables — every issued invoice is fully paid."
        if overallocated:
            answer += (
                f" ({overallocated} فاتورة مدفوع لها أكتر من إجماليها — دي حالة سلامة بيانات.)"
                if arabic else
                f" ({overallocated} invoices are paid beyond their total — a data-integrity case.)"
            )
        return ReadAnswer(answer, [_section_source("invoices")])
    totals: dict[str, Decimal] = {}
    overdue_totals: dict[str, Decimal] = {}
    buckets: dict[str, dict[str, Decimal]] = {}
    overdue_rows = []
    for invoice, balance in open_rows:
        totals[invoice.currency_code] = totals.get(invoice.currency_code, _ZERO) + balance
        bucket = _aging_bucket(invoice.due_date, today)
        by_currency = buckets.setdefault(bucket, {})
        by_currency[invoice.currency_code] = by_currency.get(invoice.currency_code, _ZERO) + balance
        if bucket not in ("not_due", "no_due_date"):
            overdue_totals[invoice.currency_code] = (
                overdue_totals.get(invoice.currency_code, _ZERO) + balance
            )
            overdue_rows.append((invoice, balance))
    bucket_lines = []
    for key, label_ar, label_en in _AGING_BUCKETS:
        by_currency = buckets.get(key)
        if not by_currency:
            continue
        figures = _join(_per_currency(by_currency), arabic=arabic)
        bucket_lines.append(f"• {label_ar if arabic else label_en}: {figures}")
    overdue_rows.sort(key=lambda pair: (pair[0].due_date or pair[0].created_at))
    top = overdue_rows[:_LIST_LIMIT]
    customer_names = {}
    for invoice, _balance in top:
        if invoice.customer_id is not None and invoice.customer_id not in customer_names:
            name = session.scalar(
                select(Customer.name).where(
                    Customer.business_id == business_id,
                    Customer.id == invoice.customer_id,
                )
            )
            customer_names[invoice.customer_id] = name
    top_lines = []
    for invoice, balance in top:
        days = (today - invoice.due_date.date()).days if invoice.due_date else 0
        who = customer_names.get(invoice.customer_id) or ("—")
        if arabic:
            top_lines.append(
                f"• {invoice.invoice_number} ({who}): {_fmt(balance)} "
                f"{invoice.currency_code} — متأخرة {days} يوم"
            )
        else:
            top_lines.append(
                f"• {invoice.invoice_number} ({who}): {_fmt(balance)} "
                f"{invoice.currency_code} — {days} days overdue"
            )
    if arabic:
        answer = (
            f"المستحقات المفتوحة: {_join(_per_currency(totals), arabic=True)} "
            f"على {len(open_rows)} فاتورة. منها متأخرة: "
            f"{_join(_per_currency(overdue_totals), arabic=True) or 'لا شيء'}.\n"
            + "\n".join(bucket_lines)
        )
        if top_lines:
            answer += "\nأقدم المتأخرات:\n" + "\n".join(top_lines)
    else:
        answer = (
            f"Open receivables: {_join(_per_currency(totals), arabic=False)} "
            f"across {len(open_rows)} invoices. Of that, overdue: "
            f"{_join(_per_currency(overdue_totals), arabic=False) or 'nothing'}.\n"
            + "\n".join(bucket_lines)
        )
        if top_lines:
            answer += "\nOldest overdue:\n" + "\n".join(top_lines)
    if mismatched:
        note = (
            f"تنبيه: {len(mismatched)} فاتورة عندها تخصيصات بعملة مختلفة — "
            "دي ما بتقللش المستحق وبتظهر في فحص سلامة البيانات."
            if arabic else
            f"Note: {len(mismatched)} invoices have allocations in a different "
            "currency — those never reduce the balance and show up in the "
            "data-integrity check."
        )
        answer += "\n" + note
    sources = [_section_source("invoices")] + [
        _record_source("invoice", invoice, invoice_number=invoice.invoice_number,
                       when=invoice.created_at)
        for invoice, _balance in top
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.١ Paid ratio (same-currency allocations over issued totals).
# ---------------------------------------------------------------------------


def _paid_ratio(
    session: Session, *, business_id: UUID, arabic: bool,
) -> ReadAnswer:
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
        )
    ).all()
    if not invoices:
        if arabic:
            return ReadAnswer("مفيش فواتير صادرة لحد دلوقتي — مفيش نسبة تحصيل تتحسب.",
                              [_section_source("invoices")])
        return ReadAnswer("No issued invoices yet — there is no collection ratio to compute.",
                          [_section_source("invoices")])
    allocated, _mismatched = _allocated_by_invoice(session, business_id=business_id)
    totals: dict[str, Decimal] = {}
    paid: dict[str, Decimal] = {}
    for invoice in invoices:
        totals[invoice.currency_code] = totals.get(invoice.currency_code, _ZERO) + Decimal(str(invoice.total))
        paid[invoice.currency_code] = paid.get(invoice.currency_code, _ZERO) + min(
            allocated.get(invoice.id, _ZERO), Decimal(str(invoice.total))
        )
    lines = []
    for currency in sorted(totals):
        total = totals[currency]
        collected = paid.get(currency, _ZERO)
        ratio = (collected / total * 100).quantize(Decimal("0.1")) if total else Decimal("0")
        remaining = total - collected
        if arabic:
            lines.append(
                f"• {currency}: اتدفع {_fmt(collected)} من {_fmt(total)} "
                f"({ratio}٪)، والمتبقي {_fmt(remaining)}"
            )
        else:
            lines.append(
                f"• {currency}: {_fmt(collected)} collected of {_fmt(total)} "
                f"({ratio}%), {_fmt(remaining)} still open"
            )
    head = "نسبة التحصيل على الفواتير الصادرة:" if arabic else "Collection ratio on issued invoices:"
    return ReadAnswer(head + "\n" + "\n".join(lines), [_section_source("invoices")])


# ---------------------------------------------------------------------------
# §٩.١/§٩.١٠ Period comparison — this calendar month vs the previous one.
# ---------------------------------------------------------------------------


def _sales_compare(
    session: Session, *, business_id: UUID, arabic: bool, today: date, tz_name: str,
) -> ReadAnswer:
    this_start, this_end, _la, _le = _window("month", today, tz_name)
    last_start, last_end, _la2, _le2 = _window("last_month", today, tz_name)
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
        )
    ).all()
    current: dict[str, Decimal] = {}
    previous: dict[str, Decimal] = {}
    current_count = 0
    previous_count = 0
    for invoice in invoices:
        moment = invoice.issue_date or invoice.created_at
        amount = Decimal(str(invoice.total))
        if _in_window(moment, this_start, this_end):
            current[invoice.currency_code] = current.get(invoice.currency_code, _ZERO) + amount
            current_count += 1
        elif _in_window(moment, last_start, last_end):
            previous[invoice.currency_code] = previous.get(invoice.currency_code, _ZERO) + amount
            previous_count += 1
    if not current and not previous:
        if arabic:
            return ReadAnswer("مفيش مبيعات صادرة لا الشهر ده ولا اللي فات — مفيش مقارنة تتعمل.",
                              [_section_source("invoices")])
        return ReadAnswer("No issued sales this month or last — there is nothing to compare.",
                          [_section_source("invoices")])
    lines = []
    for currency in sorted(set(current) | set(previous)):
        now_amount = current.get(currency, _ZERO)
        before_amount = previous.get(currency, _ZERO)
        if before_amount == 0:
            change = (
                "الشهر اللي فات ماكانش فيه مبيعات بالعملة دي"
                if arabic else "no sales in this currency last month"
            )
        else:
            pct = ((now_amount - before_amount) / before_amount * 100).quantize(Decimal("0.1"))
            change = f"{pct:+}٪" if arabic else f"{pct:+}%"
        if arabic:
            lines.append(
                f"• {currency}: الشهر ده {_fmt(now_amount)}، اللي فات "
                f"{_fmt(before_amount)} — التغيير {change}"
            )
        else:
            lines.append(
                f"• {currency}: this month {_fmt(now_amount)}, last month "
                f"{_fmt(before_amount)} — change {change}"
            )
    if arabic:
        head = f"مقارنة المبيعات (الشهر ده: {current_count} فاتورة، اللي فات: {previous_count}):"
    else:
        head = f"Sales comparison (this month: {current_count} invoices, last month: {previous_count}):"
    return ReadAnswer(head + "\n" + "\n".join(lines), [_section_source("invoices")])


# ---------------------------------------------------------------------------
# §٩.١/§٩.٩ Sales summary for a stated window.
# ---------------------------------------------------------------------------


def _sales_summary(
    session: Session, *, business_id: UUID, arabic: bool, today: date,
    tz_name: str, folded: str,
) -> ReadAnswer:
    kind = _window_kind(folded, default="month")
    start, end, label_ar, label_en = _window(kind, today, tz_name)
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
        )
    ).all()
    totals: dict[str, Decimal] = {}
    in_window_rows = []
    for invoice in invoices:
        moment = invoice.issue_date or invoice.created_at
        if _in_window(moment, start, end):
            totals[invoice.currency_code] = totals.get(invoice.currency_code, _ZERO) + Decimal(str(invoice.total))
            in_window_rows.append(invoice)
    # Approved returns are shown separately, never netted (the
    # profit-loss rule); their currency comes from the linked invoice.
    returns = session.scalars(
        select(SalesReturn).where(
            SalesReturn.business_id == business_id,
            SalesReturn.status == "approved",
        )
    ).all()
    return_totals: dict[str, Decimal] = {}
    for sales_return in returns:
        if not _in_window(sales_return.created_at, start, end):
            continue
        invoice = session.scalar(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.id == sales_return.invoice_id,
            )
        )
        if invoice is not None:
            return_totals[invoice.currency_code] = (
                return_totals.get(invoice.currency_code, _ZERO) + Decimal(str(sales_return.total))
            )
    label = label_ar if arabic else label_en
    if not in_window_rows:
        if arabic:
            return ReadAnswer(f"مفيش مبيعات صادرة {label}.", [_section_source("invoices")])
        return ReadAnswer(f"No issued sales {label}.", [_section_source("invoices")])
    if arabic:
        answer = (
            f"مبيعات {label}: {_join(_per_currency(totals), arabic=True)} "
            f"من {len(in_window_rows)} فاتورة صادرة."
        )
        if return_totals:
            answer += (
                f" مرتجعات معتمدة في نفس الفترة: "
                f"{_join(_per_currency(return_totals), arabic=True)} "
                "(معروضة لوحدها ومش مخصومة من المبيعات)."
            )
    else:
        answer = (
            f"Sales {label}: {_join(_per_currency(totals), arabic=False)} "
            f"from {len(in_window_rows)} issued invoices."
        )
        if return_totals:
            answer += (
                f" Approved returns in the same window: "
                f"{_join(_per_currency(return_totals), arabic=False)} "
                "(shown separately, never netted from sales)."
            )
    top = sorted(in_window_rows, key=lambda row: Decimal(str(row.total)), reverse=True)[:3]
    sources = [_section_source("invoices")] + [
        _record_source("invoice", invoice, invoice_number=invoice.invoice_number,
                       when=invoice.created_at)
        for invoice in top
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٢ Customer statement + balances + search (statement rule: issued
# invoices are debits, same-currency allocations are credits; credit
# notes NEVER reduce the debt and never appear in the statement).
# ---------------------------------------------------------------------------

_CREDIT_NOTE_CAVEAT_AR = (
    "ملحوظة ثابتة: الإشعارات الدائنة لا تقلل دين العميل ولا تظهر في كشف الحساب."
)
_CREDIT_NOTE_CAVEAT_EN = (
    "Standing note: credit notes never reduce the customer's debt and "
    "never appear in the statement."
)


def _customer_open_figures(
    session: Session, *, business_id: UUID, customer_id: UUID,
    allocated: dict[UUID, Decimal],
) -> tuple[dict[str, Decimal], dict[str, Decimal], dict[str, Decimal], int]:
    """(issued totals, credited totals, open balances, open count)."""
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.customer_id == customer_id,
        )
    ).all()
    issued_totals: dict[str, Decimal] = {}
    credited: dict[str, Decimal] = {}
    open_balances: dict[str, Decimal] = {}
    open_count = 0
    for invoice in invoices:
        total = Decimal(str(invoice.total))
        paid = allocated.get(invoice.id, _ZERO)
        issued_totals[invoice.currency_code] = issued_totals.get(invoice.currency_code, _ZERO) + total
        credited[invoice.currency_code] = credited.get(invoice.currency_code, _ZERO) + min(paid, total)
        balance = total - paid
        if balance > 0:
            open_balances[invoice.currency_code] = (
                open_balances.get(invoice.currency_code, _ZERO) + balance
            )
            open_count += 1
    return issued_totals, credited, open_balances, open_count


def _customer_statement(
    session: Session, *, business_id: UUID, arabic: bool, customer,
) -> ReadAnswer:
    allocated, _mismatched = _allocated_by_invoice(session, business_id=business_id)
    issued_totals, credited, open_balances, open_count = _customer_open_figures(
        session, business_id=business_id, customer_id=customer.id, allocated=allocated
    )
    notes = session.scalars(
        select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.customer_id == customer.id,
        )
    ).all()
    note_totals: dict[str, Decimal] = {}
    for note in notes:
        note_totals[note.currency_code] = note_totals.get(note.currency_code, _ZERO) + Decimal(str(note.total))
    if not issued_totals:
        if arabic:
            answer = f"{customer.name} مفيش عنده فواتير صادرة — كشف الحساب فاضي."
        else:
            answer = f"{customer.name} has no issued invoices — the statement is empty."
    else:
        lines = []
        for currency in sorted(issued_totals):
            if arabic:
                lines.append(
                    f"• {currency}: فواتير صادرة {_fmt(issued_totals[currency])}، "
                    f"مدفوع {_fmt(credited.get(currency, _ZERO))}، "
                    f"المتبقي {_fmt(open_balances.get(currency, _ZERO))}"
                )
            else:
                lines.append(
                    f"• {currency}: issued {_fmt(issued_totals[currency])}, "
                    f"paid {_fmt(credited.get(currency, _ZERO))}, "
                    f"outstanding {_fmt(open_balances.get(currency, _ZERO))}"
                )
        if arabic:
            answer = (
                f"كشف حساب {customer.name} ({open_count} فاتورة مفتوحة):\n"
                + "\n".join(lines)
            )
        else:
            answer = (
                f"Statement for {customer.name} ({open_count} open invoices):\n"
                + "\n".join(lines)
            )
    if note_totals:
        figures = _join(_per_currency(note_totals), arabic=arabic)
        if arabic:
            answer += f"\nعنده إشعارات دائنة بمبلغ {figures} — مش مخصومة من الرصيد."
        else:
            answer += f"\nThey hold credit notes totalling {figures} — not deducted from the balance."
    answer += "\n" + (_CREDIT_NOTE_CAVEAT_AR if arabic else _CREDIT_NOTE_CAVEAT_EN)
    return ReadAnswer(
        answer,
        [
            _record_source("customer", customer),
            _section_source("customers"),
        ],
    )


def _clarify_customers(*, arabic: bool, rows, session: Session, business_id: UUID) -> ReadAnswer:
    allocated, _mismatched = _allocated_by_invoice(session, business_id=business_id)
    options = []
    for row in rows:
        _issued, _credited, open_balances, _count = _customer_open_figures(
            session, business_id=business_id, customer_id=row.id, allocated=allocated
        )
        figures = _join(_per_currency(open_balances), arabic=arabic)
        if arabic:
            options.append(f"«{row.name}» (عليه {figures})" if figures else f"«{row.name}» (مفيش عليه مستحقات)")
        else:
            options.append(f'"{row.name}" (owes {figures})' if figures else f'"{row.name}" (nothing outstanding)')
    if arabic:
        answer = (
            "الاسم ده بيطابق أكتر من عميل: " + "؛ ".join(options)
            + ". قصدك أنهي واحد؟"
        )
    else:
        answer = (
            "That name matches more than one customer: " + "; ".join(options)
            + ". Which one do you mean?"
        )
    return ReadAnswer(
        answer,
        [_record_source("customer", row) for row in rows],
    )


def _customer_search(
    session: Session, *, business_id: UUID, arabic: bool, rows,
) -> ReadAnswer:
    allocated, _mismatched = _allocated_by_invoice(session, business_id=business_id)
    lines = []
    for row in rows[:_LIST_LIMIT]:
        _issued, _credited, open_balances, open_count = _customer_open_figures(
            session, business_id=business_id, customer_id=row.id, allocated=allocated
        )
        figures = _join(_per_currency(open_balances), arabic=arabic)
        contact = row.phone or row.email or "—"
        if arabic:
            lines.append(
                f"• {row.name} — {contact} — "
                + (f"عليه {figures} في {open_count} فاتورة مفتوحة" if figures else "مفيش عليه مستحقات")
            )
        else:
            lines.append(
                f"• {row.name} — {contact} — "
                + (f"owes {figures} across {open_count} open invoices" if figures else "nothing outstanding")
            )
    if arabic:
        answer = f"لقيت {len(rows)} عميل بيطابق الاسم:\n" + "\n".join(lines)
    else:
        answer = f"Found {len(rows)} customers matching that name:\n" + "\n".join(lines)
    return ReadAnswer(
        answer,
        [_record_source("customer", row) for row in rows[:_LIST_LIMIT]],
    )


# ---------------------------------------------------------------------------
# §٩.٢ Supplier purchase totals (from purchase orders).
# ---------------------------------------------------------------------------


def _supplier_purchases(
    session: Session, *, business_id: UUID, arabic: bool, supplier=None,
) -> ReadAnswer:
    orders = session.scalars(
        select(PurchaseOrder).where(PurchaseOrder.business_id == business_id)
    ).all()
    if supplier is not None:
        orders = [order for order in orders if order.supplier_id == supplier.id]
    if not orders:
        if arabic:
            answer = (
                f"مفيش أوامر شراء من {supplier.name} لحد دلوقتي."
                if supplier is not None else "مفيش أوامر شراء مسجلة لحد دلوقتي."
            )
        else:
            answer = (
                f"No purchase orders from {supplier.name} yet."
                if supplier is not None else "No purchase orders recorded yet."
            )
        return ReadAnswer(answer, [_section_source("suppliers")])
    status_ar = {
        "draft": "مسودة", "approved": "معتمدة", "partially_received": "مستلمة جزئيًا",
        "received": "مستلمة", "cancelled": "ملغاة",
    }
    counts: dict[str, int] = {}
    totals: dict[str, Decimal] = {}
    for order in orders:
        counts[order.status] = counts.get(order.status, 0) + 1
        if order.status != "cancelled":
            totals[order.currency_code] = totals.get(order.currency_code, _ZERO) + Decimal(str(order.total))
    if supplier is not None:
        parts = [
            f"{status_ar.get(status, status) if arabic else status}: {count}"
            for status, count in sorted(counts.items())
        ]
        if arabic:
            answer = (
                f"مشتريات {supplier.name}: {len(orders)} أمر شراء "
                f"({_join(parts, arabic=True)})، وإجمالي غير الملغي: "
                f"{_join(_per_currency(totals), arabic=True) or 'لا شيء'}."
            )
        else:
            answer = (
                f"Purchases from {supplier.name}: {len(orders)} purchase orders "
                f"({_join(parts, arabic=False)}), non-cancelled total: "
                f"{_join(_per_currency(totals), arabic=False) or 'nothing'}."
            )
        sources = [_record_source("supplier", supplier), _section_source("suppliers")]
        return ReadAnswer(answer, sources)
    # Generic report: top suppliers by non-cancelled PO total per currency
    # is not comparable across currencies, so rank by order count then
    # show each supplier's own per-currency totals.
    by_supplier: dict[UUID, list] = {}
    for order in orders:
        by_supplier.setdefault(order.supplier_id, []).append(order)
    ranked = sorted(by_supplier.items(), key=lambda pair: len(pair[1]), reverse=True)
    lines = []
    sources = [_section_source("suppliers")]
    for supplier_id, supplier_orders in ranked[:_LIST_LIMIT]:
        name = session.scalar(
            select(Supplier.name).where(
                Supplier.business_id == business_id, Supplier.id == supplier_id
            )
        ) or "—"
        supplier_totals: dict[str, Decimal] = {}
        for order in supplier_orders:
            if order.status != "cancelled":
                supplier_totals[order.currency_code] = (
                    supplier_totals.get(order.currency_code, _ZERO) + Decimal(str(order.total))
                )
        figures = _join(_per_currency(supplier_totals), arabic=arabic) or ("لا شيء" if arabic else "nothing")
        if arabic:
            lines.append(f"• {name}: {len(supplier_orders)} أمر — {figures}")
        else:
            lines.append(f"• {name}: {len(supplier_orders)} orders — {figures}")
    if arabic:
        answer = "مشتريات الموردين (حسب أوامر الشراء):\n" + "\n".join(lines)
    else:
        answer = "Supplier purchases (from purchase orders):\n" + "\n".join(lines)
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٣ Products / stock: balances, low stock, coverage, movements.
# ---------------------------------------------------------------------------


def _stock_quantity(session: Session, *, business_id: UUID, product_id: UUID) -> Decimal:
    total = session.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product_id,
        )
    )
    return Decimal(str(total or 0))


def _low_stock(
    session: Session, *, business_id: UUID, arabic: bool,
) -> ReadAnswer:
    products = session.scalars(
        select(Product).where(
            Product.business_id == business_id,
            Product.is_active.is_(True),
            Product.is_stock_tracked.is_(True),
        )
    ).all()
    low = []
    for product in products:
        quantity = _stock_quantity(session, business_id=business_id, product_id=product.id)
        if quantity <= brief.LOW_STOCK_THRESHOLD:
            low.append((product, quantity))
    threshold = brief.LOW_STOCK_THRESHOLD
    if not low:
        if arabic:
            return ReadAnswer(
                f"مفيش منتجات ناقصة — كل الأصناف المتتبعة فوق حد التنبيه ({threshold}).",
                [_section_source("products")],
            )
        return ReadAnswer(
            f"Nothing is low — every tracked product is above the alert threshold ({threshold}).",
            [_section_source("products")],
        )
    low.sort(key=lambda pair: pair[1])
    lines = [
        f"• {product.name}: {_qty(quantity)}"
        for product, quantity in low[:_LIST_LIMIT]
    ]
    if len(low) > _LIST_LIMIT:
        lines.append(f"… +{len(low) - _LIST_LIMIT}")
    if arabic:
        answer = (
            f"منتجات مخزونها عند أو تحت حد التنبيه ({threshold}): {len(low)} منتج.\n"
            + "\n".join(lines)
        )
    else:
        answer = (
            f"Products at or below the low-stock threshold ({threshold}): {len(low)}.\n"
            + "\n".join(lines)
        )
    sources = [_section_source("products")] + [
        _record_source("product", product) for product, _q in low[:_LIST_LIMIT]
    ]
    return ReadAnswer(answer, sources)


def _product_stock(
    session: Session, *, business_id: UUID, arabic: bool, product,
    today: date, tz_name: str,
) -> ReadAnswer:
    if not product.is_stock_tracked:
        if arabic:
            return ReadAnswer(
                f"«{product.name}» منتج مش متتبع مخزونيًا — مفيش رصيد كمية له، "
                f"وسعره {_fmt(product.unit_price)}.",
                [_record_source("product", product)],
            )
        return ReadAnswer(
            f'"{product.name}" is not stock-tracked — it has no quantity '
            f"balance; its price is {_fmt(product.unit_price)}.",
            [_record_source("product", product)],
        )
    quantity = _stock_quantity(session, business_id=business_id, product_id=product.id)
    movements = session.scalars(
        select(StockMovement)
        .where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product.id,
        )
        .order_by(StockMovement.created_at.desc())
        .limit(_LIST_LIMIT)
    ).all()
    # Coverage: sales rate over the last 30 days (business-local).
    start_utc, end_utc, _la, _le = _window("last_30", today, tz_name)
    sold = _ZERO
    for movement in session.scalars(
        select(StockMovement).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product.id,
            StockMovement.movement_type == "sale",
        )
    ).all():
        if _in_window(movement.created_at, start_utc, end_utc):
            sold += abs(Decimal(str(movement.quantity_delta)))
    type_ar = {
        "opening": "افتتاحي", "receipt": "استلام", "sale": "بيع",
        "return": "مرتجع", "adjustment": "تسوية",
    }
    lines = []
    for movement in movements:
        delta = Decimal(str(movement.quantity_delta))
        sign = "+" if delta >= 0 else ""
        when = movement.created_at.date().isoformat() if movement.created_at else "—"
        label = type_ar.get(movement.movement_type, movement.movement_type) if arabic else movement.movement_type
        lines.append(f"• {label}: {sign}{_qty(delta)} — {when}")
    if arabic:
        answer = f"رصيد «{product.name}»: {_qty(quantity)} وحدة."
        if sold > 0:
            daily = sold / Decimal(30)
            days = (quantity / daily).quantize(Decimal("0.1")) if quantity > 0 else Decimal("0")
            answer += (
                f" بمعدل بيع آخر ٣٠ يوم ({_qty(sold)} وحدة)، الرصيد يغطي "
                f"حوالي {days} يوم."
            )
        else:
            answer += " مفيش مبيعات للمنتج ده في آخر ٣٠ يوم — أيام التغطية مش قابلة للحساب."
        if lines:
            answer += "\nآخر الحركات:\n" + "\n".join(lines)
    else:
        answer = f'Balance of "{product.name}": {_qty(quantity)} units.'
        if sold > 0:
            daily = sold / Decimal(30)
            days = (quantity / daily).quantize(Decimal("0.1")) if quantity > 0 else Decimal("0")
            answer += (
                f" At the last-30-days sales rate ({_qty(sold)} units), the "
                f"balance covers about {days} days."
            )
        else:
            answer += " No sales of this product in the last 30 days — coverage days are not computable."
        if lines:
            answer += "\nLatest movements:\n" + "\n".join(lines)
    sources = [_record_source("product", product), _section_source("products")] + [
        _record_source("stock_movement", movement, when=movement.created_at)
        for movement in movements
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٥ Collections (payments received in a window) + a payment's
# allocations.
# ---------------------------------------------------------------------------


def _collections(
    session: Session, *, business_id: UUID, arabic: bool, today: date,
    tz_name: str, folded: str,
) -> ReadAnswer:
    kind = _window_kind(folded, default="today")
    start, end, label_ar, label_en = _window(kind, today, tz_name)
    payments = session.scalars(
        select(Payment).where(Payment.business_id == business_id)
    ).all()
    in_window = [p for p in payments if _in_window(p.received_at, start, end)]
    label = label_ar if arabic else label_en
    if not in_window:
        if arabic:
            return ReadAnswer(f"مفيش تحصيل مسجل {label}.", [_section_source("payments")])
        return ReadAnswer(f"No collections recorded {label}.", [_section_source("payments")])
    totals: dict[str, Decimal] = {}
    for payment in in_window:
        totals[payment.currency_code] = totals.get(payment.currency_code, _ZERO) + Decimal(str(payment.amount))
    if arabic:
        answer = (
            f"تحصيل {label}: {_join(_per_currency(totals), arabic=True)} "
            f"من {len(in_window)} دفعة."
        )
    else:
        answer = (
            f"Collections {label}: {_join(_per_currency(totals), arabic=False)} "
            f"from {len(in_window)} payments."
        )
    top = sorted(in_window, key=lambda p: Decimal(str(p.amount)), reverse=True)[:3]
    sources = [_section_source("payments")] + [
        _record_source("payment", payment, when=payment.received_at) for payment in top
    ]
    return ReadAnswer(answer, sources)


def _payment_allocations(
    session: Session, *, business_id: UUID, arabic: bool, reference: str,
) -> ReadAnswer:
    payments = session.scalars(
        select(Payment).where(
            Payment.business_id == business_id,
            Payment.reference == reference,
        )
    ).all()
    if not payments:
        payments = session.scalars(
            select(Payment).where(
                Payment.business_id == business_id,
                func.lower(Payment.reference) == reference.casefold(),
            )
        ).all()
    if not payments:
        if arabic:
            return ReadAnswer(f"مفيش دفعة مسجلة بالمرجع {reference}.")
        return ReadAnswer(f"No payment is recorded with reference {reference}.")
    if len(payments) > 1:
        if arabic:
            return ReadAnswer(
                f"المرجع {reference} بيطابق {len(payments)} دفعة — حدد أكتر "
                "(من شاشة المدفوعات) عشان أعرض تخصيصات دفعة واحدة."
            )
        return ReadAnswer(
            f"Reference {reference} matches {len(payments)} payments — narrow "
            "it down (from the Payments screen) so I can show one payment's allocations."
        )
    payment = payments[0]
    allocations = session.execute(
        select(PaymentAllocation, Invoice)
        .join(
            Invoice,
            (Invoice.id == PaymentAllocation.invoice_id)
            & (Invoice.business_id == PaymentAllocation.business_id),
        )
        .where(
            PaymentAllocation.business_id == business_id,
            PaymentAllocation.payment_id == payment.id,
            Invoice.business_id == business_id,
        )
    ).all()
    if not allocations:
        if arabic:
            return ReadAnswer(
                f"الدفعة دي ({_fmt(payment.amount)} {payment.currency_code}) "
                "مش مخصصة على أي فاتورة لحد دلوقتي.",
                [_record_source("payment", payment, when=payment.received_at)],
            )
        return ReadAnswer(
            f"That payment ({_fmt(payment.amount)} {payment.currency_code}) "
            "is not allocated to any invoice yet.",
            [_record_source("payment", payment, when=payment.received_at)],
        )
    lines = []
    allocated_total = _ZERO
    for allocation, invoice in allocations:
        amount = Decimal(str(allocation.amount))
        allocated_total += amount
        same_currency = payment.currency_code.strip().upper() == invoice.currency_code.strip().upper()
        if arabic:
            lines.append(
                f"• {_fmt(amount)} {payment.currency_code} على الفاتورة "
                f"{invoice.invoice_number}"
                + ("" if same_currency else " (عملة مختلفة عن الفاتورة — لا تقلل مستحقها)")
            )
        else:
            lines.append(
                f"• {_fmt(amount)} {payment.currency_code} on invoice "
                f"{invoice.invoice_number}"
                + ("" if same_currency else " (different currency than the invoice — does not reduce its balance)")
            )
    remainder = Decimal(str(payment.amount)) - allocated_total
    if arabic:
        answer = (
            f"تخصيصات الدفعة ({_fmt(payment.amount)} {payment.currency_code}):\n"
            + "\n".join(lines)
            + (f"\nالمتبقي غير المخصص: {_fmt(remainder)} {payment.currency_code}." if remainder > 0 else "")
        )
    else:
        answer = (
            f"Allocations of the payment ({_fmt(payment.amount)} {payment.currency_code}):\n"
            + "\n".join(lines)
            + (f"\nUnallocated remainder: {_fmt(remainder)} {payment.currency_code}." if remainder > 0 else "")
        )
    sources = [_record_source("payment", payment, when=payment.received_at)] + [
        _record_source("invoice", invoice, invoice_number=invoice.invoice_number,
                       when=invoice.created_at)
        for _allocation, invoice in allocations
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٥ Expense summary by category / period (visibility-applied).
# ---------------------------------------------------------------------------


def _expense_summary(
    session: Session, *, business_id: UUID, arabic: bool, role: MembershipRole,
    today: date, tz_name: str, folded: str,
) -> ReadAnswer:
    kind = _window_kind(folded, default="month")
    start, end, label_ar, label_en = _window(kind, today, tz_name)
    statement = apply_expense_visibility(
        select(Expense).where(Expense.business_id == business_id),
        business_id=business_id,
        role=role,
    )
    expenses = session.scalars(statement).all()
    in_window = [e for e in expenses if _in_window(e.incurred_at, start, end)]
    label = label_ar if arabic else label_en
    if not in_window:
        if arabic:
            return ReadAnswer(f"مفيش مصروفات مسجلة {label}.", [_section_source("expenses")])
        return ReadAnswer(f"No expenses recorded {label}.", [_section_source("expenses")])
    totals: dict[str, Decimal] = {}
    by_category: dict[tuple[str, str], Decimal] = {}
    for expense in in_window:
        amount = Decimal(str(expense.amount))
        totals[expense.currency_code] = totals.get(expense.currency_code, _ZERO) + amount
        key = (expense.currency_code, expense.category)
        by_category[key] = by_category.get(key, _ZERO) + amount
    ranked = sorted(by_category.items(), key=lambda pair: pair[1], reverse=True)[:4]
    lines = [
        f"• {category} ({currency}): {_fmt(amount)}"
        for (currency, category), amount in ranked
    ]
    if arabic:
        answer = (
            f"مصروفات {label}: {_join(_per_currency(totals), arabic=True)} "
            f"من {len(in_window)} مصروف.\nأكبر الفئات:\n" + "\n".join(lines)
        )
    else:
        answer = (
            f"Expenses {label}: {_join(_per_currency(totals), arabic=False)} "
            f"from {len(in_window)} expenses.\nTop categories:\n" + "\n".join(lines)
        )
    top = sorted(in_window, key=lambda e: Decimal(str(e.amount)), reverse=True)[:3]
    sources = [_section_source("expenses")] + [
        _record_source("expense", expense, category=expense.category, when=expense.incurred_at)
        for expense in top
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٤ Purchase-order status summary (optionally for one supplier).
# ---------------------------------------------------------------------------


def _po_status(
    session: Session, *, business_id: UUID, arabic: bool, supplier=None,
) -> ReadAnswer:
    orders = session.scalars(
        select(PurchaseOrder)
        .where(PurchaseOrder.business_id == business_id)
        .order_by(PurchaseOrder.created_at.desc())
    ).all()
    if supplier is not None:
        orders = [order for order in orders if order.supplier_id == supplier.id]
    if not orders:
        if arabic:
            answer = (
                f"مفيش أوامر شراء من {supplier.name}."
                if supplier is not None else "مفيش أوامر شراء مسجلة لحد دلوقتي."
            )
        else:
            answer = (
                f"No purchase orders from {supplier.name}."
                if supplier is not None else "No purchase orders recorded yet."
            )
        return ReadAnswer(answer, [_section_source("purchase-orders")])
    status_ar = {
        "draft": "مسودة", "approved": "معتمدة", "partially_received": "مستلمة جزئيًا",
        "received": "مستلمة", "cancelled": "ملغاة",
    }
    counts: dict[str, int] = {}
    totals: dict[str, Decimal] = {}
    for order in orders:
        counts[order.status] = counts.get(order.status, 0) + 1
        if order.status != "cancelled":
            totals[order.currency_code] = totals.get(order.currency_code, _ZERO) + Decimal(str(order.total))
    parts = [
        f"{status_ar.get(status, status) if arabic else status}: {count}"
        for status, count in sorted(counts.items())
    ]
    supplier_names = {}
    lines = []
    for order in orders[:_LIST_LIMIT]:
        if order.supplier_id not in supplier_names:
            supplier_names[order.supplier_id] = session.scalar(
                select(Supplier.name).where(
                    Supplier.business_id == business_id,
                    Supplier.id == order.supplier_id,
                )
            ) or "—"
        status_label = status_ar.get(order.status, order.status) if arabic else order.status
        lines.append(
            f"• {order.order_number} — {supplier_names[order.supplier_id]} — "
            f"{status_label} — {_fmt(order.total)} {order.currency_code}"
        )
    scope = f" من {supplier.name}" if (arabic and supplier is not None) else (
        f" from {supplier.name}" if supplier is not None else ""
    )
    if arabic:
        answer = (
            f"أوامر الشراء{scope}: {len(orders)} أمر ({_join(parts, arabic=True)})، "
            f"إجمالي غير الملغي {_join(_per_currency(totals), arabic=True) or 'لا شيء'}.\n"
            + "\n".join(lines)
        )
    else:
        answer = (
            f"Purchase orders{scope}: {len(orders)} orders ({_join(parts, arabic=False)}), "
            f"non-cancelled total {_join(_per_currency(totals), arabic=False) or 'nothing'}.\n"
            + "\n".join(lines)
        )
    sources = [_section_source("purchase-orders")] + [
        _record_source("purchase_order", order, when=order.created_at)
        for order in orders[:_LIST_LIMIT]
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٨ Returns + credit notes status (with the standing caveat).
# ---------------------------------------------------------------------------


def _returns_status(
    session: Session, *, business_id: UUID, arabic: bool,
) -> ReadAnswer:
    returns = session.scalars(
        select(SalesReturn)
        .where(SalesReturn.business_id == business_id)
        .order_by(SalesReturn.created_at.desc())
    ).all()
    notes = session.scalars(
        select(CreditNote).where(CreditNote.business_id == business_id)
    ).all()
    if not returns and not notes:
        if arabic:
            return ReadAnswer("مفيش مرتجعات مبيعات ولا إشعارات دائنة مسجلة لحد دلوقتي.",
                              [_section_source("sales-returns")])
        return ReadAnswer("No sales returns or credit notes recorded yet.",
                          [_section_source("sales-returns")])
    status_ar = {"draft": "مسودة", "approved": "معتمدة", "rejected": "مرفوضة"}
    counts: dict[str, int] = {}
    totals: dict[str, Decimal] = {}
    for sales_return in returns:
        counts[sales_return.status] = counts.get(sales_return.status, 0) + 1
        if sales_return.status == "approved":
            invoice = session.scalar(
                select(Invoice).where(
                    Invoice.business_id == business_id,
                    Invoice.id == sales_return.invoice_id,
                )
            )
            if invoice is not None:
                totals[invoice.currency_code] = (
                    totals.get(invoice.currency_code, _ZERO) + Decimal(str(sales_return.total))
                )
    note_totals: dict[str, Decimal] = {}
    for note in notes:
        note_totals[note.currency_code] = note_totals.get(note.currency_code, _ZERO) + Decimal(str(note.total))
    parts = [
        f"{status_ar.get(status, status) if arabic else status}: {count}"
        for status, count in sorted(counts.items())
    ]
    if arabic:
        answer = (
            f"مرتجعات المبيعات: {len(returns)} مرتجع ({_join(parts, arabic=True)})"
            + (f"، المعتمد منها {_join(_per_currency(totals), arabic=True)}" if totals else "")
            + f". إشعارات دائنة: {len(notes)}"
            + (f" بإجمالي {_join(_per_currency(note_totals), arabic=True)}" if note_totals else "")
            + ".\n" + _CREDIT_NOTE_CAVEAT_AR
        )
    else:
        answer = (
            f"Sales returns: {len(returns)} ({_join(parts, arabic=False)})"
            + (f", approved totalling {_join(_per_currency(totals), arabic=False)}" if totals else "")
            + f". Credit notes: {len(notes)}"
            + (f" totalling {_join(_per_currency(note_totals), arabic=False)}" if note_totals else "")
            + ".\n" + _CREDIT_NOTE_CAVEAT_EN
        )
    sources = [_section_source("sales-returns")] + [
        _record_source("sales_return", sales_return, when=sales_return.created_at)
        for sales_return in returns[:_LIST_LIMIT]
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩ Recurring-invoice schedules status (scheduling settings only —
# the DESIGN §٣.٢ caveat: the scheduler worker is not deployed).
# ---------------------------------------------------------------------------


def _recurring_status(
    session: Session, *, business_id: UUID, arabic: bool, tz,
) -> ReadAnswer:
    schedules = session.scalars(
        select(RecurringInvoiceSchedule)
        .where(RecurringInvoiceSchedule.business_id == business_id)
        .order_by(RecurringInvoiceSchedule.next_run_at.asc())
    ).all()
    if not schedules:
        if arabic:
            return ReadAnswer("مفيش جداول فواتير دورية مضبوطة لحد دلوقتي.",
                              [_section_source("recurring-invoices")])
        return ReadAnswer("No recurring-invoice schedules are set up yet.",
                          [_section_source("recurring-invoices")])
    active = [row for row in schedules if row.is_active]
    lines = []
    for row in active[:_LIST_LIMIT]:
        customer_name = session.scalar(
            select(Customer.name).where(
                Customer.business_id == business_id,
                Customer.id == row.customer_id,
            )
        ) or "—"
        next_run = row.next_run_at
        aware = next_run if next_run.tzinfo is not None else next_run.replace(tzinfo=UTC)
        local_date = aware.astimezone(tz).date().isoformat()
        if arabic:
            lines.append(
                f"• {customer_name}: كل {row.interval_days} يوم — الجاية {local_date}"
            )
        else:
            lines.append(
                f"• {customer_name}: every {row.interval_days} days — next {local_date}"
            )
    if arabic:
        answer = (
            f"جداول الفواتير الدورية: {len(active)} نشطة و{len(schedules) - len(active)} موقوفة.\n"
            + "\n".join(lines)
            + "\nتنبيه: دي إعدادات جدولة بس — عامل الجدولة غير منشور، "
              "فالجدولة لوحدها ما بتولّدش فواتير تلقائيًا."
        )
    else:
        answer = (
            f"Recurring-invoice schedules: {len(active)} active, "
            f"{len(schedules) - len(active)} paused.\n"
            + "\n".join(lines)
            + "\nNote: these are scheduling settings only — the scheduler "
              "worker is not deployed, so a schedule alone does not "
              "generate invoices automatically."
        )
    sources = [_section_source("recurring-invoices")] + [
        _record_source("recurring_invoice", row, when=row.next_run_at) for row in active[:_LIST_LIMIT]
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩ Notifications queue status (stored queue only — DESIGN §٣.٢).
# ---------------------------------------------------------------------------


def _notifications_status(
    session: Session, *, business_id: UUID, arabic: bool,
) -> ReadAnswer:
    notifications = session.scalars(
        select(Notification)
        .where(Notification.business_id == business_id)
        .order_by(Notification.created_at.desc())
    ).all()
    if not notifications:
        if arabic:
            return ReadAnswer("مفيش إشعارات في القائمة لحد دلوقتي.",
                              [_section_source("notifications")])
        return ReadAnswer("No notifications in the queue yet.",
                          [_section_source("notifications")])
    counts: dict[str, int] = {}
    for notification in notifications:
        counts[notification.status] = counts.get(notification.status, 0) + 1
    status_ar = {
        "pending": "في الانتظار", "sent": "اتبعتت", "failed": "فشلت", "cancelled": "ملغاة",
    }
    parts = [
        f"{status_ar.get(status, status) if arabic else status}: {count}"
        for status, count in sorted(counts.items())
    ]
    lines = [
        f"• {notification.title} ({status_ar.get(notification.status, notification.status) if arabic else notification.status})"
        for notification in notifications[:_LIST_LIMIT]
    ]
    if arabic:
        answer = (
            f"الإشعارات: {len(notifications)} ({_join(parts, arabic=True)}).\n"
            + "\n".join(lines)
            + "\nدي قائمة مخزنة بس — توصيل الإشعارات الفعلي مش مهيأ لسه."
        )
    else:
        answer = (
            f"Notifications: {len(notifications)} ({_join(parts, arabic=False)}).\n"
            + "\n".join(lines)
            + "\nThis is a stored queue only — actual delivery is not configured yet."
        )
    sources = [_section_source("notifications")] + [
        _record_source("notification", notification, when=notification.created_at)
        for notification in notifications[:_LIST_LIMIT]
    ]
    return ReadAnswer(answer, sources)


# ---------------------------------------------------------------------------
# §٩.٩ Operating result (profit-loss rule + the standing pre-COGS
# preliminary caveat) and the tax summary (with its standing caveat).
# ---------------------------------------------------------------------------


def _operating_result(
    session: Session, *, business_id: UUID, arabic: bool, role: MembershipRole,
    today: date, tz_name: str, folded: str,
) -> ReadAnswer:
    kind = _window_kind(folded, default="month")
    start, end, label_ar, label_en = _window(kind, today, tz_name)
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
        )
    ).all()
    revenue: dict[str, Decimal] = {}
    for invoice in invoices:
        if _in_window(invoice.issue_date or invoice.created_at, start, end):
            revenue[invoice.currency_code] = (
                revenue.get(invoice.currency_code, _ZERO) + Decimal(str(invoice.total))
            )
    expense_statement = apply_expense_visibility(
        select(Expense).where(Expense.business_id == business_id),
        business_id=business_id,
        role=role,
    )
    expenses = session.scalars(expense_statement).all()
    expense_totals: dict[str, Decimal] = {}
    for expense in expenses:
        if _in_window(expense.incurred_at, start, end):
            expense_totals[expense.currency_code] = (
                expense_totals.get(expense.currency_code, _ZERO) + Decimal(str(expense.amount))
            )
    returns = session.scalars(
        select(SalesReturn).where(
            SalesReturn.business_id == business_id,
            SalesReturn.status == "approved",
        )
    ).all()
    return_totals: dict[str, Decimal] = {}
    for sales_return in returns:
        if not _in_window(sales_return.created_at, start, end):
            continue
        invoice = session.scalar(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.id == sales_return.invoice_id,
            )
        )
        if invoice is not None:
            return_totals[invoice.currency_code] = (
                return_totals.get(invoice.currency_code, _ZERO) + Decimal(str(sales_return.total))
            )
    label = label_ar if arabic else label_en
    if not revenue and not expense_totals:
        if arabic:
            return ReadAnswer(f"مفيش إيرادات ولا مصروفات مسجلة {label} — مفيش نتيجة تشغيل تتحسب.",
                              [_section_source("reports")])
        return ReadAnswer(f"No revenue or expenses recorded {label} — there is no operating result to compute.",
                          [_section_source("reports")])
    lines = []
    for currency in sorted(set(revenue) | set(expense_totals)):
        rev = revenue.get(currency, _ZERO)
        exp = expense_totals.get(currency, _ZERO)
        result = rev - exp
        if arabic:
            line = (
                f"• {currency}: إيرادات {_fmt(rev)} − مصروفات {_fmt(exp)} = "
                f"نتيجة تشغيل {_fmt(result)}"
            )
            if return_totals.get(currency):
                line += f" (ومرتجعات معتمدة {_fmt(return_totals[currency])} معروضة لوحدها ومش مخصومة)"
        else:
            line = (
                f"• {currency}: revenue {_fmt(rev)} − expenses {_fmt(exp)} = "
                f"operating result {_fmt(result)}"
            )
            if return_totals.get(currency):
                line += f" (approved returns of {_fmt(return_totals[currency])} shown separately, not netted)"
        lines.append(line)
    if arabic:
        answer = (
            f"نتيجة التشغيل {label}:\n" + "\n".join(lines)
            + "\nتنبيه ثابت: دي نتيجة أولية قبل تكلفة البضاعة المباعة — "
              "مش صافي ربح محاسبي نهائي."
        )
    else:
        answer = (
            f"Operating result {label}:\n" + "\n".join(lines)
            + "\nStanding caveat: this is a preliminary result before cost "
              "of goods sold — not a final accounting net profit."
        )
    return ReadAnswer(answer, [_section_source("reports")])


def _tax_summary(
    session: Session, *, business_id: UUID, arabic: bool, today: date,
    tz_name: str, folded: str,
) -> ReadAnswer:
    kind = _window_kind(folded, default="month")
    start, end, label_ar, label_en = _window(kind, today, tz_name)
    invoices = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
        )
    ).all()
    totals: dict[str, Decimal] = {}
    counts: dict[str, int] = {}
    for invoice in invoices:
        if _in_window(invoice.issue_date or invoice.created_at, start, end):
            totals[invoice.currency_code] = (
                totals.get(invoice.currency_code, _ZERO) + Decimal(str(invoice.tax_total))
            )
            counts[invoice.currency_code] = counts.get(invoice.currency_code, 0) + 1
    label = label_ar if arabic else label_en
    if not totals:
        if arabic:
            return ReadAnswer(f"مفيش فواتير صادرة {label} — مفيش ملخص ضرائب.",
                              [_section_source("reports")])
        return ReadAnswer(f"No issued invoices {label} — there is no tax summary.",
                          [_section_source("reports")])
    lines = [
        f"• {currency}: {_fmt(totals[currency])} من {counts[currency]} فاتورة"
        if arabic else
        f"• {currency}: {_fmt(totals[currency])} from {counts[currency]} invoices"
        for currency in sorted(totals)
    ]
    if arabic:
        answer = (
            f"ملخص الضرائب {label} (من ضرائب الفواتير الصادرة):\n" + "\n".join(lines)
            + "\nتنبيه ثابت: ده ملخص تشغيلي بس — لا يغني عن الإقرار الضريبي الرسمي."
        )
    else:
        answer = (
            f"Tax summary {label} (from issued invoices' tax):\n" + "\n".join(lines)
            + "\nStanding caveat: this is an operational summary only — it "
              "does not replace the official tax return."
        )
    return ReadAnswer(answer, [_section_source("reports")])


# ---------------------------------------------------------------------------
# Name-resolution wrappers (Slice 3's discipline: exact full name
# wins, unique one-token match, ambiguity = ONE clarification).
# ---------------------------------------------------------------------------


def _clarify_suppliers(*, arabic: bool, rows) -> ReadAnswer:
    names = "؛ ".join(f"«{row.name}»" for row in rows) if arabic else "; ".join(
        f'"{row.name}"' for row in rows
    )
    if arabic:
        return ReadAnswer(f"الاسم ده بيطابق أكتر من مورد: {names}. قصدك أنهي واحد؟")
    return ReadAnswer(f"That name matches more than one supplier: {names}. Which one do you mean?")


def _clarify_products(*, arabic: bool, rows) -> ReadAnswer:
    if arabic:
        options = "؛ ".join(
            f"«{row.name}» (سعره {_fmt(row.unit_price)})" for row in rows
        )
        return ReadAnswer(f"الاسم ده بيطابق أكتر من منتج: {options}. قصدك أنهي واحد؟")
    options = "; ".join(
        f'"{row.name}" (price {_fmt(row.unit_price)})' for row in rows
    )
    return ReadAnswer(f"That name matches more than one product: {options}. Which one do you mean?")


def _neutral_miss(*, arabic: bool, name: str) -> ReadAnswer:
    if arabic:
        return ReadAnswer(f"مش لاقي سجل باسم «{name}» — لا عميل ولا منتج مسجل بالاسم ده.")
    return ReadAnswer(f'I can\'t find a record named "{name}" — no customer or product is registered under that name.')


# ---------------------------------------------------------------------------
# Dispatcher: match read intents (most specific first) and answer.
# Returns None when the message is not a read/report question this
# module serves, so the caller falls through to the existing flow.
# ---------------------------------------------------------------------------


def _has_window_cue(folded: str) -> bool:
    return _window_kind(folded, default="") != ""


def answer_read_question(
    session: Session,
    *,
    business_id: UUID,
    message: str,
    role: MembershipRole,
    business_currency: str,
    now: datetime | None = None,
) -> ReadAnswer | None:
    arabic = _is_arabic_message(message)
    folded, index_map = _fold_light(message)
    # _fold_light's alef/ة step is a no-op in practice (it looks the
    # translate table up by character instead of translating), so the
    # folded text still carries أ/إ/آ/ة. This module's Arabic patterns
    # are written in folded form, so apply the intended folding here.
    # translate() is character-for-character, so index_map stays valid
    # for slicing names out of the original message.
    folded = folded.translate(_ALEF_NORMALIZE)
    tz_name, tz = brief._business_timezone(session, business_id)
    moment = now or datetime.now(UTC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    today = moment.astimezone(tz).date()
    today_start_utc = datetime.combine(today, time.min, tzinfo=tz).astimezone(UTC)
    owner = role == MembershipRole.OWNER

    def sliced_name(match: re.Match) -> str:
        start, end = match.span("name")
        name = _clean_name(_raw_slice(message, index_map, start, end))
        # _clean_name strips Arabic ؟ but not an ASCII "?" — an English
        # question's trailing mark is never part of a name.
        return name.rstrip("?").strip() if name else name

    # §٩.٧ Payroll — owner-only.
    if re.search(r"\bpayroll\b", folded, re.IGNORECASE) or any(
        phrase in folded for phrase in ("مرتبات", "رواتب", "المرتبات")
    ):
        if not owner:
            return _role_refusal(arabic=arabic)
        return _payroll_report(
            session, business_id=business_id, arabic=arabic,
            business_currency=business_currency, folded=folded,
        )

    # §٩.٩ Audit log — owner-only.
    if any(phrase in folded for phrase in _AUDIT_PHRASES_AR) or any(
        phrase in folded.lower() for phrase in _AUDIT_PHRASES_EN
    ):
        if not owner:
            return _role_refusal(arabic=arabic)
        return _audit_query(session, business_id=business_id, arabic=arabic, tz=tz)

    # §٩.٩ Data integrity — owner-only, display only.
    if (
        re.search(r"data\s+integrity|integrity\s+check", folded, re.IGNORECASE)
        or "سلامه البيانات" in folded
        or "فحص السلامه" in folded
    ):
        if not owner:
            return _role_refusal(arabic=arabic)
        return _integrity_report(session, business_id=business_id, arabic=arabic)

    # §٩.٩ System status — owner-only.
    if (
        re.search(r"system\s+status|operational\s+status|health\s+check", folded, re.IGNORECASE)
        or "حاله النظام" in folded
        or "الحاله التشغيليه" in folded
        or "حاله التشغيل" in folded
    ):
        if not owner:
            return _role_refusal(arabic=arabic)
        return _system_status(session, business_id=business_id, arabic=arabic)

    # §٩.١ Invoice detail by number (requires a detail/show cue).
    for pattern in _DETAIL_PATTERNS:
        match = pattern.search(folded)
        if match:
            return _invoice_detail(
                session, business_id=business_id, arabic=arabic,
                number=match.group("number"),
            )

    # §٩.٦ Treasury — before the customer-statement branch so
    # «رصيد الخزنة» is never mistaken for a customer named "الخزنة".
    if (
        re.search(r"\bcashbox\b|\btreasury\b", folded, re.IGNORECASE)
        or "خزنه" in folded
        or "خزينه" in folded
        or "الدرج" in folded
    ):
        return _treasury(
            session, business_id=business_id, arabic=arabic,
            today_start_utc=today_start_utc,
        )

    # §٩.٥ A payment's allocations (needs a payment reference).
    allocation_match = re.search(
        r"allocations?\s+of\s+(?:the\s+)?payment\s+(?:reference\s+|#\s*)?(?P<ref>[\w-]+)",
        folded, re.IGNORECASE,
    ) or re.search(r"تخصيصات\s+(?:الدفعه|دفعه)\s+(?P<ref>[\w-]+)", folded)
    if allocation_match:
        return _payment_allocations(
            session, business_id=business_id, arabic=arabic,
            reference=allocation_match.group("ref"),
        )

    # A name that matches neither a customer nor a product keeps the
    # first branch's honest miss instead of falling through to the
    # provider (which would invent an answer about a named record).
    pending_miss: ReadAnswer | None = None

    # §٩.٢ Customer statement / balance by name.
    statement_match = (
        re.search(r"(?:statement|balance)\s+(?:of|for)\s+(?P<name>.+?)\s*$", folded, re.IGNORECASE)
        or re.search(r"(?P<name>.+?)'s\s+(?:statement|balance|account)\b", folded, re.IGNORECASE)
        or re.search(r"(?:كشف\s+حساب|رصيد|حساب)\s+(?:العميل\s+|للعميل\s+)?(?P<name>.+?)\s*$", folded)
    )
    if statement_match:
        name = sliced_name(statement_match)
        if name:
            customers = session.scalars(
                select(Customer).where(
                    Customer.business_id == business_id,
                    Customer.is_active.is_(True),
                )
            ).all()
            status, rows = _resolve_by_name(customers, name)
            if status == "one":
                return _customer_statement(
                    session, business_id=business_id, arabic=arabic, customer=rows[0]
                )
            if status == "many":
                return _clarify_customers(
                    arabic=arabic, rows=rows, session=session, business_id=business_id
                )
            pending_miss = _neutral_miss(arabic=arabic, name=name)

    # §٩.٢ Customer search by name.
    search_match = (
        re.search(r"(?:search|find|look\s*up)\s+(?:for\s+)?(?:the\s+)?customer\s+(?P<name>.+?)\s*$", folded, re.IGNORECASE)
        or re.search(r"customer\s+(?:named|called)\s+(?P<name>.+?)\s*$", folded, re.IGNORECASE)
        or re.search(r"(?:دور\s+على|ابحث\s+عن|بحث\s+عن)\s+(?:عميل\s+)?(?:اسمه\s+)?(?P<name>.+?)\s*$", folded)
    )
    if search_match:
        name = sliced_name(search_match)
        if name:
            customers = session.scalars(
                select(Customer).where(
                    Customer.business_id == business_id,
                    Customer.is_active.is_(True),
                )
            ).all()
            status, rows = _resolve_by_name(customers, name)
            if status == "none":
                folded_query = _fold_name(name)
                rows = [
                    row for row in customers
                    if folded_query and folded_query in _fold_name(row.name)
                ]
            if rows:
                return _customer_search(
                    session, business_id=business_id, arabic=arabic, rows=rows
                )
            if arabic:
                return ReadAnswer(f"مفيش عميل مسجل باسم «{name}».")
            return ReadAnswer(f'No customer is registered under the name "{name}".')

    # §٩.٢/§٩.٤ Supplier-named reads: purchases totals, or the PO list
    # for one supplier. Generic supplier report when no name is given.
    supplier_match = (
        re.search(r"purchase\s+orders?\s+from\s+(?P<name>.+?)\s*$", folded, re.IGNORECASE)
        or re.search(r"اوامر\s+الشراء\s+من\s+(?:المورد\s+)?(?P<name>.+?)\s*$", folded)
    )
    supplier_mode = "orders" if supplier_match else None
    if supplier_match is None:
        supplier_match = (
            re.search(r"(?:supplier\s+)?purchases\s+from\s+(?P<name>.+?)\s*$", folded, re.IGNORECASE)
            or re.search(r"(?P<name>.+?)'s\s+purchases\b", folded, re.IGNORECASE)
            or re.search(r"مشتريات\s+(?:من\s+)?المورد\s+(?P<name>.+?)\s*$", folded)
            or re.search(r"مشتريات\s+من\s+(?P<name>.+?)\s*$", folded)
        )
        supplier_mode = "purchases" if supplier_match else None
    if supplier_match:
        name = sliced_name(supplier_match)
        if name:
            suppliers = session.scalars(
                select(Supplier).where(
                    Supplier.business_id == business_id,
                    Supplier.is_active.is_(True),
                )
            ).all()
            status, rows = _resolve_by_name(suppliers, name)
            if status == "one":
                if supplier_mode == "orders":
                    return _po_status(
                        session, business_id=business_id, arabic=arabic, supplier=rows[0]
                    )
                return _supplier_purchases(
                    session, business_id=business_id, arabic=arabic, supplier=rows[0]
                )
            if status == "many":
                return _clarify_suppliers(arabic=arabic, rows=rows)
            if arabic:
                return ReadAnswer(f"مش لاقي مورد مسجل باسم «{name}».")
            return ReadAnswer(f'No supplier is registered under the name "{name}".')
    elif (
        re.search(r"supplier\s+(?:purchases|report|totals)", folded, re.IGNORECASE)
        or "مشتريات الموردين" in folded
        or "تقارير الموردين" in folded
    ):
        return _supplier_purchases(session, business_id=business_id, arabic=arabic)

    # §٩.٣ Low stock (generic) before named-product stock.
    if (
        re.search(r"low\s+stock|out\s+of\s+stock|running\s+low", folded, re.IGNORECASE)
        or re.search(r"مخزون\s+(?:ناقص|منخفض|قليل)", folded)
        or "نواقص" in folded
        or "قرب يخلص" in folded
    ):
        return _low_stock(session, business_id=business_id, arabic=arabic)

    # §٩.٣ Named-product stock / movements / coverage.
    product_match = (
        re.search(r"(?:stock|balance|inventory)\s+of\s+(?P<name>.+?)\s*$", folded, re.IGNORECASE)
        or re.search(r"how\s+much\s+(?P<name>.+?)\s+(?:is\s+)?left", folded, re.IGNORECASE)
        or re.search(r"how\s+many\s+(?P<name>.+?)\s+(?:do\s+we\s+have|left|in\s+stock)", folded, re.IGNORECASE)
        or re.search(r"(?:رصيد|مخزون)\s+(?P<name>.+?)\s*$", folded)
        or re.search(r"(?:كام\s+(?:فاضل\s+من|من)|فاضل\s+كام\s+من|متبقي\s+من)\s+(?P<name>.+?)\s*$", folded)
    )
    if product_match:
        name = sliced_name(product_match)
        if name:
            products = session.scalars(
                select(Product).where(
                    Product.business_id == business_id,
                    Product.is_active.is_(True),
                )
            ).all()
            status, rows = _resolve_by_name(products, name)
            if status == "one":
                return _product_stock(
                    session, business_id=business_id, arabic=arabic,
                    product=rows[0], today=today, tz_name=tz_name,
                )
            if status == "many":
                return _clarify_products(arabic=arabic, rows=rows)
            if pending_miss is None:
                pending_miss = _neutral_miss(arabic=arabic, name=name)

    if pending_miss is not None:
        return pending_miss

    # §٩.١ Outstanding + overdue with aging.
    if (
        re.search(r"\boverdue\b|\bpast\s+due\b|\boutstanding\b|\breceivables\b", folded, re.IGNORECASE)
        or "متاخر" in folded
        or "مستحقات" in folded
        or "مين عليه" in folded
        or "الديون" in folded
    ):
        return _outstanding_report(
            session, business_id=business_id, arabic=arabic, today=today
        )

    # §٩.١ Paid ratio.
    if (
        re.search(r"paid\s+ratio|collection\s+(?:rate|ratio)", folded, re.IGNORECASE)
        or "نسبه المدفوع" in folded
        or "نسبه التحصيل" in folded
    ):
        return _paid_ratio(session, business_id=business_id, arabic=arabic)

    # §٩.٩ Operating result (before the plainer sales/expense reads).
    if (
        re.search(r"operating\s+result|profit\s+and\s+loss", folded, re.IGNORECASE)
        or "نتيجه التشغيل" in folded
        or "الارباح والخسائر" in folded
        or "نتيجه الاعمال" in folded
    ):
        return _operating_result(
            session, business_id=business_id, arabic=arabic, role=role,
            today=today, tz_name=tz_name, folded=folded,
        )

    # §٩.٩ Tax summary.
    if (
        re.search(r"\btax(?:es)?\s+(?:summary|report|total)", folded, re.IGNORECASE)
        or "ضرائب" in folded
        or "ضريبه" in folded
        or "ملخص الضرائب" in folded
    ):
        return _tax_summary(
            session, business_id=business_id, arabic=arabic, today=today,
            tz_name=tz_name, folded=folded,
        )

    # §٩.١٠ Period comparison (sales nouns + a comparison cue).
    if (
        (
            re.search(r"compar|versus|\bvs\b", folded, re.IGNORECASE)
            or "مقارنه" in folded
            or "قارن" in folded
        )
        and (
            re.search(r"\bsales\b|\binvoices?\b|\brevenue\b", folded, re.IGNORECASE)
            or "مبيعات" in folded
            or "فواتير" in folded
        )
    ):
        return _sales_compare(
            session, business_id=business_id, arabic=arabic, today=today,
            tz_name=tz_name,
        )

    # §٩.١/§٩.٩ Sales summary (sales noun + a stated window).
    if (
        re.search(r"\bsales\b|\brevenue\b", folded, re.IGNORECASE)
        or "مبيعات" in folded
    ) and _has_window_cue(folded):
        return _sales_summary(
            session, business_id=business_id, arabic=arabic, today=today,
            tz_name=tz_name, folded=folded,
        )

    # §٩.٥ Collections.
    if (
        re.search(r"\bcollect(?:ions?|ed)?\b|payments\s+received", folded, re.IGNORECASE)
        or "تحصيل" in folded
        or "اتحصل" in folded
    ):
        return _collections(
            session, business_id=business_id, arabic=arabic, today=today,
            tz_name=tz_name, folded=folded,
        )

    # §٩.٥ Expense summary (expense noun + window or summary cue).
    if (
        re.search(r"\bexpenses?\b", folded, re.IGNORECASE)
        or "مصروفات" in folded
        or "مصاريف" in folded
    ) and (
        _has_window_cue(folded)
        or re.search(r"summary|breakdown|by\s+category", folded, re.IGNORECASE)
        or "ملخص" in folded
        or "حسب الفئه" in folded
        or "حسب التصنيف" in folded
    ):
        return _expense_summary(
            session, business_id=business_id, arabic=arabic, role=role,
            today=today, tz_name=tz_name, folded=folded,
        )

    # §٩.٤ Purchase-order status (generic).
    if (
        re.search(r"\bpurchase\s+orders?\b", folded, re.IGNORECASE)
        or "اوامر الشراء" in folded
    ):
        return _po_status(session, business_id=business_id, arabic=arabic)

    # §٩.٨ Returns + credit notes (before notifications: «إشعارات
    # دائنة» contains «إشعارات»).
    if (
        re.search(r"sales\s+returns?|credit\s+notes?", folded, re.IGNORECASE)
        or "مرتجع" in folded
        or "اشعارات دائنه" in folded
        or "اشعار دائن" in folded
    ):
        return _returns_status(session, business_id=business_id, arabic=arabic)

    # §٩ Recurring-invoice schedules.
    if (
        re.search(r"\brecurring\b", folded, re.IGNORECASE)
        or "دوريه" in folded
        or "متكرره" in folded
    ):
        return _recurring_status(
            session, business_id=business_id, arabic=arabic, tz=tz
        )

    # §٩ Notifications queue.
    if (
        re.search(r"\bnotifications?\b", folded, re.IGNORECASE)
        or "اشعارات" in folded
        or "الاشعارات" in folded
    ):
        return _notifications_status(session, business_id=business_id, arabic=arabic)

    return None
