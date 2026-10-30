# Financial Reports — Source-to-Metric Map

Status: **PARTIALLY COMPLETE**. This document records the current implementation contract observed in the T40 candidate. It is not approval of the shared financial contract. T37 remains Draft / NOT APPROVED; no lifecycle, posting, formula, schema, or migration changes may be made on the strength of this document alone.

## Report sources and meanings

| Metric / endpoint | Source records | Date basis | Currency treatment | What it does not mean |
| --- | --- | --- | --- | --- |
| Dashboard `invoiced_sales` | `Invoice.total` where `status = issued` | `Invoice.issue_date`, filtered using business-local calendar dates converted to a UTC half-open interval | Grouped by invoice currency; no FX conversion | Not cash collected; stored invoice total includes saved tax |
| Dashboard `collected_payments` | Recorded `Payment.amount` | `Payment.received_at` | Grouped by payment currency; no FX conversion | Not invoice revenue; allocation links are not a second receipt |
| Dashboard `expenses` | `Expense.amount` | `Expense.incurred_at` | Grouped by expense currency; no FX conversion | Not proof that cash was paid; current Expense model does not represent settlement |
| Dashboard `outstanding_balances` | Issued invoice totals minus current `PaymentAllocation` totals grouped by invoice currency | Invoice issue date determines which invoices enter the selected period; allocation totals are current and are not filtered by payment date | Grouped by invoice currency; no FX conversion | **Known integrity gap:** dashboard aggregation does not join the allocation to its `Payment` to verify currency match; it can subtract a foreign-currency allocation. Negative results are silently clamped to zero. Both behaviors require T37-approved semantics and regression coverage before code changes. Not historical receivables as-of period end. |
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

## Production V1 M06/M08 scope gaps

The Production V1 ERP Charter expands T40 beyond the currently implemented expense/report endpoints:

- **M06 Expenses & Cash:** expense categories/evidence, cashboxes/cash transactions, collections/disbursements, payment methods, approval/settlement, cash balances and movement reports. Current `backend/app/models.py` at GitHub main `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f` defines `Expense` but no Cashbox, CashTransaction, CashMovement, settlement, payable or bank-transaction model. The current Expense record is an incurred-cost source only; it is not proof of cash payment.
- **M08 Financial Reports & Dashboard:** General Ledger, Trial Balance, P&L, Balance Sheet, Cash Flow, sales/purchasing, AR/AP aging, inventory valuation, tax reports and KPIs grounded in verified accounting data. The current main model inventory contains no Chart of Accounts, JournalEntry or JournalLine models. T44's canonical task confirms no COA/journal/ledger tables exist at production revision `0005_employee_payroll`; T44 is design-only and gated by T37 plus qualified accounting review.
- The existing dashboard and P&L are operational source-record summaries, not GL-backed statements. Do not relabel them as a full cash-flow statement, net profit, Balance Sheet or Trial Balance. AP aging, cash/bank reconciliation, inventory valuation/COGS, payroll posting and tax compliance remain dependent on T37/T39/T41/T44 and the relevant specialist/owner decisions.

These are acceptance gaps, not authorization to invent new financial models or posting behavior. Continue source mapping and test design only until the shared contract and T44 accounting design are approved.

### Additional M06/M08 acceptance tests (future, contract-gated)

- Cashbox/cash movement: opening balance, receipt, disbursement, transfer, void/reversal, payment-method mapping, currency separation, tenant/role authorization, idempotent retries, and reconciliation to actual Payment/settlement source events.
- Expense lifecycle: incurred vs submitted/approved vs settled/paid vs rejected/cancelled/reversed; approval separation; cash outflow must derive from a valid settlement/disbursement event, not `Expense.incurred_at`.
- GL-backed reporting: every posted source event is traceable to a balanced journal; Trial Balance balances per currency; P&L/Balance Sheet/Cash Flow reconcile to subledgers and fiscal period; reversals/corrections preserve immutable history.
- Cross-module reconciliation: AR, AP, cash/bank, inventory, tax, expense and payroll subledgers reconcile to the GL without double-counting purchase cost, COGS, expenses, refunds or payroll.
- These expected behaviors depend on T37 approval and T44's approved COA/posting/reversal/period-lock design; tests must not be implemented against draft recommendations alone.
## Acceptance test matrix and current coverage

The matrix below separates already-authored tests from missing coverage and contract-gated expected behavior. It is a test plan, not evidence that tests have executed.

| Area | Existing authored coverage | Remaining test cases / decision gate |
| --- | --- | --- |
| Expense date filters | Inclusive business-local bounds, one-sided filters, reversed range, invalid timezone, unrepresentable calendar extremes, DST transition, deterministic timestamp tie-break pagination, currency grouping, non-member denial, same-principal cross-business isolation | Run the existing focused suite; add supported-PostgreSQL date-boundary coverage after an authorized runner is available. |
| Tax summary | Inclusive local-day bounds, one-sided filters, invalid timezone, unfiltered compatibility, currency separation, non-member denial, calendar extremes | Add PostgreSQL-backed query parity and verify empty-period behavior on the supported database. |
| Receivables aging | Business-local default as_of, explicit as_of preservation; existing related suite includes membership coverage | Add explicit tests for mismatched-payment-currency warnings, over-allocation data-quality warnings, and same-principal cross-business isolation. Preserve current-vs-historical basis as unresolved until Master decides. |
| Dashboard | Invoice-only/draft exclusion, no inferred cash, partial/full payment and currency-separated metrics, reversed date range are covered across T40/related suites | Add non-member and cross-business report isolation tests. Payment-currency mismatch and over-allocation expected behavior are T37-gated; do not encode a new expected response until Master records the versioned decision. |
| Profit/loss | Invoiced revenue vs incurred expense separation, gross-before-returns disclosure in related suite, non-member denial, reversed range, DST and unrepresentable calendar bounds | Add STAFF/OWNER route-access matrix and cross-business isolation; retain explicit gross-before-returns / before-COGS / not-net-profit disclosure. |
| Shared report security | Individual membership checks and some non-member denial tests exist | Build route x role x action x tenant matrix for dashboard, expenses, tax summary, receivables aging and P&L; verify denied reads disclose no other tenant's data. No invented role policy: confirm the T37 authorization matrix first. |
| Financial integrity | Current receivables-aging implementation warns on currency mismatch and over-allocation | Dashboard allocation currency matching and over-allocation handling need a T37 decision. The draft contract says only valid matching-currency allocations reduce receivables and negative balances are integrity errors, but that draft is NOT APPROVED. |

### Test execution gate

- T40-authored regression tests: 20 total across `test_financial_report_date_boundaries.py` (13) and `test_financial_report_reconciliation.py` (7). Source-reviewed only; **NOT RUN**.
- Related existing suites: `test_business_timezone_reporting.py` (6) and `test_core_features_api.py` (20). Inspected/source-reviewed only; **NOT RUN**.
- CircleCI execution/retry is prohibited by the current Operating Model. Do not run it.
- GitHub Actions must not be introduced as a replacement CI. No Actions run was triggered.
- GitLab mirror is not synchronized to the current GitHub PR head: GitLab main is `ae7a34b884d86e0ed26ffd64c528c1d488b956ef`; mirrored T40 branch is `e76e659106c541c118588046b0313158cac7675c`; GitLab cannot resolve PR head `018a38ce867a60697ee228fc3dfa2b73c91dca46`; no pipeline exists for the mirror head. Therefore GitLab cannot currently provide exact-SHA validation.
- Current safe alternative: source review, acceptance-matrix maintenance and local test execution only if an authorized local runner becomes available. Do not claim runtime verification.
## Validation and release status

- Source changes are on the existing T40 branch and PR #304; this document does not authorize merge or deployment.
- Regression tests are authored but **NOT RUN**. Local tests, frontend build, container build, and security scans are **NOT RUN** per owner instruction.
- Latest exact-head checkpoint before this documentation-only refresh: `9c13209ed0e1cc33ba7458e68b56d4d12b37af33`. GitHub combined-status returned five CircleCI contexts in FAILURE (backend-accounting, backend-container, frontend-production-build, frontend-unit-tests, frontend-browser-smoke); the sixth expected context was not present in that response. CircleCI execution/retry is prohibited by the current Operating Model; no job logs were inspected and root cause is **NOT VERIFIED**.
- PR #304 remains OPEN/DRAFT/UNMERGED on the existing branch. Against live GitHub main `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`, compare is 41 ahead / 2 behind; GitHub currently reports mergeable=true, but the base is stale and the exact-head checks/review gates are incomplete. Do not rebase/merge without reviewing the two behind commits and resolving the required checks.
- Do not mark T40 VERIFIED COMPLETE or merge until the shared financial contract is approved, feature review is complete, and required exact-head checks pass.
