"""Pure business rules shared by workflows; persistence and authorization are separate."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, NamedTuple

CENT = Decimal("0.01")
QTY = Decimal("0.001")
ZERO = Decimal("0")


class InvoiceTotals(NamedTuple):
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    total: Decimal


def money(value: Decimal) -> Decimal:
    """Round a monetary amount to cents using an explicit half-up policy."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def calculate_invoice_totals(
    lines: Iterable[tuple[Decimal, Decimal]],
    *,
    discount_rate: Decimal = ZERO,
    tax_rate: Decimal = ZERO,
) -> InvoiceTotals:
    """Calculate totals from (quantity, unit_price) pairs; rates are percentages."""
    if not ZERO <= discount_rate <= Decimal("100"):
        raise ValueError("discount_rate must be between 0 and 100")
    if not ZERO <= tax_rate <= Decimal("100"):
        raise ValueError("tax_rate must be between 0 and 100")

    subtotal_raw = ZERO
    found_line = False
    for quantity, unit_price in lines:
        found_line = True
        if quantity <= ZERO:
            raise ValueError("quantity must be greater than zero")
        if unit_price < ZERO:
            raise ValueError("unit_price cannot be negative")
        # Round each line with HALF_UP first so stored line totals reconcile to subtotal.
        subtotal_raw += money(quantity * unit_price)
    if not found_line:
        raise ValueError("at least one invoice line is required")

    subtotal = money(subtotal_raw)
    discount = money(subtotal * discount_rate / Decimal("100"))
    taxable = subtotal - discount
    tax = money(taxable * tax_rate / Decimal("100"))
    return InvoiceTotals(subtotal, discount, tax, money(taxable + tax))


def validate_payment_allocation(
    *,
    payment_amount: Decimal,
    already_allocated: Decimal,
    requested_allocation: Decimal,
    invoice_outstanding: Decimal,
) -> None:
    """Reject invalid allocations; callers must run this inside a DB transaction."""
    if payment_amount <= ZERO:
        raise ValueError("payment amount must be positive")
    if already_allocated < ZERO or requested_allocation <= ZERO:
        raise ValueError("allocation amounts must be positive and valid")
    if invoice_outstanding < ZERO:
        raise ValueError("invoice outstanding cannot be negative")
    if already_allocated + requested_allocation > payment_amount:
        raise ValueError("allocation exceeds remaining payment amount")
    if requested_allocation > invoice_outstanding:
        raise ValueError("allocation exceeds invoice outstanding balance")


def derive_stock_balance(movements: Iterable[Decimal]) -> Decimal:
    """Derive stock from signed movements; no stored balance is trusted."""
    balance = sum(movements, ZERO)
    return balance.quantize(QTY, rounding=ROUND_HALF_UP)


def validate_return_quantity(*, sold_quantity: Decimal, previously_returned: Decimal,
                             requested_quantity: Decimal) -> None:
    """Ensure cumulative returns never exceed the originally sold quantity."""
    if sold_quantity <= ZERO or previously_returned < ZERO or requested_quantity <= ZERO:
        raise ValueError("sold and requested quantities must be positive")
    if previously_returned + requested_quantity > sold_quantity:
        raise ValueError("return quantity exceeds remaining sold quantity")


def validate_return_amount(*, invoiced_amount: Decimal, previously_returned_amount: Decimal,
                           requested_return_amount: Decimal) -> None:
    """Prevent cumulative rounded refunds from exceeding the source invoice line."""
    if invoiced_amount < ZERO or previously_returned_amount < ZERO or requested_return_amount < ZERO:
        raise ValueError("return amounts must be non-negative")
    if money(previously_returned_amount + requested_return_amount) > money(invoiced_amount):
        raise ValueError("return amount exceeds invoiced line amount remaining")


def summarize_money_by_currency(
    amounts: Iterable[tuple[str, Decimal]],
) -> dict[str, Decimal]:
    """Aggregate amounts per currency without mixing currencies."""
    totals: dict[str, Decimal] = {}
    for currency_code, amount in amounts:
        if amount < ZERO:
            raise ValueError("report amounts cannot be negative")
        totals[currency_code] = money(totals.get(currency_code, ZERO) + amount)
    return dict(sorted(totals.items()))
