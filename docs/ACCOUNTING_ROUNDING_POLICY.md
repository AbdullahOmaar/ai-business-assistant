# Accounting Rounding Policy

**Status:** Implemented in the associated pull request; applies to newly calculated invoices and newly recorded purchase/return lines. Historical issued invoices are not rewritten.

## Monetary precision and rounding

- Currency amounts are stored and displayed to two decimal places; quantities may use three decimal places and unit prices use two.
- Use Python `Decimal` and the shared `money()` helper for monetary quantization.
- Rounding mode is `ROUND_HALF_UP`; positive half-cent ties round up.
- Round each invoice line (`quantity × unit_price`) to cents first, then sum the rounded line totals to produce the subtotal. This keeps displayed lines and subtotal reconcilable.
- Calculate discount from the rounded subtotal, round discount to cents, subtract it to obtain the taxable amount, calculate and round tax, then compute total as taxable amount plus rounded tax.
- Purchase-order line costs and sales-return line amounts use the same explicit policy.

## Required invariants

- `subtotal = sum(line_total)`
- `discount_total = money(subtotal × discount_rate / 100)`
- `tax_total = money((subtotal - discount_total) × tax_rate / 100)`
- `total = subtotal - discount_total + tax_total`

The API is authoritative; client-side previews are estimates only.

## Historical data and verification

- Do not bulk-recalculate or mutate historical issued invoices automatically.
- Existing discrepancies should be reported for manual review; any correction requires an auditable, authorized workflow.
- Regression tests cover half-cent ties, fractional quantities, multi-line invoices, discount, and tax.
