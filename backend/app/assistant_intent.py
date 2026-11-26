"""Deterministic intent extraction for the assistant chat (Slice 3).

When the chat endpoint sees an action request whose payload is
deterministically extractable from the message — a named customer, a
priced product, an invoice number + customer + amount, a payment with
an explicit amount + target, an expense with an explicit amount +
category, a stock movement with an explicit product + quantity — this
module turns it into a proposal draft (``IntentResult(kind="proposal")``)
that the caller creates through the same ``create_proposal`` path as
every other proposal (payload validation, hash binding, ``verdict()``,
5-minute expiry). Nothing is executed here; the proposal is a draft
the user reviews in the card.

Deliberate boundaries (no guessing, ever):

- Names are resolved against the business's own records. An exact
  full-name match wins; a one-token query may match one name token
  ("احمد" matches "احمد سامي" only when it is the only match). Two or
  more matches mean ambiguity: ONE short clarification question with
  options (DESIGN.md example 8), never a pick.
- A missing target is stated honestly ("مش لاقي عميل بالاسم ده"), never
  invented. A missing required field (no invoice number, no price,
  no category) is a clarification, not a refusal — except a draft
  invoice with no customer at all, which stays refused like today
  ("Create a new invoice for 250 EGP" names no customer).
- Amounts come only from explicit numbers in the message. Money
  amounts must have at most 2 decimals (the payload models reject
  more); stock quantities at most 3. A number that does not fit is
  not extractable and the request falls through to the existing
  refusal / fallback flow.
- Only the listed intent families convert. Void / issue / pay /
  refund invoice, deletes, settings and membership changes stay
  refused exactly as before. The provider path is untouched and is
  never called for a deterministic intent.
- The invoice number and the customer / product names in a payload
  are the user's own spelling, sliced out of the original message
  (the folded text is only used for matching).

Batch ق-2 adds the remaining 🟢 ALLOW-list producers on the same
discipline: customer.update (only the fields the message states),
invoice.duplicate, purchase_order.create / .duplicate,
sales_return.create (quantities checked against the invoiced
quantity remaining after approved returns) and invoice.update_draft
(a FULL merged payload built from the stored draft — the executor
replaces the whole draft, so unstated fields carry their current
values; the stored draft keeps discount/tax TOTALS, not rates, so a
draft whose totals carry a discount or tax the message does not
restate cannot be rebuilt exactly and is answered honestly).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Customer,
    Invoice,
    InvoiceLine,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesReturn,
    SalesReturnLine,
    Supplier,
)

__all__ = [
    "IntentResult",
    "draft_answer",
    "extract_deterministic_intent",
    "owner_needed_answer",
]


# ---------------------------------------------------------------------------
# Light folding: same character folding as assistant_api._normalize_message
# (Arabic diacritics stripped, alef variants and ة folded, Arabic-Indic
# digits folded to ASCII) — but case and punctuation are PRESERVED, so a
# match span can be sliced out of the original message with the user's
# own spelling. The index map records, for each folded character, the
# raw index it came from (diacritics and tatweel are dropped, so the
# folded text can be shorter than the raw message).
# ---------------------------------------------------------------------------

_ARABIC_DIACRITICS = re.compile(r"[\u064b-\u065f\u0670\u0640]")
_ALEF_NORMALIZE = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه"})
_DIGIT_FOLD = str.maketrans({
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٬": ",", "،": ",",
})
_ARABIC_SCRIPT = re.compile(r"[\u0600-\u06ff]")


def _fold_light(message: str) -> tuple[str, list[int]]:
    """Fold a message for matching; return (folded, index_map)."""
    out: list[str] = []
    index_map: list[int] = []
    for raw_index, char in enumerate(message):
        if _ARABIC_DIACRITICS.match(char):
            continue
        # str.maketrans tables are keyed by ordinal — they must be
        # applied with translate(), not .get(char): a .get() lookup
        # with a str key never matches and silently folds nothing
        # (the voice gate caught this, 2026-11-26: ة-spelled and
        # Arabic-Indic-digit messages extracted no intent at all).
        folded = char.translate(_DIGIT_FOLD).translate(_ALEF_NORMALIZE)
        out.append(folded)
        index_map.append(raw_index)
    return "".join(out), index_map


def _raw_slice(message: str, index_map: list[int], start: int, end: int) -> str:
    """Slice the original message over a folded-text span."""
    if start >= end or start >= len(index_map):
        return ""
    return message[index_map[start]:index_map[end - 1] + 1]


def _fold_name(name: str) -> str:
    """Fold a stored / queried name for comparison (casefolded)."""
    text = name.casefold()
    text = _ARABIC_DIACRITICS.sub("", text)
    text = text.translate(_ALEF_NORMALIZE)
    return " ".join(text.split())


def _is_arabic_message(message: str) -> bool:
    return _ARABIC_SCRIPT.search(message) is not None


# ---------------------------------------------------------------------------
# Amounts and currencies.
# ---------------------------------------------------------------------------

_CURRENCY_WORDS = {
    "egp": "EGP", "le": "EGP", "جنيه": "EGP", "جنيهات": "EGP", "ج": "EGP",
    "usd": "USD", "دولار": "USD", "$": "USD",
    "eur": "EUR", "يورو": "EUR",
    "sar": "SAR", "ريال": "SAR",
}

_AMOUNT = r"(?P<amount>\d[\d,]*(?:\.\d+)?)"
_QTY = r"(?P<qty>\d[\d,]*(?:\.\d+)?)"
_CURRENCY = (
    r"(?:\s*(?P<cur>egp|le|usd|eur|sar|جنيهات|جنيه|دولار|يورو|ريال|ج|\$)"
    r"(?!\w)(?:\s+مصري)?)?"
)
_TAIL = r"\s*[.,!؟،]?\s*$"


def _parse_decimal(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.replace(",", ""))
    except InvalidOperation:
        return None


def _money_amount(raw: str) -> Decimal | None:
    """A money amount: > 0, at most 2 decimals, at most 14 digits."""
    value = _parse_decimal(raw)
    if value is None or value <= 0:
        return None
    if -value.as_tuple().exponent > 2 or value >= Decimal(10) ** 14:
        return None
    return value


def _price_amount(raw: str) -> Decimal | None:
    """A product price: >= 0, at most 2 decimals, at most 14 digits."""
    value = _parse_decimal(raw)
    if value is None or value < 0:
        return None
    if -value.as_tuple().exponent > 2 or value >= Decimal(10) ** 14:
        return None
    return value


def _quantity(raw: str) -> Decimal | None:
    """A stock quantity: > 0, at most 3 decimals."""
    value = _parse_decimal(raw)
    if value is None or value <= 0:
        return None
    if -value.as_tuple().exponent > 3:
        return None
    return value


def _currency_of(match: re.Match, default: str) -> str:
    raw = match.group("cur")
    if not raw:
        return default
    return _CURRENCY_WORDS.get(raw.casefold(), default)


# ---------------------------------------------------------------------------
# Names: cleaning and resolution. A name that is only a pattern keyword
# ("for", "فاتوره", ...) is not a name — the request did not name anyone.
# ---------------------------------------------------------------------------

_NAME_STOPWORDS = {
    "for", "a", "an", "the", "new", "product", "customer", "supplier",
    "invoice", "named", "called", "فاتوره", "منتج", "عميل", "مورد",
    "باسم", "اسمه", "بسعر", "سعر",
}
_POLITENESS_TAIL = re.compile(
    r"\s*(?:please|من\s+فضلك|لو\s+سمحت)\s*[.,!؟،]?\s*$", re.IGNORECASE
)


def _clean_name(raw: str) -> str | None:
    """Clean a captured name; None when nothing plausible was named."""
    name = raw.strip().strip("\"'«»").strip()
    name = re.sub(r"[.,!؟،;:]+$", "", name).strip()
    name = _POLITENESS_TAIL.sub("", name).strip()
    name = re.sub(r"[.,!؟،;:]+$", "", name).strip()
    # A trailing "for <number>" fragment is a payment-ish clause, never
    # part of a name ("Create a customer named Ahmed for 250 EGP" names
    # Ahmed). A clause without a number ("Food for Thought") is left
    # alone — the proposal card shows the exact name for review.
    name = re.sub(r"\s+(?:for|with|from|ب)\s*\d.*$", "", name, flags=re.IGNORECASE).strip()
    if not name or len(name) > 160:
        return None
    if name.isdigit():
        return None
    if _fold_name(name) in _NAME_STOPWORDS:
        return None
    return name


def _clean_category(raw: str) -> str | None:
    """Clean a captured expense category phrase."""
    category = raw.strip()
    category = re.sub(r"[.,!؟،;:]+$", "", category).strip()
    if category.startswith("على ") or category.startswith("علي "):
        category = category[3:].strip()
    if category.startswith("لل"):
        category = category[2:].strip()
    category = re.sub(r"[.,!؟،;:]+$", "", category).strip()
    if not category or len(category) > 80:
        return None
    return category


def _clean_number(raw: str) -> str | None:
    number = raw.strip().lstrip("#").strip()
    number = re.sub(r"[.,!؟،;:]+$", "", number).strip()
    if not number or len(number) > 64:
        return None
    return number


def _token_variants(token: str) -> set[str]:
    """A token plus its English singular ("cables" also matches "cable")."""
    variants = {token}
    if token.endswith("s") and len(token) > 3:
        variants.add(token[:-1])
    return variants


def _resolve_by_name(rows: list, query: str) -> tuple[str, list]:
    """Resolve a name against in-memory rows (each has ``.name``).

    Returns ("one", [row]) on an exact full-name match or a unique
    one-token match, ("many", rows) when one token matches several
    rows, ("none", []) otherwise. Never guesses.
    """
    folded = _fold_name(query)
    variants = [folded]
    if folded.startswith("ل") and len(folded) > 1:
        # Attached preposition: "لاحمد" is "ل" + "احمد".
        variants.append(folded[1:])
    for variant in variants:
        exact = [row for row in rows if _fold_name(row.name) == variant]
        if exact:
            return "one", exact[:1]
    query_tokens = set()
    for variant in variants:
        tokens = variant.split()
        if len(tokens) == 1:
            query_tokens.update(_token_variants(tokens[0]))
    if query_tokens:
        matched = []
        for row in rows:
            row_tokens: set[str] = set()
            for token in _fold_name(row.name).split():
                row_tokens.update(_token_variants(token))
            if row_tokens & query_tokens:
                matched.append(row)
        if len(matched) == 1:
            return "one", matched
        if len(matched) > 1:
            return "many", matched
    return "none", []


def _resolve_customer(session: Session, business_id: UUID, query: str):
    rows = session.scalars(
        select(Customer).where(
            Customer.business_id == business_id, Customer.is_active.is_(True)
        )
    ).all()
    return _resolve_by_name(rows, query)


def _resolve_product(session: Session, business_id: UUID, query: str):
    rows = session.scalars(
        select(Product).where(
            Product.business_id == business_id, Product.is_active.is_(True)
        )
    ).all()
    return _resolve_by_name(rows, query)


def _find_invoice(session: Session, business_id: UUID, number: str):
    """Find an invoice by number: exact first, then case-insensitive."""
    invoice = session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id, Invoice.invoice_number == number
        )
    ).first()
    if invoice is not None:
        return invoice
    return session.scalars(
        select(Invoice).where(
            Invoice.business_id == business_id,
            func.lower(Invoice.invoice_number) == number.casefold(),
        )
    ).first()


def _resolve_supplier(session: Session, business_id: UUID, query: str):
    rows = session.scalars(
        select(Supplier).where(
            Supplier.business_id == business_id, Supplier.is_active.is_(True)
        )
    ).all()
    return _resolve_by_name(rows, query)


def _find_purchase_order(session: Session, business_id: UUID, number: str):
    """Find a purchase order by number: exact first, then case-insensitive."""
    order = session.scalars(
        select(PurchaseOrder).where(
            PurchaseOrder.business_id == business_id,
            PurchaseOrder.order_number == number,
        )
    ).first()
    if order is not None:
        return order
    return session.scalars(
        select(PurchaseOrder).where(
            PurchaseOrder.business_id == business_id,
            func.lower(PurchaseOrder.order_number) == number.casefold(),
        )
    ).first()


def _invoice_lines(session: Session, business_id: UUID, invoice_id: UUID) -> list:
    """An invoice's lines in stable (creation) order."""
    return list(session.scalars(
        select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice_id,
            InvoiceLine.business_id == business_id,
        ).order_by(InvoiceLine.id)
    ).all())


def _line_display_rows(session: Session, business_id: UUID, lines: list) -> list:
    """Pseudo-rows (``.name`` / ``.line``) for resolving a name against
    an invoice's lines: the product's name when the line is linked to
    a product, else the line's own description snapshot."""
    product_ids = {line.product_id for line in lines if line.product_id is not None}
    products = {}
    if product_ids:
        products = {
            product.id: product
            for product in session.scalars(
                select(Product).where(
                    Product.business_id == business_id,
                    Product.id.in_(product_ids),
                )
            ).all()
        }
    rows = []
    for line in lines:
        product = products.get(line.product_id) if line.product_id else None
        rows.append(SimpleNamespace(
            name=product.name if product is not None else line.description,
            line=line,
        ))
    return rows


def _approved_returned(session: Session, business_id: UUID, line_id: UUID) -> Decimal:
    """Quantity already returned for one invoice line by APPROVED
    returns — the same remainder rule post_sales_return enforces."""
    total = session.scalar(
        select(func.coalesce(func.sum(SalesReturnLine.quantity), 0))
        .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
        .where(
            SalesReturnLine.invoice_line_id == line_id,
            SalesReturn.business_id == business_id,
            SalesReturn.status == "approved",
        )
    )
    return Decimal(str(total or 0))


def _open_invoice_counts(session: Session, business_id: UUID, customer_ids: list[UUID]) -> dict[UUID, int]:
    rows = session.execute(
        select(Invoice.customer_id, func.count()).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.customer_id.in_(customer_ids),
        ).group_by(Invoice.customer_id)
    ).all()
    return {customer_id: count for customer_id, count in rows}


# ---------------------------------------------------------------------------
# Answers: clarifications, honest no-guess statements, draft confirmations.
# ---------------------------------------------------------------------------

@dataclass
class IntentResult:
    kind: Literal["proposal", "clarify", "honest", "none"]
    action: str | None = None
    payload: dict | None = None
    answer: str | None = None


_ACTION_LABELS = {
    "customer.create": ("إنشاء عميل", "creating a customer"),
    "supplier.create": ("إنشاء مورّد", "creating a supplier"),
    "product.create": ("إنشاء منتج", "creating a product"),
    "customer.update": ("تعديل بيانات عميل", "updating a customer"),
    "invoice.create": ("إنشاء فاتورة مسودة", "creating a draft invoice"),
    "invoice.duplicate": ("نسخ فاتورة كمسودة", "duplicating an invoice as a draft"),
    "invoice.update_draft": ("تعديل فاتورة مسودة", "editing a draft invoice"),
    "payment.record": ("تسجيل دفعة", "recording a payment"),
    "expense.create": ("تسجيل مصروف", "recording an expense"),
    "stock.movement": ("حركة مخزون", "a stock movement"),
    "purchase_order.create": ("إنشاء أمر شراء مسودة", "creating a draft purchase order"),
    "purchase_order.duplicate": ("نسخ أمر شراء", "duplicating a purchase order"),
    "sales_return.create": ("إنشاء مرتجع مبيعات", "creating a sales return"),
}


def draft_answer(action: str, *, arabic: bool, requires_second_approval: bool) -> str:
    """The chat answer that accompanies a created proposal draft."""
    label_ar, label_en = _ACTION_LABELS.get(action, ("تنفيذ إجراء", "taking an action"))
    if arabic:
        answer = f"جهّزت مسودة {label_ar} — راجعها في الكارت قبل ما تتنفذ."
        if requires_second_approval:
            answer += " دي محتاجة تأكيد المالك الأول."
        return answer
    answer = f"I've prepared a draft for {label_en} — review it in the card before it runs."
    if requires_second_approval:
        answer += " This one needs the owner's confirmation first."
    return answer


def owner_needed_answer(*, arabic: bool) -> str:
    """A staff caller asked for an owner-only action: say so honestly."""
    if arabic:
        return (
            "الإجراء ده من صلاحيات المالك بس — مقدرتش أجهّز المسودة دي. "
            "المالك يقدر يطلبها مني أو ينفذها من التطبيق."
        )
    return (
        "That action is owner-only — I couldn't prepare this draft. "
        "The owner can ask me for it or do it in the app."
    )


def _ambiguous_answer(kind: str, query: str, options: list[str], *, arabic: bool) -> str:
    count = len(options)
    if arabic:
        if kind == "customer":
            noun = "عميلين" if count == 2 else f"{count} عملاء"
            what = "عميل"
        elif kind == "supplier":
            noun = "موردين" if count == 2 else f"{count} موردين"
            what = "مورد"
        else:
            noun = "منتجين" if count == 2 else f"{count} منتجات"
            what = "منتج"
        joined = " و ".join(options) if count == 2 else "، ".join(options)
        return f"عندك {noun} باسم {query}: {joined} — أنهي {what} تقصد؟"
    noun = {"customer": "customers", "supplier": "suppliers"}.get(kind, "products")
    return (
        f"There are {count} {noun} named {query}: {', '.join(options)} — "
        "which one do you mean?"
    )


def _customer_option(customer: Customer, open_count: int, *, arabic: bool) -> str:
    if arabic:
        if open_count == 0:
            suffix = "مفيش فواتير مفتوحه عليه"
        elif open_count == 1:
            suffix = "فاتوره واحده مفتوحه"
        elif open_count == 2:
            suffix = "فاتورتين مفتوحتين"
        else:
            suffix = f"{open_count} فواتير مفتوحه"
        return f"{customer.name} ({suffix})"
    if open_count == 0:
        suffix = "no open invoices"
    elif open_count == 1:
        suffix = "1 open invoice"
    else:
        suffix = f"{open_count} open invoices"
    return f"{customer.name} ({suffix})"


def _product_option(product: Product, *, arabic: bool) -> str:
    price = str(product.unit_price)
    if arabic:
        return f"{product.name} (سعره {price})"
    return f"{product.name} (price {price})"


def _missing_customer_answer(*, arabic: bool) -> str:
    if arabic:
        return "مش لاقي عميل بالاسم ده — اتأكد من الاسم أو أنشئ العميل الأول."
    return "I couldn't find a customer with that name — check the spelling or create the customer first."


def _missing_product_answer(*, arabic: bool) -> str:
    if arabic:
        return "مش لاقي منتج بالاسم ده — اتأكد من الاسم أو أنشئ المنتج الأول."
    return "I couldn't find a product with that name — check the spelling or create the product first."


def _missing_invoice_answer(*, arabic: bool) -> str:
    if arabic:
        return "مش لاقي فاتورة بالرقم ده — اتأكد من الرقم."
    return "I couldn't find an invoice with that number — check the number."


def _missing_supplier_answer(*, arabic: bool) -> str:
    if arabic:
        return "مش لاقي مورد بالاسم ده — اتأكد من الاسم أو أنشئ المورد الأول."
    return "I couldn't find a supplier with that name — check the spelling or create the supplier first."


def _missing_order_answer(*, arabic: bool) -> str:
    if arabic:
        return "مش لاقي أمر شراء بالرقم ده — اتأكد من الرقم."
    return "I couldn't find a purchase order with that number — check the number."


def _supplier_clarify(query: str, rows: list, *, arabic: bool) -> IntentResult:
    options = [row.name for row in rows]
    return IntentResult(
        kind="clarify",
        answer=_ambiguous_answer("supplier", query, options, arabic=arabic),
    )


def _line_clarify(number: str, query: str, rows: list, *, arabic: bool) -> IntentResult:
    """Ambiguity between LINES of one document (returns / draft edits)."""
    options = [
        f"{row.name} ({_fmt_qty(row.line.quantity)} × {row.line.unit_price})"
        for row in rows
    ]
    if arabic:
        joined = "، ".join(options)
        answer = (
            f"فيه أكتر من سطر باسم {query} في الفاتورة {number}: {joined} — "
            "أنهي سطر تقصد؟ حدّد بالسعر أو الكمية."
        )
    else:
        answer = (
            f"More than one line named {query} on invoice {number}: "
            f"{', '.join(options)} — which line do you mean? "
            "Name it by its price or quantity."
        )
    return IntentResult(kind="clarify", answer=answer)


# ---------------------------------------------------------------------------
# Patterns. All run on the lightly-folded text (digits folded, alef/ة
# folded, case preserved) with re.IGNORECASE; names and numbers are
# sliced out of the ORIGINAL message via the index map.
# ---------------------------------------------------------------------------

_CUSTOMER_CREATE = (
    re.compile(
        r"(?:please\s+)?(?:create|add|register)\s+(?:a\s+|an\s+|the\s+)?"
        r"(?:new\s+)?customer\s+(?:named\s+|called\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:انشئ|انشاء|اضف|ضيف|سجل)\s+(?:عميل|زبون)(?:\s+جديد)?\s+"
        r"(?:باسم\s+|اسمه\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:عميل|زبون)\s+جديد\s+(?:باسم\s+|اسمه\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
)
_CUSTOMER_CREATE_NO_NAME = (
    re.compile(
        r"(?:please\s+)?(?:create|add|register)\s+(?:a\s+|an\s+|the\s+)?"
        r"(?:new\s+)?customer\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"(?:انشئ|انشاء|اضف|ضيف|سجل)\s+(?:عميل|زبون)(?:\s+جديد)?\s*$", re.IGNORECASE),
    re.compile(r"(?:عميل|زبون)\s+جديد\s*$", re.IGNORECASE),
)
_SUPPLIER_CREATE = (
    re.compile(
        r"(?:please\s+)?(?:create|add|register)\s+(?:a\s+|an\s+|the\s+)?"
        r"(?:new\s+)?supplier\s+(?:named\s+|called\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:انشئ|انشاء|اضف|ضيف|سجل)\s+(?:مورد)(?:\s+جديد)?\s+"
        r"(?:باسم\s+|اسمه\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:مورد)\s+جديد\s+(?:باسم\s+|اسمه\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
)
_SUPPLIER_CREATE_NO_NAME = (
    re.compile(
        r"(?:please\s+)?(?:create|add|register)\s+(?:a\s+|an\s+|the\s+)?"
        r"(?:new\s+)?supplier\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"(?:انشئ|انشاء|اضف|ضيف|سجل)\s+(?:مورد)(?:\s+جديد)?\s*$", re.IGNORECASE),
    re.compile(r"(?:مورد)\s+جديد\s*$", re.IGNORECASE),
)
_PRODUCT_CREATE = (
    re.compile(
        r"(?:please\s+)?(?:create|add)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?"
        r"product\s+(?:named\s+|called\s+)?(?P<name>.+?)"
        r"(?:\s+(?:for|at|priced\s+at|price|with\s+price))?\s*"
        + _AMOUNT + _CURRENCY + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:انشئ|انشاء|اضف|ضيف)\s+(?:منتج|صنف)(?:\s+جديد)?\s+(?:باسم\s+)?"
        r"(?P<name>.+?)(?:\s+(?:بسعر|سعر|ثمن|ب))?\s*"
        + _AMOUNT + _CURRENCY + _TAIL,
        re.IGNORECASE,
    ),
)
_PRODUCT_CREATE_NO_PRICE = (
    re.compile(
        r"(?:please\s+)?(?:create|add)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?"
        r"product\s+(?:named\s+|called\s+)?(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:انشئ|انشاء|اضف|ضيف)\s+(?:منتج|صنف)(?:\s+جديد)?\s+(?:باسم\s+)?"
        r"(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
)
_INVOICE_CREATE = (
    re.compile(
        r"(?:please\s+)?(?:create|make|raise)\s+(?:a\s+|an\s+)?(?:new\s+)?"
        r"(?:draft\s+)?invoice\s+(?:number\s+|#\s*)?"
        r"(?P<number>[a-z]{0,4}-?\d+)\s+for\s+(?P<name>.+?)"
        r"(?:\s+for)?\s*" + _AMOUNT + _CURRENCY + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء|حرر|اصدر)\s+(?:فاتوره)(?:\s+مسوده)?\s*"
        r"(?:رقم\s+|#\s*)?(?P<number>[a-z]{0,4}-?\d+)\s+"
        r"(?:للعميل\s+|للزبون\s+|ل\s*)?(?P<name>.+?)"
        r"(?:\s+(?:بمبلغ|ب|مبلغ))?\s*" + _AMOUNT + _CURRENCY + _TAIL,
        re.IGNORECASE,
    ),
)
_INVOICE_CREATE_NO_NUMBER = (
    re.compile(
        r"(?:please\s+)?(?:create|make|raise)\s+(?:a\s+|an\s+)?(?:new\s+)?"
        r"(?:draft\s+)?invoice\s+for\s+(?P<name>.+?)"
        r"(?:\s+for)?\s*" + _AMOUNT + _CURRENCY + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء|حرر|اصدر)\s+(?:فاتوره)(?:\s+مسوده)?\s+"
        r"(?:للعميل\s+|للزبون\s+|ل\s*)?(?P<name>.+?)"
        r"(?:\s+(?:بمبلغ|ب|مبلغ))?\s*" + _AMOUNT + _CURRENCY + _TAIL,
        re.IGNORECASE,
    ),
)
_PAYMENT_INVOICE = (
    re.compile(
        r"(?:please\s+)?(?:record|register|log)\s+(?:a\s+)?payment\s+of\s*"
        + _AMOUNT + _CURRENCY
        + r"\s+(?:on|for|against|towards?)\s+(?:invoice\s+)?"
          r"(?:number\s+|#\s*)?(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:please\s+)?pay\s*" + _AMOUNT + _CURRENCY
        + r"\s+(?:on|for|against)\s+(?:invoice\s+)?"
          r"(?:number\s+|#\s*)?(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:سجل|سدد|ادفع)\s+(?:دفعه|مبلغ)?\s*" + _AMOUNT + _CURRENCY
        + r"\s+(?:على\s+|علي\s+|ل)?(?:فاتوره\s+)?(?:رقم\s+)?"
          r"(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
)
_PAYMENT_CUSTOMER = (
    re.compile(
        r"(?:please\s+)?(?:record|register|log)\s+(?:a\s+)?payment\s+of\s*"
        + _AMOUNT + _CURRENCY + r"\s+from\s+(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:سجل|سدد|ادفع)\s+(?:دفعه|مبلغ)?\s*" + _AMOUNT + _CURRENCY
        + r"\s+(?:من|ل)\s*(?P<name>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
)
_EXPENSE = (
    re.compile(
        r"(?:please\s+)?(?:record|register|log|add)\s+(?:an?\s+)?expense\s+"
        r"(?:of\s+)?" + _AMOUNT + _CURRENCY + r"\s+for\s+(?P<cat>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:سجل|اضف)\s+(?:مصروف|مصاريف)\s*" + _AMOUNT + _CURRENCY
        + r"\s*(?P<cat>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
)
_STOCK_ADD = (
    re.compile(
        r"(?:please\s+)?(?:add|increase|put)\s*" + _QTY
        + r"\s+(?:units?\s+of\s+)?(?P<name>.+?)\s+(?:to|into)\s+"
          r"(?:stock|inventory)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اضف|زود|ضيف)\s*" + _QTY
        + r"\s+(?:وحده\s+|وحدات\s+)?(?P<name>.+?)\s+"
          r"(?:للمخزون|في المخزون|للمخزن|في المخزن)" + _TAIL,
        re.IGNORECASE,
    ),
)
_STOCK_REMOVE = (
    re.compile(
        r"(?:please\s+)?(?:remove|take|deduct)\s*" + _QTY
        + r"\s+(?:units?\s+of\s+)?(?P<name>.+?)\s+from\s+"
          r"(?:stock|inventory)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اخصم|اسحب|شيل|نقص)\s*" + _QTY
        + r"\s+(?:وحده\s+|وحدات\s+)?(?P<name>.+?)\s+من\s+"
          r"(?:المخزون|المخزن)" + _TAIL,
        re.IGNORECASE,
    ),
)

# --- Batch ق-2 patterns ----------------------------------------------------
# Customer update: a head naming the customer, then one or more
# "<field> to <value>" assignments in the tail. The assignments are
# found by scanning the tail (see _CUSTOMER_FIELD_*), so a message may
# change several fields at once; only stated fields enter the patch.
_CUSTOMER_UPDATE_HEAD = (
    re.compile(
        r"^\s*(?:please\s+)?(?:update|change|edit|modify)\s+(?:the\s+)?"
        r"customer\s+(?P<tail>.+?)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"^\s*(?:حدث|عدل|غير)\s+(?:بيانات\s+)?(?:ال)?عميل\s+(?P<tail>.+?)"
        + _TAIL,
        re.IGNORECASE,
    ),
)
_CUSTOMER_FIELD_EN = re.compile(
    r"(?P<field>phone|mobile|email|address|notes?|name)\s*(?:to|:|=)\s*",
    re.IGNORECASE,
)
_CUSTOMER_FIELD_AR = re.compile(
    r"(?:رقم\s+)?(?P<field>(?:ال)?تليفون|(?:ال)?هاتف|(?:ال)?موبايل|"
    r"(?:ال)?ايميل|(?:ال)?بريد(?:\s+الكتروني)?|(?:ال)?عنوان|"
    r"(?:ال)?ملاحظات|(?:ال)?اسم)\s*(?:الى|الي|:|=)\s*",
    re.IGNORECASE,
)
# Single-field fast paths: the English possessive ("Update Layla
# Hassan's phone to …") and the Arabic field-first order ("غيّر عنوان
# العميل … الى …"). A possessive field update can only lawfully be a
# customer update here — supplier/product updates are forbidden.
_CUSTOMER_UPDATE_POSSESSIVE_EN = re.compile(
    r"^\s*(?:please\s+)?(?:update|change|edit|modify|set)\s+"
    r"(?:the\s+)?(?:customer\s+)?(?P<name>.+?)'s\s+"
    r"(?P<field>phone|mobile|email|address|notes?|name)\s*(?:to|:|=)\s*"
    r"(?P<value>.+?)" + _TAIL,
    re.IGNORECASE,
)
_CUSTOMER_UPDATE_FIELD_FIRST_AR = re.compile(
    r"^\s*(?:حدث|عدل|غير)\s+(?:رقم\s+)?"
    r"(?P<field>(?:ال)?تليفون|(?:ال)?هاتف|(?:ال)?موبايل|(?:ال)?ايميل|"
    r"(?:ال)?بريد(?:\s+الكتروني)?|(?:ال)?عنوان|(?:ال)?ملاحظات|"
    r"(?:ال)?اسم)\s+(?:ال)?عميل\s+(?P<name>.+?)\s+"
    r"(?:الى|الي|:|=)\s*(?P<value>.+?)" + _TAIL,
    re.IGNORECASE,
)
_CUSTOMER_FIELD_KEYS = {
    "phone": "phone", "mobile": "phone", "تليفون": "phone",
    "هاتف": "phone", "موبايل": "phone", "التليفون": "phone",
    "الهاتف": "phone", "الموبايل": "phone",
    "email": "email", "ايميل": "email", "بريد": "email",
    "بريد الكتروني": "email", "الايميل": "email", "البريد": "email",
    "address": "address", "عنوان": "address", "العنوان": "address",
    "note": "notes", "notes": "notes", "ملاحظات": "notes",
    "الملاحظات": "notes",
    "name": "name", "اسم": "name", "الاسم": "name",
}
# The CustomerPatch length caps — a longer stated value can never
# validate, so it is a clarification, not a proposal.
_CUSTOMER_FIELD_CAPS = {
    "name": 160, "email": 254, "phone": 32, "address": 500, "notes": 1000,
}

_INVOICE_DUPLICATE = (
    re.compile(
        r"(?:please\s+)?(?:duplicate|copy|clone)\s+(?:the\s+)?invoice\s+"
        r"(?:number\s+|#\s*)?(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:please\s+)?(?:make|create)\s+(?:a\s+)?(?:copy|duplicate)\s+of\s+"
        r"(?:the\s+)?invoice\s+(?:number\s+|#\s*)?(?P<number>[a-z]{0,4}-?\d+)"
        + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:انسخ|كرر)\s+(?:ال)?فاتوره\s+(?:رقم\s+)?"
        r"(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء)\s+نسخه\s+(?:من\s+)?(?:ال)?فاتوره\s+"
        r"(?:رقم\s+)?(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
)

# Draft edit: a head naming the draft, then change clauses separated
# by commas (see _split_segments). One clause = one change.
_INVOICE_EDIT_HEAD = (
    re.compile(
        r"(?:please\s+)?(?:edit|update|change|modify)\s+(?:the\s+)?"
        r"(?:draft\s+)?invoice\s+(?:number\s+|#\s*)?"
        r"(?P<number>[a-z]{0,4}-?\d+)\s*[:;,]\s*(?P<changes>.+?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:عدل|غير|حدث)\s+(?:مسوده\s+)?(?:ال)?فاتوره(?:\s+مسوده)?\s+"
        r"(?:رقم\s+)?(?P<number>[a-z]{0,4}-?\d+)\s*[:;,]\s*"
        r"(?P<changes>.+?)\s*$",
        re.IGNORECASE,
    ),
)
_EDIT_DISCOUNT = (
    re.compile(
        r"(?:set\s+)?(?:the\s+)?discount\s*(?:to|=)?\s*"
        r"(?P<rate>\d+(?:\.\d+)?)\s*%?",
        re.IGNORECASE,
    ),
    re.compile(r"(?P<rate>\d+(?:\.\d+)?)\s*%\s*discount", re.IGNORECASE),
    re.compile(r"خصم\s*(?P<rate>\d+(?:\.\d+)?)\s*(?:%|٪|في\s+الميه)?", re.IGNORECASE),
)
_EDIT_TAX = (
    re.compile(
        r"(?:set\s+)?(?:the\s+)?tax\s*(?:to|=)?\s*"
        r"(?P<rate>\d+(?:\.\d+)?)\s*%?",
        re.IGNORECASE,
    ),
    re.compile(r"(?P<rate>\d+(?:\.\d+)?)\s*%\s*tax", re.IGNORECASE),
    re.compile(r"ضريبه\s*(?P<rate>\d+(?:\.\d+)?)\s*(?:%|٪|في\s+الميه)?", re.IGNORECASE),
)
_EDIT_CUSTOMER = (
    re.compile(
        r"(?:change\s+)?(?:the\s+)?customer\s+to\s+(?P<name>.+)", re.IGNORECASE
    ),
    re.compile(r"(?:غير\s+)?(?:ال)?عميل\s+(?:ل|الى|الي)\s*(?P<name>.+)", re.IGNORECASE),
)
_EDIT_REMOVE = (
    re.compile(
        r"(?:remove|delete|drop)\s+(?:the\s+)?(?:line\s+)?(?P<name>.+)",
        re.IGNORECASE,
    ),
    re.compile(r"(?:احذف|شيل|امسح)\s+(?:سطر\s+)?(?P<name>.+)", re.IGNORECASE),
)
_EDIT_ADD = (
    re.compile(
        r"(?:add|insert)\s*" + _QTY
        + r"\s+(?:units?\s+of\s+)?(?P<name>.+?)"
          r"(?:\s+(?:at|@)\s*(?P<price>\d[\d,]*(?:\.\d+)?))?",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اضف|ضيف|زود)\s*" + _QTY
        + r"\s+(?:وحده\s+|وحدات\s+)?(?P<name>.+?)"
          r"(?:\s+(?:بسعر|ب)\s*(?P<price>\d[\d,]*(?:\.\d+)?))?",
        re.IGNORECASE,
    ),
)
_EDIT_QTY = (
    re.compile(
        r"(?:set|change)\s+(?:the\s+)?quantity\s+of\s+(?P<name>.+?)\s+to\s*"
        + _QTY,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<name>.+?)\s+(?:quantity|qty)\s*(?:to|=)\s*" + _QTY,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:كميه|عدد)\s+(?P<name>.+?)\s+(?:ل|الى|الي)\s*" + _QTY,
        re.IGNORECASE,
    ),
)
_EDIT_PRICE = (
    re.compile(
        r"(?P<name>.+?)\s+(?:unit\s+)?price\s*(?:to|=)\s*"
        r"(?P<price>\d[\d,]*(?:\.\d+)?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"سعر\s+(?P<name>.+?)\s+(?:ل|الى|الي)\s*"
        r"(?P<price>\d[\d,]*(?:\.\d+)?)",
        re.IGNORECASE,
    ),
)

_PO_CREATE = (
    re.compile(
        r"(?:please\s+)?(?:create|make|raise)\s+(?:a\s+|an\s+)?(?:new\s+)?"
        r"(?:purchase\s+order|po)\s+(?:number\s+|#\s*)?"
        r"(?P<number>[a-z]{0,4}-?\d+)\s+(?:from|for)\s+(?:the\s+)?"
        r"(?:supplier\s+)?(?P<name>.+?)\s*[:;,]\s*(?P<lines>.+?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء)\s+(?:امر\s+شراء|طلب\s+شراء)\s+"
        r"(?:رقم\s+)?(?P<number>[a-z]{0,4}-?\d+)\s+(?:من\s+)?(?:ال)?مورد\s+"
        r"(?P<name>.+?)\s*[:;,]\s*(?P<lines>.+?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء)\s+(?:امر\s+شراء|طلب\s+شراء)\s+"
        r"(?:رقم\s+)?(?P<number>[a-z]{0,4}-?\d+)\s+من\s+"
        r"(?P<name>.+?)\s*[:;,]\s*(?P<lines>.+?)\s*$",
        re.IGNORECASE,
    ),
)
_PO_CREATE_NO_NUMBER = (
    re.compile(
        r"(?:please\s+)?(?:create|make|raise)\s+(?:a\s+|an\s+)?(?:new\s+)?"
        r"(?:purchase\s+order|po)\s+(?:from|for)\s+",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء)\s+(?:امر\s+شراء|طلب\s+شراء)\s+(?:من\s+|ل)",
        re.IGNORECASE,
    ),
)
_PO_DUPLICATE = (
    re.compile(
        r"(?:please\s+)?(?:duplicate|copy|clone)\s+(?:the\s+)?"
        r"(?:purchase\s+order|po)\s+(?:number\s+|#\s*)?"
        r"(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:انسخ|كرر)\s+(?:امر\s+شراء|طلب\s+شراء)\s+(?:رقم\s+)?"
        r"(?P<number>[a-z]{0,4}-?\d+)" + _TAIL,
        re.IGNORECASE,
    ),
)

_RETURN_CREATE = (
    re.compile(
        r"(?:please\s+)?(?:create|make|record|register)\s+(?:a\s+)?"
        r"(?:sales\s+)?return\s+(?:for|on|against)\s+(?:the\s+)?invoice\s+"
        r"(?:number\s+|#\s*)?(?P<number>[a-z]{0,4}-?\d+)\s*[:;,]\s*"
        r"(?P<lines>.+?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:اعمل|انشئ|انشاء|سجل)\s+(?:مرتجع|استرجاع)\s*(?:مبيعات\s+)?"
        r"(?:على\s+|علي\s+)?(?:ال)?فاتوره\s+(?:رقم\s+)?"
        r"(?P<number>[a-z]{0,4}-?\d+)\s*[:;,]\s*(?P<lines>.+?)\s*$",
        re.IGNORECASE,
    ),
)
_RETURN_REASON = re.compile(
    r"(?:^|[,،;؛]\s*)(?:reason\s*:\s*|السبب\s*:\s*)(?P<reason>.+?)\s*$",
    re.IGNORECASE,
)

# Line segments (purchase orders, returns, draft-edit clauses):
# separated by commas / semicolons, or by " and " before a quantity.
_SEGMENT_SPLIT = re.compile(r"\s*[,،;؛]\s*|\s+and\s+(?=\d)")
_PO_SEGMENT = (
    re.compile(
        r"(?P<qty>\d[\d,]*(?:\.\d+)?)\s*(?:units?\s+of\s+|x\s+)?"
        r"(?P<name>.+?)(?:\s+(?:at|@)\s*(?P<price>\d[\d,]*(?:\.\d+)?))?",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<name>.+?)\s+x\s*(?P<qty>\d[\d,]*(?:\.\d+)?)"
        r"(?:\s+(?:at|@)\s*(?P<price>\d[\d,]*(?:\.\d+)?))?",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<qty>\d[\d,]*(?:\.\d+)?)\s*(?:وحده\s+|وحدات\s+)?"
        r"(?P<name>.+?)(?:\s+(?:بسعر|ب)\s*(?P<price>\d[\d,]*(?:\.\d+)?))?",
        re.IGNORECASE,
    ),
)
_RETURN_SEGMENT = (
    re.compile(
        r"(?P<qty>\d[\d,]*(?:\.\d+)?)\s*(?:units?\s+of\s+)?(?P<name>.+?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<name>.+?)\s+x\s*(?P<qty>\d[\d,]*(?:\.\d+)?)", re.IGNORECASE
    ),
    re.compile(
        r"(?P<qty>\d[\d,]*(?:\.\d+)?)\s*(?:وحده\s+|وحدات\s+)?(?P<name>.+?)",
        re.IGNORECASE,
    ),
)


# ---------------------------------------------------------------------------
# Extraction.
# ---------------------------------------------------------------------------

def _first_match(patterns, folded: str):
    for pattern in patterns:
        matched = pattern.search(folded)
        if matched is not None:
            return matched
    return None


def _matched_name(match: re.Match, message: str, index_map: list[int]) -> str | None:
    start, end = match.span("name")
    return _clean_name(_raw_slice(message, index_map, start, end))


def _matched_number(match: re.Match, message: str, index_map: list[int]) -> str | None:
    start, end = match.span("number")
    return _clean_number(_raw_slice(message, index_map, start, end))


def _customer_clarify(
    session: Session, business_id: UUID, query: str, rows: list, *, arabic: bool
) -> IntentResult:
    counts = _open_invoice_counts(session, business_id, [row.id for row in rows])
    options = [
        _customer_option(row, counts.get(row.id, 0), arabic=arabic) for row in rows
    ]
    return IntentResult(
        kind="clarify",
        answer=_ambiguous_answer("customer", query, options, arabic=arabic),
    )


def _product_clarify(rows: list, query: str, *, arabic: bool) -> IntentResult:
    options = [_product_option(row, arabic=arabic) for row in rows]
    return IntentResult(
        kind="clarify",
        answer=_ambiguous_answer("product", query, options, arabic=arabic),
    )


# ---------------------------------------------------------------------------
# Batch ق-2 extraction helpers. Each returns None when its head does not
# match at all (the caller falls through to the next family), else an
# IntentResult — a proposal draft, ONE clarification, or an honest
# no-guess answer, on the same discipline as the Slice 3 families.
# ---------------------------------------------------------------------------

def _full_match(patterns, text: str):
    for pattern in patterns:
        matched = pattern.fullmatch(text)
        if matched is not None:
            return matched
    return None


def _segment_full_match(patterns, segment: str):
    """Full-match a line segment, trying the Arabic-literal patterns
    first when the segment itself contains Arabic script: the loose
    English segment shape (quantity + free name) would otherwise
    swallow an Arabic price marker («بسعر») into the product name."""
    if _ARABIC_SCRIPT.search(segment):
        arabic_first = [
            pattern for pattern in patterns
            if any("؀" <= char <= "ۿ" for char in pattern.pattern)
        ]
        rest = [pattern for pattern in patterns if pattern not in arabic_first]
        matched = _full_match(tuple(arabic_first + rest), segment)
        if matched is not None:
            return matched
    return _full_match(patterns, segment)


def _fmt_qty(value: Decimal) -> str:
    """A quantity for an answer: 10.000 -> '10', 2.500 -> '2.5'."""
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _split_segments(text: str) -> list[tuple[str, int]]:
    """Split a folded list text into (segment, folded-offset) pairs."""
    parts: list[tuple[str, int]] = []
    start = 0
    for separator in _SEGMENT_SPLIT.finditer(text):
        parts.append((text[start:separator.start()], start))
        start = separator.end()
    parts.append((text[start:], start))
    out = []
    for part, offset in parts:
        stripped = part.strip()
        if stripped:
            out.append((stripped, offset + (len(part) - len(part.lstrip()))))
    return out


def _group_raw(
    match: re.Match, group: str, message: str, index_map: list[int], base: int = 0
) -> str:
    """Slice one match group out of the ORIGINAL message."""
    start, end = match.span(group)
    if start < 0:
        return ""
    return _raw_slice(message, index_map, base + start, base + end)


def _clean_value(raw: str) -> str:
    """Clean a stated field value (customer update patch values)."""
    value = raw.strip().strip("\"'«»").strip()
    value = re.sub(r"\s*(?:,|،|;|؛|\band\b|و)\s*$", "", value).strip()
    value = _POLITENESS_TAIL.sub("", value).strip()
    value = re.sub(r"[.,!؟،;:]+$", "", value).strip()
    return value


def _clean_update_name(raw: str) -> str | None:
    """Clean the customer name in an update request (may carry 's)."""
    name = raw.strip().strip("\"'«»").strip()
    name = re.sub(r"[.,!؟،;:]+$", "", name).strip()
    name = re.sub(r"(?:'s|’s)$", "", name).strip()
    name = re.sub(r"[.,!؟،;:]+$", "", name).strip()
    if not name or len(name) > 160 or name.isdigit():
        return None
    if _fold_name(name) in _NAME_STOPWORDS:
        return None
    return name


def _extract_customer_update(
    session: Session, business_id: UUID, message: str,
    folded: str, index_map: list[int], arabic: bool,
) -> IntentResult | None:
    fast = _first_match(
        (_CUSTOMER_UPDATE_POSSESSIVE_EN, _CUSTOMER_UPDATE_FIELD_FIRST_AR),
        folded,
    )
    if fast is not None:
        name = _clean_update_name(_group_raw(fast, "name", message, index_map))
        field_word = " ".join(fast.group("field").casefold().split())
        key = _CUSTOMER_FIELD_KEYS.get(field_word)
        value = _clean_value(_group_raw(fast, "value", message, index_map))
        if name is not None and key is not None:
            if not value:
                answer = (
                    f"القيمة الجديدة لـ{field_word} ايه؟"
                    if arabic else f"What's the new {field_word}?"
                )
                return IntentResult(kind="clarify", answer=answer)
            if len(value) > _CUSTOMER_FIELD_CAPS[key]:
                answer = (
                    f"القيمة دي أطول من المسموح بيه لحقل {field_word} — قصّرها وحاول تاني."
                    if arabic else
                    f"That value is longer than the {field_word} field allows — shorten it and try again."
                )
                return IntentResult(kind="clarify", answer=answer)
            status, rows = _resolve_customer(session, business_id, name)
            if status == "many":
                return _customer_clarify(
                    session, business_id, name, rows, arabic=arabic
                )
            if status == "none":
                return IntentResult(
                    kind="honest",
                    answer=_missing_customer_answer(arabic=arabic),
                )
            return IntentResult(
                kind="proposal",
                action="customer.update",
                payload={
                    "customer_id": str(rows[0].id),
                    "patch": {key: value},
                },
            )
    match = _first_match(_CUSTOMER_UPDATE_HEAD, folded)
    if match is None:
        return None
    tail_start, tail_end = match.span("tail")
    tail = folded[tail_start:tail_end]
    field_matches = (
        list(_CUSTOMER_FIELD_EN.finditer(tail))
        + list(_CUSTOMER_FIELD_AR.finditer(tail))
    )
    field_matches.sort(key=lambda item: item.start())
    deduped: list[re.Match] = []
    for item in field_matches:
        if deduped and item.start() < deduped[-1].end():
            continue
        deduped.append(item)
    field_matches = deduped

    if not field_matches:
        # "Update customer X" with no stated change: resolve the name
        # honestly, then ask what to change.
        name = _clean_update_name(
            _raw_slice(message, index_map, tail_start, tail_end)
        )
        if name is None:
            return None
        status, rows = _resolve_customer(session, business_id, name)
        if status == "many":
            return _customer_clarify(session, business_id, name, rows, arabic=arabic)
        if status == "none":
            return IntentResult(
                kind="honest", answer=_missing_customer_answer(arabic=arabic)
            )
        answer = (
            f"ايه التعديل المطلوب لبيانات العميل {name}؟ "
            "(الاسم، التليفون، الإيميل، العنوان، أو ملاحظات)"
            if arabic else
            f"What should I change for customer {name}? "
            "(name, phone, email, address, or notes)"
        )
        return IntentResult(kind="clarify", answer=answer)

    name = _clean_update_name(
        _raw_slice(
            message, index_map, tail_start, tail_start + field_matches[0].start()
        )
    )
    if name is None:
        return None
    patch: dict[str, str] = {}
    for position, field_match in enumerate(field_matches):
        field_word = " ".join(field_match.group("field").casefold().split())
        key = _CUSTOMER_FIELD_KEYS.get(field_word)
        if key is None:
            continue
        value_start = tail_start + field_match.end()
        value_end = tail_start + (
            field_matches[position + 1].start()
            if position + 1 < len(field_matches)
            else len(tail)
        )
        value = _clean_value(
            _raw_slice(message, index_map, value_start, value_end)
        )
        if not value:
            answer = (
                f"القيمة الجديدة لـ{field_word} ايه؟"
                if arabic else f"What's the new {field_word}?"
            )
            return IntentResult(kind="clarify", answer=answer)
        if len(value) > _CUSTOMER_FIELD_CAPS[key]:
            answer = (
                f"القيمة دي أطول من المسموح بيه لحقل {field_word} — قصّرها وحاول تاني."
                if arabic else
                f"That value is longer than the {field_word} field allows — shorten it and try again."
            )
            return IntentResult(kind="clarify", answer=answer)
        patch[key] = value
    if not patch:
        return None
    status, rows = _resolve_customer(session, business_id, name)
    if status == "many":
        return _customer_clarify(session, business_id, name, rows, arabic=arabic)
    if status == "none":
        return IntentResult(
            kind="honest", answer=_missing_customer_answer(arabic=arabic)
        )
    customer = rows[0]
    return IntentResult(
        kind="proposal",
        action="customer.update",
        payload={"customer_id": str(customer.id), "patch": patch},
    )


def _extract_invoice_duplicate(
    session: Session, business_id: UUID, message: str,
    folded: str, index_map: list[int], arabic: bool,
) -> IntentResult | None:
    match = _first_match(_INVOICE_DUPLICATE, folded)
    if match is None:
        return None
    number = _matched_number(match, message, index_map)
    if number is None:
        return None
    invoice = _find_invoice(session, business_id, number)
    if invoice is None:
        return IntentResult(
            kind="honest", answer=_missing_invoice_answer(arabic=arabic)
        )
    if not _invoice_lines(session, business_id, invoice.id):
        answer = (
            f"الفاتورة {number} من غير بنود — مفيش حاجة تتنسخ."
            if arabic else
            f"Invoice {number} has no lines — there is nothing to duplicate."
        )
        return IntentResult(kind="honest", answer=answer)
    return IntentResult(
        kind="proposal",
        action="invoice.duplicate",
        payload={"invoice_id": str(invoice.id)},
    )


def _extract_purchase_order_duplicate(
    session: Session, business_id: UUID, message: str,
    folded: str, index_map: list[int], arabic: bool,
) -> IntentResult | None:
    match = _first_match(_PO_DUPLICATE, folded)
    if match is None:
        return None
    number = _matched_number(match, message, index_map)
    if number is None:
        return None
    order = _find_purchase_order(session, business_id, number)
    if order is None:
        return IntentResult(
            kind="honest", answer=_missing_order_answer(arabic=arabic)
        )
    has_lines = session.scalars(
        select(PurchaseOrderLine.id).where(
            PurchaseOrderLine.purchase_order_id == order.id,
            PurchaseOrderLine.business_id == business_id,
        )
    ).first()
    if has_lines is None:
        answer = (
            f"أمر الشراء {number} من غير بنود — مفيش حاجة تتنسخ."
            if arabic else
            f"Purchase order {number} has no lines — there is nothing to duplicate."
        )
        return IntentResult(kind="honest", answer=answer)
    return IntentResult(
        kind="proposal",
        action="purchase_order.duplicate",
        payload={"order_id": str(order.id)},
    )


def _extract_purchase_order_create(
    session: Session, business_id: UUID, message: str,
    folded: str, index_map: list[int], arabic: bool, business_currency: str,
) -> IntentResult | None:
    match = _first_match(_PO_CREATE, folded)
    if match is None:
        if _first_match(_PO_CREATE_NO_NUMBER, folded) is not None:
            answer = (
                "رقم أمر الشراء ايه؟"
                if arabic else "What purchase order number should it be?"
            )
            return IntentResult(kind="clarify", answer=answer)
        return None
    number = _matched_number(match, message, index_map)
    name = _matched_name(match, message, index_map)
    if number is None or name is None:
        return None
    if _find_purchase_order(session, business_id, number) is not None:
        answer = (
            f"فيه أمر شراء بالرقم {number} موجود أصلًا — اختار رقم تاني."
            if arabic else
            f"A purchase order with number {number} already exists — pick a different number."
        )
        return IntentResult(kind="honest", answer=answer)
    status, rows = _resolve_supplier(session, business_id, name)
    if status == "many":
        return _supplier_clarify(name, rows, arabic=arabic)
    if status == "none":
        return IntentResult(
            kind="honest", answer=_missing_supplier_answer(arabic=arabic)
        )
    supplier = rows[0]
    lines_start, lines_end = match.span("lines")
    segments = _split_segments(folded[lines_start:lines_end])
    if not segments:
        answer = (
            "بنود أمر الشراء ايه؟ اكتبها كده: كمية + صنف + سعر الشراء، "
            "وافصل بينهم بفاصلة."
            if arabic else
            "What are the order lines? Write them as: quantity + product + "
            "unit cost, separated by commas."
        )
        return IntentResult(kind="clarify", answer=answer)
    payload_lines = []
    for segment, offset in segments:
        segment_match = _segment_full_match(_PO_SEGMENT, segment)
        if segment_match is None:
            answer = (
                f"مقدرتش أفهم سطر الشراء ده: «{segment}» — اكتبه كده: "
                "كمية + صنف + سعر الشراء."
                if arabic else
                f"I couldn't parse this order line: “{segment}” — write it "
                "as: quantity + product + unit cost."
            )
            return IntentResult(kind="clarify", answer=answer)
        qty = _quantity(segment_match.group("qty"))
        segment_name = _clean_name(
            _group_raw(
                segment_match, "name", message, index_map,
                base=lines_start + offset,
            )
        )
        if qty is None or segment_name is None:
            answer = (
                f"مقدرتش أفهم سطر الشراء ده: «{segment}» — اكتبه كده: "
                "كمية + صنف + سعر الشراء."
                if arabic else
                f"I couldn't parse this order line: “{segment}” — write it "
                "as: quantity + product + unit cost."
            )
            return IntentResult(kind="clarify", answer=answer)
        status, rows = _resolve_product(session, business_id, segment_name)
        if status == "many":
            return _product_clarify(rows, segment_name, arabic=arabic)
        if status == "none":
            return IntentResult(
                kind="honest", answer=_missing_product_answer(arabic=arabic)
            )
        product = rows[0]
        if not product.is_stock_tracked:
            answer = (
                f"المنتج {product.name} مش متعقّب مخزونيًا — بنود أوامر الشراء "
                "لازم تكون منتجات متعقّبة مخزونيًا."
                if arabic else
                f"{product.name} isn't stock-tracked — purchase order lines "
                "must be stock-tracked products."
            )
            return IntentResult(kind="honest", answer=answer)
        price_raw = segment_match.group("price")
        if price_raw is None:
            # PurchaseOrderInput requires a unit cost per line — there
            # is no honest default (the catalogue price is a SALE
            # price), so ask instead of guessing.
            answer = (
                f"سعر شراء {product.name} كام؟"
                if arabic else f"What unit cost should {product.name} be?"
            )
            return IntentResult(kind="clarify", answer=answer)
        price = _price_amount(price_raw)
        if price is None:
            answer = (
                f"سعر شراء {product.name} مش واضح — اكتبه برقم صريح."
                if arabic else
                f"The unit cost for {product.name} isn't clear — state it as a plain number."
            )
            return IntentResult(kind="clarify", answer=answer)
        payload_lines.append({
            "product_id": str(product.id),
            "quantity": qty,
            "unit_cost": price,
        })
    return IntentResult(
        kind="proposal",
        action="purchase_order.create",
        payload={
            "supplier_id": str(supplier.id),
            "order_number": number,
            "currency_code": business_currency,
            "lines": payload_lines,
        },
    )


def _extract_sales_return(
    session: Session, business_id: UUID, message: str,
    folded: str, index_map: list[int], arabic: bool,
) -> IntentResult | None:
    match = _first_match(_RETURN_CREATE, folded)
    if match is None:
        return None
    number = _matched_number(match, message, index_map)
    if number is None:
        return None
    invoice = _find_invoice(session, business_id, number)
    if invoice is None:
        return IntentResult(
            kind="honest", answer=_missing_invoice_answer(arabic=arabic)
        )
    if invoice.status != "issued":
        answer = (
            f"الفاتورة {number} مش صادرة (حالتها: {invoice.status}) — "
            "المرتجعات بتتسجّل على الفواتير الصادرة بس."
            if arabic else
            f"Invoice {number} isn't issued (status: {invoice.status}) — "
            "returns can only be recorded on issued invoices."
        )
        return IntentResult(kind="honest", answer=answer)
    lines_start, lines_end = match.span("lines")
    lines_folded = folded[lines_start:lines_end]
    reason: str | None = None
    reason_match = _RETURN_REASON.search(lines_folded)
    if reason_match is not None:
        reason = _group_raw(
            reason_match, "reason", message, index_map, base=lines_start
        ).strip()
        reason = re.sub(r"[.,!؟،;:]+$", "", reason).strip() or None
        if reason is not None and len(reason) > 500:
            answer = (
                "سبب المرتجع أطول من المسموح بيه (٥٠٠ حرف كحد أقصى)."
                if arabic else
                "The return reason is longer than the allowed 500 characters."
            )
            return IntentResult(kind="honest", answer=answer)
        lines_folded = lines_folded[:reason_match.start()]
    stored_lines = _invoice_lines(session, business_id, invoice.id)
    if not stored_lines:
        answer = (
            f"الفاتورة {number} من غير بنود — مفيش حاجة تتراجع."
            if arabic else
            f"Invoice {number} has no lines — there is nothing to return."
        )
        return IntentResult(kind="honest", answer=answer)
    rows = _line_display_rows(session, business_id, stored_lines)
    segments = _split_segments(lines_folded)
    if not segments:
        answer = (
            "ايه اللي هيتراجع من الفاتورة؟ اكتبه كده: كمية + صنف، "
            "وافصل بينهم بفاصلة."
            if arabic else
            "What should be returned? Write it as: quantity + product, "
            "separated by commas."
        )
        return IntentResult(kind="clarify", answer=answer)
    payload_lines = []
    claimed: dict[UUID, Decimal] = {}
    for segment, offset in segments:
        segment_match = _segment_full_match(_RETURN_SEGMENT, segment)
        qty = _quantity(segment_match.group("qty")) if segment_match else None
        segment_name = (
            _clean_name(
                _group_raw(
                    segment_match, "name", message, index_map,
                    base=lines_start + offset,
                )
            )
            if segment_match is not None
            else None
        )
        if segment_match is None or qty is None or segment_name is None:
            answer = (
                f"مقدرتش أفهم سطر المرتجع ده: «{segment}» — اكتبه كده: "
                "كمية + صنف."
                if arabic else
                f"I couldn't parse this return line: “{segment}” — write it "
                "as: quantity + product."
            )
            return IntentResult(kind="clarify", answer=answer)
        status, matched = _resolve_by_name(rows, segment_name)
        if status == "many":
            return _line_clarify(number, segment_name, matched, arabic=arabic)
        if status == "none":
            answer = (
                f"الصنف {segment_name} مش موجود في بنود الفاتورة {number}."
                if arabic else
                f"{segment_name} isn't a line on invoice {number}."
            )
            return IntentResult(kind="honest", answer=answer)
        line = matched[0].line
        remaining = (
            line.quantity
            - _approved_returned(session, business_id, line.id)
            - claimed.get(line.id, Decimal(0))
        )
        if qty > remaining:
            answer = (
                f"الكمية المتبقية القابلة للاسترجاع من {segment_name} في "
                f"الفاتورة {number} هي {_fmt_qty(remaining)} بس."
                if arabic else
                f"Only {_fmt_qty(remaining)} of {segment_name} remains "
                f"returnable on invoice {number}."
            )
            return IntentResult(kind="honest", answer=answer)
        claimed[line.id] = claimed.get(line.id, Decimal(0)) + qty
        payload_lines.append({"invoice_line_id": str(line.id), "quantity": qty})
    return IntentResult(
        kind="proposal",
        action="sales_return.create",
        payload={
            "invoice_id": str(invoice.id),
            "reason": reason,
            "lines": payload_lines,
        },
    )


def _extract_invoice_update_draft(
    session: Session, business_id: UUID, message: str,
    folded: str, index_map: list[int], arabic: bool,
) -> IntentResult | None:
    match = _first_match(_INVOICE_EDIT_HEAD, folded)
    if match is None:
        return None
    number = _matched_number(match, message, index_map)
    if number is None:
        return None
    invoice = _find_invoice(session, business_id, number)
    if invoice is None:
        return IntentResult(
            kind="honest", answer=_missing_invoice_answer(arabic=arabic)
        )
    if invoice.status == "void":
        answer = (
            f"الفاتورة {number} ملغية — مش هتتعدّل."
            if arabic else f"Invoice {number} is void — it can't be edited."
        )
        return IntentResult(kind="honest", answer=answer)
    if invoice.status != "draft":
        answer = (
            f"الفاتورة {number} صادرة — التعديل من الشات للمسودات بس؛ "
            "تعديل فاتورة صادرة بيتم من التطبيق بتأكيد المالك."
            if arabic else
            f"Invoice {number} is issued — chat edits cover drafts only; "
            "editing an issued invoice goes through the app with the "
            "owner's confirmation."
        )
        return IntentResult(kind="honest", answer=answer)
    stored_lines = _invoice_lines(session, business_id, invoice.id)
    if not stored_lines:
        answer = (
            f"المسودة {number} من غير بنود — مفيش حاجة تتعدّل."
            if arabic else
            f"Draft {number} has no lines — there is nothing to edit."
        )
        return IntentResult(kind="honest", answer=answer)
    display_rows = _line_display_rows(session, business_id, stored_lines)
    # The working copy the clauses mutate; "display" is the name a
    # clause resolves against (product name, else the description).
    work = [
        {
            "description": line.description,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "product_id": line.product_id,
            "display": row.name,
        }
        for line, row in zip(stored_lines, display_rows)
    ]

    def _resolve_work_line(query: str):
        rows = [
            SimpleNamespace(name=entry["display"], ref=entry) for entry in work
        ]
        status, matched = _resolve_by_name(rows, query)
        return status, [row.ref for row in matched]

    def _clause_clarify(clause: str, base: int) -> IntentResult:
        raw_clause = _raw_slice(
            message, index_map, base, base + len(clause)
        ).strip()
        answer = (
            f"مقدرتش أفهم التعديل ده: «{raw_clause}» — جرّب تصيغه زي: "
            "كمية <صنف> ل <رقم>، أو سعر <صنف> ل <رقم>."
            if arabic else
            f"I couldn't understand this change: “{raw_clause}” — try it "
            "as: <product> quantity to <number>, or <product> price to "
            "<number>."
        )
        return IntentResult(kind="clarify", answer=answer)

    changes_start, changes_end = match.span("changes")
    clauses = _split_segments(folded[changes_start:changes_end])
    if not clauses:
        answer = (
            f"ايه التعديل المطلوب على المسودة {number}؟"
            if arabic else f"What change should I make to draft {number}?"
        )
        return IntentResult(kind="clarify", answer=answer)

    stated_discount: Decimal | None = None
    stated_tax: Decimal | None = None
    new_customer_id = invoice.customer_id
    for clause, offset in clauses:
        base = changes_start + offset
        clause_match = _full_match(_EDIT_DISCOUNT, clause)
        if clause_match is not None:
            rate = _parse_decimal(clause_match.group("rate"))
            if rate is None or rate < 0 or rate > 100:
                answer = (
                    "نسبة الخصم لازم تكون بين ٠ و١٠٠."
                    if arabic else "The discount rate must be between 0 and 100."
                )
                return IntentResult(kind="clarify", answer=answer)
            stated_discount = rate
            continue
        clause_match = _full_match(_EDIT_TAX, clause)
        if clause_match is not None:
            rate = _parse_decimal(clause_match.group("rate"))
            if rate is None or rate < 0 or rate > 100:
                answer = (
                    "نسبة الضريبة لازم تكون بين ٠ و١٠٠."
                    if arabic else "The tax rate must be between 0 and 100."
                )
                return IntentResult(kind="clarify", answer=answer)
            stated_tax = rate
            continue
        clause_match = _full_match(_EDIT_CUSTOMER, clause)
        if clause_match is not None:
            name = _clean_name(_group_raw(clause_match, "name", message, index_map, base=base))
            if name is None:
                return _clause_clarify(clause, base)
            status, rows = _resolve_customer(session, business_id, name)
            if status == "many":
                return _customer_clarify(session, business_id, name, rows, arabic=arabic)
            if status == "none":
                return IntentResult(
                    kind="honest", answer=_missing_customer_answer(arabic=arabic)
                )
            new_customer_id = rows[0].id
            continue
        clause_match = _full_match(_EDIT_REMOVE, clause)
        if clause_match is not None:
            name = _clean_name(_group_raw(clause_match, "name", message, index_map, base=base))
            if name is None:
                return _clause_clarify(clause, base)
            status, matched = _resolve_work_line(name)
            if status == "many":
                pseudo = [
                    SimpleNamespace(
                        name=entry["display"],
                        line=SimpleNamespace(
                            quantity=entry["quantity"],
                            unit_price=entry["unit_price"],
                        ),
                    )
                    for entry in matched
                ]
                return _line_clarify(number, name, pseudo, arabic=arabic)
            if status == "none":
                answer = (
                    f"مفيش سطر باسم {name} في المسودة {number}."
                    if arabic else
                    f"There is no line named {name} on draft {number}."
                )
                return IntentResult(kind="honest", answer=answer)
            work.remove(matched[0])
            continue
        clause_match = _full_match(_EDIT_ADD, clause)
        if clause_match is not None:
            qty = _quantity(clause_match.group("qty"))
            name = _clean_name(_group_raw(clause_match, "name", message, index_map, base=base))
            if qty is None or name is None:
                return _clause_clarify(clause, base)
            status, rows = _resolve_product(session, business_id, name)
            if status == "many":
                return _product_clarify(rows, name, arabic=arabic)
            if status == "none":
                return IntentResult(
                    kind="honest", answer=_missing_product_answer(arabic=arabic)
                )
            product = rows[0]
            price_raw = clause_match.group("price")
            price = _price_amount(price_raw) if price_raw is not None else None
            if price_raw is not None and price is None:
                return _clause_clarify(clause, base)
            work.append({
                "description": product.name,
                "quantity": qty,
                # No stated price: the catalogue price is a stored
                # fact, shown on the proposal card — never a guess.
                "unit_price": price if price is not None else product.unit_price,
                "product_id": product.id,
                "display": product.name,
            })
            continue
        clause_match = _full_match(_EDIT_QTY, clause)
        if clause_match is not None:
            qty = _quantity(clause_match.group("qty"))
            name = _clean_name(_group_raw(clause_match, "name", message, index_map, base=base))
            if qty is None or name is None:
                return _clause_clarify(clause, base)
            status, matched = _resolve_work_line(name)
            if status == "many":
                pseudo = [
                    SimpleNamespace(
                        name=entry["display"],
                        line=SimpleNamespace(
                            quantity=entry["quantity"],
                            unit_price=entry["unit_price"],
                        ),
                    )
                    for entry in matched
                ]
                return _line_clarify(number, name, pseudo, arabic=arabic)
            if status == "none":
                answer = (
                    f"مفيش سطر باسم {name} في المسودة {number}."
                    if arabic else
                    f"There is no line named {name} on draft {number}."
                )
                return IntentResult(kind="honest", answer=answer)
            matched[0]["quantity"] = qty
            continue
        clause_match = _full_match(_EDIT_PRICE, clause)
        if clause_match is not None:
            price = _price_amount(clause_match.group("price"))
            name = _clean_name(_group_raw(clause_match, "name", message, index_map, base=base))
            if price is None or name is None:
                return _clause_clarify(clause, base)
            status, matched = _resolve_work_line(name)
            if status == "many":
                pseudo = [
                    SimpleNamespace(
                        name=entry["display"],
                        line=SimpleNamespace(
                            quantity=entry["quantity"],
                            unit_price=entry["unit_price"],
                        ),
                    )
                    for entry in matched
                ]
                return _line_clarify(number, name, pseudo, arabic=arabic)
            if status == "none":
                answer = (
                    f"مفيش سطر باسم {name} في المسودة {number}."
                    if arabic else
                    f"There is no line named {name} on draft {number}."
                )
                return IntentResult(kind="honest", answer=answer)
            matched[0]["unit_price"] = price
            continue
        return _clause_clarify(clause, base)

    if not work:
        answer = (
            f"المسودة {number} لازم يفضل فيها سطر واحد على الأقل."
            if arabic else
            f"Draft {number} must keep at least one line."
        )
        return IntentResult(kind="honest", answer=answer)
    # The stored draft keeps discount/tax TOTALS, not rates. An
    # unstated rate is recoverable exactly only when its stored total
    # is zero; anything else would silently change the totals.
    discount_rate = stated_discount
    if discount_rate is None:
        discount_rate = Decimal(0) if invoice.discount_total == 0 else None
    tax_rate = stated_tax
    if tax_rate is None:
        tax_rate = Decimal(0) if invoice.tax_total == 0 else None
    if discount_rate is None or tax_rate is None:
        answer = (
            f"المسودة {number} عليها خصم/ضريبة متسجلين كمبالغ في الإجمالي — "
            "التعديل من الشات مش هيقدر ينقل النسب الأصلية بدقة، فعدّلها "
            "من التطبيق عشان الإجماليات ما تتغيرش."
            if arabic else
            f"Draft {number} carries a discount/tax in its totals — chat "
            "can't carry the original rates exactly, so edit it in the "
            "app to keep the totals unchanged."
        )
        return IntentResult(kind="honest", answer=answer)
    update = {
        "invoice_number": invoice.invoice_number,
        "currency_code": invoice.currency_code,
        "customer_id": str(new_customer_id) if new_customer_id else None,
        "lines": [
            {
                "description": entry["description"],
                "quantity": entry["quantity"],
                "unit_price": entry["unit_price"],
                **(
                    {"product_id": str(entry["product_id"])}
                    if entry["product_id"] is not None
                    else {}
                ),
            }
            for entry in work
        ],
        "discount_rate": discount_rate,
        "tax_rate": tax_rate,
        "notes": invoice.notes,
    }
    return IntentResult(
        kind="proposal",
        action="invoice.update_draft",
        payload={"invoice_id": str(invoice.id), "update": update},
    )


def extract_deterministic_intent(
    session: Session,
    business_id: UUID,
    message: str,
    *,
    business_currency: str = "EGP",
) -> IntentResult:
    """Extract a deterministic action intent from a chat message.

    Returns ``kind="none"`` when nothing extractable matched — the
    caller then runs the existing refusal / fallback flow unchanged.
    """
    folded, index_map = _fold_light(message)
    arabic = _is_arabic_message(message)

    # --- create customer -------------------------------------------------
    match = _first_match(_CUSTOMER_CREATE, folded)
    if match is not None:
        name = _matched_name(match, message, index_map)
        if name is not None:
            return IntentResult(
                kind="proposal",
                action="customer.create",
                payload={"name": name},
            )
    elif _first_match(_CUSTOMER_CREATE_NO_NAME, folded) is not None:
        return IntentResult(
            kind="clarify",
            answer="اسم العميل ايه؟" if arabic else "What's the customer's name?",
        )

    # --- create supplier -------------------------------------------------
    match = _first_match(_SUPPLIER_CREATE, folded)
    if match is not None:
        name = _matched_name(match, message, index_map)
        if name is not None:
            return IntentResult(
                kind="proposal",
                action="supplier.create",
                payload={"name": name},
            )
    elif _first_match(_SUPPLIER_CREATE_NO_NAME, folded) is not None:
        return IntentResult(
            kind="clarify",
            answer="اسم المورد ايه؟" if arabic else "What's the supplier's name?",
        )

    # --- update customer (ق-2) -------------------------------------------
    result = _extract_customer_update(
        session, business_id, message, folded, index_map, arabic
    )
    if result is not None:
        return result

    # --- create product --------------------------------------------------
    match = _first_match(_PRODUCT_CREATE, folded)
    if match is not None:
        name = _matched_name(match, message, index_map)
        amount = _price_amount(match.group("amount"))
        if name is not None and amount is not None:
            return IntentResult(
                kind="proposal",
                action="product.create",
                payload={"name": name, "unit_price": amount},
            )
    match = _first_match(_PRODUCT_CREATE_NO_PRICE, folded)
    if match is not None:
        name = _matched_name(match, message, index_map)
        if name is not None:
            question = (
                f"سعر المنتج {name} كام؟" if arabic
                else f"What price should {name} be?"
            )
            return IntentResult(kind="clarify", answer=question)

    # --- duplicate invoice / edit draft invoice (ق-2) --------------------
    result = _extract_invoice_duplicate(
        session, business_id, message, folded, index_map, arabic
    )
    if result is not None:
        return result
    result = _extract_invoice_update_draft(
        session, business_id, message, folded, index_map, arabic
    )
    if result is not None:
        return result

    # --- create draft invoice --------------------------------------------
    match = _first_match(_INVOICE_CREATE, folded)
    if match is not None:
        number = _matched_number(match, message, index_map)
        name = _matched_name(match, message, index_map)
        amount = _money_amount(match.group("amount"))
        if number is not None and name is not None and amount is not None:
            if _find_invoice(session, business_id, number) is not None:
                answer = (
                    f"فيه فاتورة بالرقم {number} موجودة أصلًا — اختار رقم تاني."
                    if arabic else
                    f"An invoice with number {number} already exists — pick a different number."
                )
                return IntentResult(kind="honest", answer=answer)
            status, rows = _resolve_customer(session, business_id, name)
            if status == "many":
                return _customer_clarify(session, business_id, name, rows, arabic=arabic)
            if status == "none":
                return IntentResult(
                    kind="honest",
                    answer=_missing_customer_answer(arabic=arabic),
                )
            customer = rows[0]
            currency = _currency_of(match, business_currency)
            label = f"فاتورة {number}" if arabic else f"Invoice {number}"
            return IntentResult(
                kind="proposal",
                action="invoice.create",
                payload={
                    "invoice_number": number,
                    "currency_code": currency,
                    "customer_id": str(customer.id),
                    "lines": [
                        {
                            "quantity": Decimal(1),
                            "unit_price": amount,
                            "description": label,
                        }
                    ],
                },
            )
    match = _first_match(_INVOICE_CREATE_NO_NUMBER, folded)
    if match is not None:
        name = _matched_name(match, message, index_map)
        amount = _money_amount(match.group("amount"))
        if name is not None and amount is not None:
            question = (
                f"رقم الفاتورة المسودة للعميل {name} ايه؟" if arabic
                else f"What invoice number should the draft invoice for {name} be?"
            )
            return IntentResult(kind="clarify", answer=question)

    # --- purchase orders (ق-2) --------------------------------------------
    result = _extract_purchase_order_create(
        session, business_id, message, folded, index_map, arabic,
        business_currency,
    )
    if result is not None:
        return result
    result = _extract_purchase_order_duplicate(
        session, business_id, message, folded, index_map, arabic
    )
    if result is not None:
        return result

    # --- record payment on an invoice ------------------------------------
    match = _first_match(_PAYMENT_INVOICE, folded)
    if match is not None:
        number = _matched_number(match, message, index_map)
        amount = _money_amount(match.group("amount"))
        if number is not None and amount is not None:
            invoice = _find_invoice(session, business_id, number)
            if invoice is None:
                return IntentResult(
                    kind="honest",
                    answer=_missing_invoice_answer(arabic=arabic),
                )
            if invoice.status != "issued":
                answer = (
                    f"الفاتورة {number} مش صادرة (حالتها: {invoice.status}) — "
                    "الدفع بيتسجّل على الفواتير الصادرة بس."
                    if arabic else
                    f"Invoice {number} isn't issued (status: {invoice.status}) — "
                    "payments can only be recorded on issued invoices."
                )
                return IntentResult(kind="honest", answer=answer)
            if invoice.customer_id is None:
                answer = (
                    f"الفاتورة {number} من غير عميل — سجّل الدفعة من العميل نفسه."
                    if arabic else
                    f"Invoice {number} has no customer — record the payment from the customer instead."
                )
                return IntentResult(kind="honest", answer=answer)
            currency = _currency_of(match, business_currency)
            return IntentResult(
                kind="proposal",
                action="payment.record",
                payload={
                    "amount": amount,
                    "currency_code": currency,
                    "idempotency_key": str(uuid4()),
                    "customer_id": str(invoice.customer_id),
                    "allocations": [
                        {"invoice_id": str(invoice.id), "amount": amount}
                    ],
                },
            )

    # --- record payment from a customer ----------------------------------
    match = _first_match(_PAYMENT_CUSTOMER, folded)
    if match is not None:
        name = _matched_name(match, message, index_map)
        amount = _money_amount(match.group("amount"))
        if name is not None and amount is not None:
            status, rows = _resolve_customer(session, business_id, name)
            if status == "many":
                return _customer_clarify(session, business_id, name, rows, arabic=arabic)
            if status == "none":
                return IntentResult(
                    kind="honest",
                    answer=_missing_customer_answer(arabic=arabic),
                )
            customer = rows[0]
            currency = _currency_of(match, business_currency)
            return IntentResult(
                kind="proposal",
                action="payment.record",
                payload={
                    "amount": amount,
                    "currency_code": currency,
                    "idempotency_key": str(uuid4()),
                    "customer_id": str(customer.id),
                    "allocations": [],
                },
            )

    # --- sales return (ق-2) ------------------------------------------------
    result = _extract_sales_return(
        session, business_id, message, folded, index_map, arabic
    )
    if result is not None:
        return result

    # --- record expense ---------------------------------------------------
    match = _first_match(_EXPENSE, folded)
    if match is not None:
        start, end = match.span("cat")
        category = _clean_category(_raw_slice(message, index_map, start, end))
        amount = _money_amount(match.group("amount"))
        if category is not None and amount is not None:
            currency = _currency_of(match, business_currency)
            return IntentResult(
                kind="proposal",
                action="expense.create",
                payload={
                    "category": category,
                    "description": category,
                    "amount": amount,
                    "currency_code": currency,
                    "incurred_at": datetime.now(UTC),
                },
            )

    # --- stock movement ---------------------------------------------------
    for patterns, movement_type, sign in (
        (_STOCK_ADD, "receipt", 1),
        (_STOCK_REMOVE, "adjustment", -1),
    ):
        match = _first_match(patterns, folded)
        if match is not None:
            name = _matched_name(match, message, index_map)
            qty = _quantity(match.group("qty"))
            if name is not None and qty is not None:
                status, rows = _resolve_product(session, business_id, name)
                if status == "many":
                    return _product_clarify(rows, name, arabic=arabic)
                if status == "none":
                    return IntentResult(
                        kind="honest",
                        answer=_missing_product_answer(arabic=arabic),
                    )
                product = rows[0]
                return IntentResult(
                    kind="proposal",
                    action="stock.movement",
                    payload={
                        "product_id": str(product.id),
                        "movement_type": movement_type,
                        "quantity_delta": qty * sign,
                    },
                )

    return IntentResult(kind="none")
