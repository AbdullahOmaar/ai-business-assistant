# Financial Reports — Source-to-Metric Map

Status: **PARTIALLY COMPLETE**. This document records the current implementation contract observed in the T40 candidate. It is not approval of the shared financial contract. T37 remains Draft / NOT APPROVED; no lifecycle, posting, formula, schema, or migration changes may be made on the strength of this document alone.

## Report sources and meanings

| Metric / endpoint | Source records | Date basis | Currency treatment | What it does not mean |
| --- | --- | --- | --- | --- |
| Dashboard `invoiced_sales` | `Invoice.total` where `status = issued` | `Invoice.issue_date`, filtered using business-local calendar dates converted to a UTC half-open interval | Grouped by invoice currency; no FX conversion | Not cash collected; stored invoice total includes saved tax |
| Dashboard `collected_payments` | Recorded `Payment.amount` | `Payment.received_at` | Grouped by payment currency; no FX conversion | Not invoice revenue; allocation links are not a second receipt |
| Dashboard `expenses` | `Expense.amount` | `Expense.incurred_at` | Grouped by expense currency; no FX conversion | Not proof that cash was paid; current Expense model does not represent settlement |
| Dashboard `outstanding_balances` | Issued invoice totals minus current matching invoice allocations | Invoice issue date determines which invoices enter the selected period; allocation totals are current and are not filtered by payment date | Grouped by invoice currency; no FX conversion | Not historical receivables as-of the period end; not necessarily cash due on that date |
| `GET /reports/tax-summary` | Saved `Invoice.tax_total` for issued invoices | Optional inclusive `start_date` / `end_date` in business timezone, converted to UTC half-open bounds | Grouped by invoice currency | Not a jurisdiction-specific tax filing; does not recalculate historical tax |
| `GET /reports/receivables-aging` | Issued invoices less payment allocations whose currency matches the invoice currency | Explicit `as_of` is used as supplied; absent `as_of`, report date is business-local today. Aging uses invoice due date and the report date | Separate per-currency totals. Currency-mismatched allocations are warnings and are not added to invoice-currency totals | Not a full historical ledger; overallocated invoices are excluded from positive aging buckets and reported as data-quality warnings |
| `GET /profit-loss` | Issued invoice totals and recorded expenses; approved returns are disclosed separately | Selected period is based on invoice issue date and expense incurred date, with business-local date boundaries | Grouped by currency; no FX conversion | **Not net profit**: COGS / complete stock valuation and full tax/credit/refund treatment are not represented in the calculation |

## Date-filter invariants

- Date-only report filters are inclusive at the local-calendar-day level.
- Implementation converts local midnight at the start date to UTC and uses the local midnight after the end date as an exclusive upper bound. This is a half-open interval: `[start, end_exclusive)`.
- The conversion uses the business's configured IANA timezone, so daylight-saving days may be 23 or 25 hours where applicable.
- Expense-list filtering is optional. Without filters, the existing query behavior is retained; when filters are supplied, an invalid business timezone returns HTTP 422 and a reversed range returns HTTP 422.
- Tax summary validates timezone only when at least one date filter is supplied. An unfiltered tax summary does not require timezone conversion.
- Receivables aging preserves an explicitly supplied `as_of`; only its default date is resolved from the business timezone.

## Authorization and tenant isolation

- Expense and report routes require server-side business membership via the trusted principal. The caller does not supply their own identity.
- Queries are scoped to the requested `business_id`; report joins for receivables allocations also match business IDs on related payment/invoice records.
- Regression cases have been authored for non-member access to date-filtered expenses and tax summary, and the existing T40 reconciliation file covers non-member access to profit/loss. **These tests have not been run** under the current owner instruction.

## Known financial gaps and decisions required

1. **Receivables basis:** Master must decide between current outstanding for invoices issued in a selected period and a true historical receivable balance as of period end.
2. **Expense settlement:** `Expense.incurred_at` is an incurred-cost timestamp, not evidence of payment. A separate approved settlement source/state is required before calling expenses cash outflow.
3. **Supplier liabilities and cost of goods:** purchase orders/receipts do not by themselves establish supplier bills/payables or payment. Inventory valuation/COGS must be approved and avoid double-counting purchases and expenses.
4. **Returns, credit notes, refunds:** approved returns are currently disclosed separately in profit/loss; they are not silently netted into revenue. A complete source-event and reversal policy requires T37/T38 approval.
5. **Payroll integration:** payroll expense/payment linkage and exactly-once posting need the T37/T41 contract; do not add payroll totals ad hoc to reports.
6. **FX, rounding and currency policy:** no conversion is performed. Any FX rate source, effective timestamp, and rounding policy requires explicit approval.
7. **Tax compliance:** saved tax totals are operational reporting only; do not label them a jurisdiction-specific filing.

## Validation and release status

- Source changes are on the existing T40 branch and PR #304; this document does not authorize merge or deployment.
- Regression tests are authored but **NOT RUN**. Local tests, frontend build, container build, and security scans are **NOT RUN** per owner instruction.
- Latest exact-head SHA recorded at the last check: `c6fa0f6e23d3fd5544cc57166775e93a430eb46e`. All six CircleCI contexts reported failure; logs were not available and root cause is **NOT VERIFIED**.
- Do not mark T40 VERIFIED COMPLETE or merge until the shared financial contract is approved, feature review is complete, and required exact-head checks pass.
