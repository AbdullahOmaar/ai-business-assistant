from datetime import date

from decimal import Decimal

from app.extended_api import _receivable_aging_bucket, _receivable_outstanding


def test_receivables_aging_bucket_boundaries():
    as_of = date(2026, 10, 25)
    assert _receivable_aging_bucket(date(2026, 10, 25), as_of) == ("not_due", 0)
    assert _receivable_aging_bucket(date(2026, 10, 26), as_of) == ("not_due", -1)
    assert _receivable_aging_bucket(date(2026, 9, 25), as_of) == ("1_30_days", 30)
    assert _receivable_aging_bucket(date(2026, 8, 26), as_of) == ("31_60_days", 60)
    assert _receivable_aging_bucket(date(2026, 7, 27), as_of) == ("61_90_days", 90)
    assert _receivable_aging_bucket(date(2026, 7, 26), as_of) == ("over_90_days", 91)


def test_receivables_aging_keeps_missing_due_date_explicit():
    assert _receivable_aging_bucket(None, date(2026, 10, 25)) == ("no_due_date", None)


def test_receivable_outstanding_flags_overallocation_without_hiding_the_difference():
    assert _receivable_outstanding(Decimal("100.00"), Decimal("75.00")) == (
        Decimal("25.00"), False
    )
    assert _receivable_outstanding(Decimal("100.00"), Decimal("100.00")) == (
        Decimal("0.00"), False
    )
    assert _receivable_outstanding(Decimal("100.00"), Decimal("110.00")) == (
        Decimal("-10.00"), True
    )
