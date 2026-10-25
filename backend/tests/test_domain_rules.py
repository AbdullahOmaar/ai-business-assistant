from decimal import Decimal

import pytest

from app.domain_rules import (
    calculate_invoice_totals,
    derive_stock_balance,
    summarize_money_by_currency,
    validate_payment_allocation,
    validate_return_quantity,
)


def D(value: str) -> Decimal:
    return Decimal(value)


def test_invoice_lines_round_half_up_before_subtotal_discount_and_tax() -> None:
    # Each 1.500 × 0.01 line is 0.015 and must round HALF_UP to 0.02.
    totals = calculate_invoice_totals(
        [(D("1.500"), D("0.01")), (D("1.500"), D("0.01"))],
        discount_rate=D("25"),
        tax_rate=D("50"),
    )

    assert totals.subtotal == D("0.04")
    assert totals.discount_total == D("0.01")
    assert totals.tax_total == D("0.02")
    assert totals.total == D("0.05")


def test_invoice_totals_use_discount_before_tax_and_decimal_rounding() -> None:
    totals = calculate_invoice_totals(
        [(D("2"), D("10.00")), (D("1"), D("5.00"))],
        discount_rate=D("10"),
        tax_rate=D("14"),
    )

    assert totals.subtotal == D("25.00")
    assert totals.discount_total == D("2.50")
    assert totals.tax_total == D("3.15")
    assert totals.total == D("25.65")


@pytest.mark.parametrize(
    "lines, kwargs",
    [
        ([], {}),
        ([(D("0"), D("10"))], {}),
        ([(D("1"), D("-1"))], {}),
        ([(D("1"), D("1"))], {"tax_rate": D("101")}),
        ([(D("1"), D("1"))], {"discount_rate": D("-1")}),
    ],
)
def test_invoice_totals_reject_invalid_inputs(lines, kwargs) -> None:
    with pytest.raises(ValueError):
        calculate_invoice_totals(lines, **kwargs)


def test_payment_allocation_accepts_valid_partial_payment() -> None:
    validate_payment_allocation(
        payment_amount=D("100.00"),
        already_allocated=D("25.00"),
        requested_allocation=D("25.00"),
        invoice_outstanding=D("40.00"),
    )


def test_payment_allocation_rejects_overallocation() -> None:
    with pytest.raises(ValueError, match="remaining payment"):
        validate_payment_allocation(
            payment_amount=D("100.00"),
            already_allocated=D("90.00"),
            requested_allocation=D("20.00"),
            invoice_outstanding=D("200.00"),
        )


def test_payment_allocation_rejects_invoice_overpayment() -> None:
    with pytest.raises(ValueError, match="outstanding"):
        validate_payment_allocation(
            payment_amount=D("100.00"),
            already_allocated=D("0.00"),
            requested_allocation=D("80.00"),
            invoice_outstanding=D("60.00"),
        )


def test_stock_balance_is_derived_from_signed_movements() -> None:
    assert derive_stock_balance([D("10.000"), D("-2.500"), D("1.250")]) == D("8.750")


def test_return_quantity_cannot_exceed_original_sale() -> None:
    with pytest.raises(ValueError, match="exceeds remaining"):
        validate_return_quantity(
            sold_quantity=D("5.000"),
            previously_returned=D("3.000"),
            requested_quantity=D("2.001"),
        )


def test_report_totals_keep_currencies_separate() -> None:
    assert summarize_money_by_currency(
        [("EGP", D("10.25")), ("USD", D("2.00")), ("EGP", D("1.75"))]
    ) == {"EGP": D("12.00"), "USD": D("2.00")}
