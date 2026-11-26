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
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, Invoice, Product, Supplier

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
    "invoice.create": ("إنشاء فاتورة مسودة", "creating a draft invoice"),
    "payment.record": ("تسجيل دفعة", "recording a payment"),
    "expense.create": ("تسجيل مصروف", "recording an expense"),
    "stock.movement": ("حركة مخزون", "a stock movement"),
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
        else:
            noun = "منتجين" if count == 2 else f"{count} منتجات"
            what = "منتج"
        joined = " و ".join(options) if count == 2 else "، ".join(options)
        return f"عندك {noun} باسم {query}: {joined} — أنهي {what} تقصد؟"
    noun = "customers" if kind == "customer" else "products"
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
