# Financial Reports — Source-to-Metric Map

Status: **PARTIALLY COMPLETE**. This document records the current implementation contract observed in the T40 candidate. It is not approval of the shared financial contract. T37 remains Draft / NOT APPROVED; no lifecycle, posting, formula, schema, or migration changes may be made on the strength of this document alone.

## Report sources and meanings

| Metric / endpoint | Source records | Date basis | Currency treatment | What it does not mean |
| --- | --- | --- | --- | --- |
| Dashboard `invoiced_sales` | `Invoice.total` where `status = issued` | `Invoice.issue_date`, filtered using business-local calendar dates converted to a UTC half-open interval | Grouped by invoice currency; no FX conversion | Not cash collected; stored invoice total includes saved tax |
| Dashboard `collected_payments` | Recorded `Payment.amount` | `Payment.received_at` | Grouped by payment currency; no FX conversion | Not invoice revenue; allocation links are not a second receipt |
| Dashboard `expenses` | `Expense.amount` | `Expense.incurred_at` | Grouped by expense currency; no FX conversion | Not proof that cash was paid; current Expense model does not represent settlement |
| Dashboard `outstanding_balances` | **Candidate PR #304 only:** issued invoices with `issue_date` before a cutoff, less allocations created before that cutoff whose Payment and Invoice match business, customer and currency; over-allocated payments are excluded and invoice over-allocation is surfaced as a warning | Candidate cutoff is selected `end_date` (or business-local today), converted to a UTC half-open bound | Grouped by invoice currency; no FX conversion | **T37 NOT APPROVED:** this changes the prior current-outstanding cohort into historical as-of balances. The response also still says these are current balances and directs users to aging for historical cutoff, contradicting the candidate query and `outstanding_as_of_date`. Do not accept this candidate behavior until Master approves the metric basis and response contract. |
| `GET /reports/tax-summary` | Saved `Invoice.tax_total` for issued invoices | Optional inclusive `start_date` / `end_date` in business timezone, converted to UTC half-open bounds | Grouped by invoice currency | Not a jurisdiction-specific tax filing; does not recalculate historical tax |
| `GET /reports/receivables-aging` | **Candidate PR #304 only:** issued invoices before the cutoff less allocations created before the cutoff whose business, customer and currency match; over-allocated payments are excluded and invalid allocations are warnings. Optional `limit`/`offset` paginates invoice rows while `invoice_count`, currency summaries and data-quality warnings remain report-wide. Omitting pagination parameters preserves the full legacy response. | Explicit `as_of` is used as supplied; absent `as_of`, report date is business-local today; candidate cutoff uses business-local end-of-day converted to UTC | Separate per-currency totals; no FX conversion | **T37 NOT APPROVED:** the candidate changes the report to historical as-of semantics and adds customer/allocation eligibility rules. This is not a full historical ledger or an approved financial contract. Pagination changes only row delivery, not the candidate financial calculations. |
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

1. **Receivables basis / allocation eligibility (T37 gate):** the current PR #304 candidate changes Dashboard outstanding to a historical cutoff at selected period end (or business-local today) and changes receivables aging to use invoice issue and allocation creation timestamps. It also excludes allocations whose business/customer/currency do not match and surfaces over-allocation warnings. These are not approved semantics while T37 is DRAFT / NOT APPROVED. The Dashboard response limitation still labels the result current and says to use aging for historical cutoff, contradicting the candidate query and its `outstanding_as_of_date`. Master must approve the basis and response contract or coordinate removal/replacement of the candidate hunks before merge.
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
| Expense date filters | Inclusive business-local bounds, one-sided filters, reversed range, invalid timezone, unrepresentable calendar extremes, New York DST transition and Cairo 2026 spring-forward boundary, deterministic timestamp tie-break pagination, currency grouping, non-member denial, same-principal cross-business isolation | Run the existing focused suite; add supported-PostgreSQL date-boundary coverage after an authorized runner is available. |
| Tax summary | Inclusive local-day bounds, one-sided filters, invalid timezone, unfiltered compatibility, currency separation, non-member denial, calendar extremes | Add PostgreSQL-backed query parity and verify empty-period behavior on the supported database. |
| Receivables aging | Business-local default as_of, explicit as_of preservation; existing related suite includes membership coverage | Add explicit tests for mismatched-payment-currency warnings, over-allocation data-quality warnings, and same-principal cross-business isolation. Preserve current-vs-historical basis as unresolved until Master decides. |
| Dashboard | Invoice-only/draft exclusion, no inferred cash, partial/full payment and currency-separated metrics, reversed date range are covered across T40/related suites | Add non-member and cross-business report isolation tests. Payment-currency mismatch and over-allocation expected behavior are T37-gated; do not encode a new expected response until Master records the versioned decision. |
| Profit/loss | Invoiced revenue vs incurred expense separation, gross-before-returns disclosure in related suite, non-member denial, reversed range, DST and unrepresentable calendar bounds | Add STAFF/OWNER route-access matrix and cross-business isolation; retain explicit gross-before-returns / before-COGS / not-net-profit disclosure. |
| Shared report security | Individual membership checks and some non-member denial tests exist | Build route x role x action x tenant matrix for dashboard, expenses, tax summary, receivables aging and P&L; verify denied reads disclose no other tenant's data. No invented role policy: confirm the T37 authorization matrix first. |
| Financial integrity | Current receivables-aging implementation warns on currency mismatch and over-allocation | Dashboard allocation currency matching and over-allocation handling need a T37 decision. The draft contract says only valid matching-currency allocations reduce receivables and negative balances are integrity errors, but that draft is NOT APPROVED. |

### Test execution gate

- T40-authored regression tests: 21 total across `test_financial_report_date_boundaries.py` (14) and `test_financial_report_reconciliation.py` (7), including a new Cairo 2026 spring-forward boundary case for expense and tax-summary filters. Source-reviewed only; **NOT RUN**.
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


## Payroll privacy v1.0 approval; T37 financial contract remains NOT APPROVED — 2026-10-30

Master separately approved Payroll Privacy Policy v1.0 on the canonical T40 task discussion. This narrow approval covers OWNER-only payroll-linked Expense rows/aggregates and STAFF access to ordinary expenses only, with business-scoped PayrollRecord.expense_id filtering before pagination/aggregation/AI context. The canonical T37 page remains PARTIALLY COMPLETE / Draft / NOT APPROVED. Earlier Operating Model/PR statements claiming T37 v1.0.1 approval conflict with the canonical T37 record and the owner's latest closeout instruction; do not treat those statements as approval.

### Separately approved payroll privacy behavior present on the T40 branch

- Payroll-linked Expense rows and payroll-derived totals are OWNER-only. STAFF retains ordinary expenses. The predicate uses business-scoped PayrollRecord.expense_id and runs before expense pagination or report/AI aggregation.
- Applied across GET /expenses, report summary, deterministic insights, dashboard, P&L, internal financial_summary and AI chat context. Existing OWNER-only CSV export and payroll management remain unchanged.
- T40's business-local date filters, deterministic ordering and pagination are preserved in GET /expenses.
- Regression added for STAFF/OWNER, first-page pagination, report surfaces, AI context and cross-business non-suppression. It is authored/source-reviewed only and NOT RUN.

### T37-gated candidate financial behavior — NOT APPROVED

- Dashboard receivables must only subtract allocations that match the invoice/payment business, customer and currency. Mismatched and over-allocated data must be surfaced as integrity warnings; negative balances must never be silently clamped.
- Current outstanding and historical as-of balances are distinct. Historical as-of requires persisted source-event timestamps and business-local cutoff. If the event history is insufficient, historical as-of must be labelled unavailable rather than inferred from current state.
- Expense incurred/approved/settled remain distinct. An Expense row is not cash outflow; only a linked confirmed settlement/disbursement is cash outflow. Current source schema still lacks a complete expense settlement/cashbox lifecycle.

### Deferred domains remain unchanged

Statutory tax/ETA, credit-note tax allocation/reversal, supplier AP/bills/payments, inventory valuation/landed cost/COGS, FX conversion/revaluation, GL/COA/journal posting, fiscal periods/opening balances, payroll statutory/effective-date and failed/partial/reversed payout policies remain deferred pending qualified professional review and separate versioned approval.

### Test inventory and current evidence

- T40 date-boundary tests: 14.
- T40 reconciliation tests: 7.
- New payroll visibility integration regression: 1.
- Related existing suites: 26 (6 business timezone + 20 core feature tests).
- Total targeted/authored coverage on this branch: 22 T40/T40-integration tests plus 26 related tests. **All NOT RUN.**
- Current T40 branch head at this doc checkpoint is recorded separately in PR #304 / TASKS.md. The exact [skip ci] head has no status contexts; this is NOT a pass. CircleCI is prohibited; no manual run/retry; GitHub Actions is not a replacement. No authorized local runner is available.


## Candidate allocation-integrity and historical-as-of implementation (T37 NOT APPROVED) — 2026-10-30

The following changes are present on PR #304 as candidate code only. They must not be merged or released until Master records a versioned T37 decision; they do not supersede the approval gate:

- Dashboard outstanding balances now use the selected period end as a business-local as-of cutoff (or business-local today when no end date is supplied).
- Only same-business, same non-null customer and same-currency allocations created before the cutoff reduce receivables.
- Allocations from a payment whose total allocations exceed its recorded payment amount are excluded; payment-level excess is a data-quality warning.
- Invoice-level over-allocation is reported and excluded from positive receivable totals. No negative balance is silently clamped.
- Invalid currency/customer allocations and missing invoice issue timestamps are explicit warnings.
- Receivables aging is historical as-of using Invoice.issue_date and PaymentAllocation.created_at before the business-local cutoff; due dates are converted to business-local dates. Credit applications/notes are not included while their tax/receivable treatment remains deferred.
- Expense settlement/disbursement and cashbox lifecycle remains NEEDS APPROVAL under T37 and is NOT IMPLEMENTED in the current schema.

Updated coverage:
- 14 date-boundary tests.
- 10 report-reconciliation tests.
- 3 payroll privacy/date-filter integration tests (broad-surface, Cairo date-filter/offset, dynamic date-filter/offset/read-only snapshot).
- 26 related existing tests.
- 27 targeted/authored + 26 related tests total. All **NOT RUN**.
- Exact current PR #304 head is tracked in live GitHub metadata; historical SHA snapshots in this document are not current. Empty status on [skip ci] commits is NOT a pass. No CircleCI run/retry, no GitHub Actions, no authorized local runner.


## Live source-vs-candidate reconciliation — 2026-10-30 18:14 UTC

This addendum clarifies that the earlier metric table describes the baseline implementation observed on main; it must not be read as a current description of every candidate change present on PR #304.

### Current source authority
- Live `main`: `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`.
- Current T40 candidate: PR #304, branch `task/t40-fin-report-003-current-main-20261029`, HEAD `7fcb24526e768949c87c6a0538115510f4c802a1`, base/merge base `c464398e0a6ace77eba32aabfbdbd09091f53999`, 101 ahead / 2 behind, diverged, OPEN/DRAFT/UNMERGED, GitHub `mergeable=false`.
- Latest Master authority correction (PR #304 comment `https://github.com/AbdullahOmaar/ai-business-assistant/pull/304#issuecomment-6530108102`) says **T37 remains Draft / NOT APPROVED overall**. Only the narrow AUTH-T41 payroll-privacy access policy is separately approved. Earlier PR/Operating Model text asserting broader T37 v1.0.1 financial approval is superseded.

### Candidate delta — present in PR #304, not approved for merge
The candidate branch has moved beyond the main-baseline behavior described in the table above:
- Dashboard receivables candidate uses a business-local as-of cutoff and filters allocation candidates by same business, non-null matching customer and currency.
- Payment-level over-allocation is detected and allocations from an over-allocated payment are excluded; invoice-level over-allocation and invalid/missing source data are surfaced as warnings rather than silently clamped.
- Receivables aging candidate uses persisted invoice issue and allocation creation timestamps before the business-local cutoff.
- These are **candidate financial semantics only**. They must not be treated as accepted policy, merged or released while T37 is Draft / NOT APPROVED. The table's earlier “current allocation” row is a main-baseline description, not an assertion that the candidate code is unchanged.

### Approved privacy boundary only
The separately approved AUTH-T41 privacy policy is implemented on the current T40 branch: business-scoped `PayrollRecord.expense_id` excludes payroll-linked Expense rows and derived aggregates from STAFF/non-OWNER views before pagination, aggregation and AI/provider context; OWNER retains access to payroll-linked rows; ordinary expenses remain available to STAFF. This approval is limited to access control and does not approve payroll calculations, cash settlement or accounting formulas.

### Cash and report limitations remain
- `Expense.incurred_at` is a cost-incurrence date, not a payment/settlement timestamp. Expense records alone are not cash outflow.
- A recorded `Payment` is a receipt source event; allocation is not a second receipt and issued invoice totals are not cash.
- The current model inventory has no complete cashbox/cash movement/expense settlement or supplier payable/payment lifecycle. Payroll's in-app `paid` transition is not external bank/provider confirmation.
- No implicit FX conversion or cross-currency summation. Operational dashboard/P&L output is not a GL-backed Cash Flow statement, Balance Sheet, Trial Balance or net profit. COGS/valuation and complete tax/credit/return treatment remain absent/deferred.
- Expense settlement/cashbox, statutory tax/credit-note treatment, supplier AP/payment, valuation/COGS, FX, GL and posting remain deferred pending explicit versioned approval and qualified review.

### Validation evidence
- PR #304 contains 14 date-boundary tests, 10 report-reconciliation tests and 3 payroll-privacy/date-pagination tests (27 targeted) plus 26 related existing tests. All are authored/source-reviewed only and **NOT RUN**.
- Current PR exact-head status list is empty due `[skip ci]`; empty status is NOT PASS. Live main still has six CircleCI FAILURE contexts. CircleCI is frozen and must not be triggered/retried. No authorized non-CircleCI runner is connected; PostgreSQL, build, browser and security checks are NOT RUN.
- PR #304 has no formal review, is diverged from main and GitHub reports mergeable=false. No merge, rebase, migration, production write or deployment is authorized or performed.


## Remaining T40 source-audit findings — 2026-10-30 18:19 UTC

### Expense and cash feature coverage (existing issues; no duplicate work item)
- **Issue #83 — Expense management with categories and evidence (OPEN):** main `Expense` supports a required free-text `category`, description, Decimal amount, currency, incurred timestamp, optional vendor/reference and created timestamp. There is no configurable category entity, receipt attachment metadata or attachment-storage workflow in the inspected model/API. The create endpoint records an incurred cost only; there is no approval, settlement or reversal state. Do not add storage or a migration in this T40 pass.
- **Issue #82 — Receivables aging (OPEN):** read-only aging functionality is already present on main; earlier PR #92 is MERGED, while PR #118 is CLOSED / UNMERGED. The current PR #304 adds candidate historical-as-of/allocation-integrity behavior, but those changes remain T37-gated and not merge-authorized.
- **Issue #85 — Tax configuration/reporting (OPEN):** current tax summary reads saved `Invoice.tax_total` from issued invoices and groups by currency. It does not implement a jurisdiction/tax-settings workflow, inclusive/exclusive tax configuration, exemption rules or statutory filing. Do not infer Egypt/ETA compliance or change tax semantics.
- **Issue #86 — Bank and cash reconciliation (OPEN):** the inspected source has no cashbox/cash-transaction/bank-statement/import/matching/reconciliation model or route. `docs/EXPENSE_SETTLEMENT_CASHBOX_DESIGN.md` remains a proposal only; no direct bank integration, paid API or new schema is authorized.

### Concrete source inconsistency requiring Master decision
On PR #304, the dashboard query computes `outstanding_as_of_date` from the selected `end_date` (or business-local today) and filters both invoice issue timestamps and allocation creation timestamps against that cutoff. However, the returned `limitations` array still says: “Outstanding balances are current balances; use the receivables-aging as-of date for a historical cutoff.” This response text contradicts the candidate query's historical-as-of behavior. Because the intended receivables basis is part of the disputed T37 contract, do not change either the formula or response wording independently. Master must decide the authoritative basis, then require a regression asserting that the response's stated basis matches the actual calculation.

### Safe next action
Master to reconcile T37's effective receivables decision and explicitly disposition issues #83/#85/#86; until then keep the candidate receivables behavior and expense-settlement/cashbox/tax work gated. Continue only source mapping, non-semantic documentation and test design. No new issue/branch/PR was created.

## T40 feature-only regression additions — 2026-10-30 21:58 UTC

Two contract-preserving tests were added to the T40-owned reconciliation suite:

- `test_dashboard_and_profit_loss_are_isolated_from_another_business`: seeds an unrelated tenant's issued invoice and expense, asserts the requested tenant's Dashboard and P&L totals remain tenant-scoped, and verifies that a non-member cannot read the unrelated tenant's Dashboard.
- `test_expense_csv_export_is_owner_only_tenant_scoped_and_formula_safe`: verifies the existing OWNER-only expense CSV route, business-scoped export rows, spreadsheet formula prefix escaping, and STAFF denial. This tests the existing export contract; it does not add export formats or broaden permissions.

The report-reconciliation suite now contains 12 tests (previously 10). The targeted T40 inventory is now 14 date-boundary + 12 report-reconciliation + 3 payroll-privacy/date-pagination = **29 tests**, plus 26 related existing tests. All 55 remain **NOT RUN**; this commit is authored/source-reviewed only.

No report formula, receivable basis, cash settlement, tax, AP, COGS, FX, GL, schema, role policy, or production behavior was changed. The two tests are on the T40-unique test file and do not modify the seven shared T40/T41 integration paths. PR #304 remains OPEN/DRAFT/UNMERGED and still requires the Master-controlled ancestry/shared-path sequence, authorized exact-SHA runner, and independent review.

### Follow-up coverage — report summary tenant boundary

- Extended `test_dashboard_and_profit_loss_are_isolated_from_another_business` to also call `GET /reports/summary` and assert both issued-invoice and expense aggregates remain scoped to the requested business.
- The T40 report-reconciliation suite remains 12 tests (the existing tenant-isolation test now covers Dashboard, report summary and P&L); total targeted inventory remains 29 plus 26 related tests = 55, all NOT RUN.
- This is a regression assertion for existing tenant scoping only. No new report formula or authorization rule was introduced.

### Existing CSV export contract and operational limits

Source review of `GET /api/v1/businesses/{business_id}/exports/{entity_type}.csv` confirms:

- OWNER-only authorization; supported entity types are `customers`, `products`, and `expenses`.
- Rows are filtered by the requested `business_id`; formula-like cell values beginning with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with an apostrophe before CSV serialization.
- The current route loads the full matching result set into memory. It has no date filter, pagination/streaming, PDF export, saved-view support or scheduled delivery.
- Payroll-linked expenses are not a STAFF export path: the export route is OWNER-only, consistent with the separately approved OWNER visibility boundary.
- The new T40 regression covers the existing owner/tenant/formula-safety behavior. Large-volume/streaming, configurable export filters, PDF and scheduled delivery remain successor T47 work and must reuse approved report definitions without inventing financial formulas.



### Payroll visibility × expense date-filter regression — 2026-10-31

- Added a parametrized backend regression for start-only, end-only and combined inclusive business-local date filters on the existing T40 branch.
- Each variant seeds a payroll-linked Expense through the authoritative business-scoped `PayrollRecord.expense_id` relationship and an ordinary Expense in the same business.
- OWNER-positive controls confirm the payroll row remains visible and is the newest first-page row. STAFF controls confirm the payroll row is removed before LIMIT/OFFSET, the ordinary row remains on page one, page two is empty, out-of-range rows stay excluded, and the payroll employee name, salary amount and payroll reference are absent from the response.
- This extends the existing T41 broad-surface regression (summary/dashboard/P&L/insights/internal summary/AI context) without editing T41-owned test files or shared backend paths.
- Current source-authored test inventory: 14 date-boundary + 15 report-reconciliation (including 3 parameter cases) + 3 payroll privacy/date-pagination = 32 targeted; 26 related = 58 total. **All 58 remain NOT RUN** until an authorized exact-SHA runner is available.


### Cairo fall-back date-boundary regression — 2026-10-31

- Added `test_cairo_dst_end_date_filters_use_the_25_hour_local_day` to `backend/tests/test_financial_report_date_boundaries.py`.
- The regression covers the Africa/Cairo 2026 fall-back day, whose UTC half-open interval is 2026-10-28 21:00Z through (exclusive) 2026-10-29 22:00Z. It asserts that expenses and issued-invoice tax totals include the exact local-day start and final microsecond, while excluding the immediately preceding and following records.
- Date-boundary test functions: 15 (previously 14). T40 targeted inventory: 33 (previously 32), plus 26 related tests = 59 authored tests total. All runtime tests remain **NOT RUN**; this commit uses `[skip ci]` and no CI was triggered.
- This adds coverage only; it does not change financial formulas, posting, schema, settlement, currency policy or permissions.

### Reversed tax-summary date-range validation — 2026-10-31

- Added `test_tax_summary_rejects_reversed_date_range` to the T40-owned report-reconciliation suite. The Dashboard reversed-range behavior is already covered by `test_dashboard_rejects_inverted_date_range` in `backend/tests/test_core_features_api.py`; no duplicate Dashboard assertion was retained.
- The tax-summary regression sends a start date later than the end date and requires HTTP 422 with the explicit validation detail before returning an aggregate.
- This is validation-only coverage. No report formula, tax policy, cash semantics, currency behavior, schema, permissions or production data changed.
- Report-reconciliation cases: 17 (15 test functions plus two additional parameter cases). T40 targeted inventory: 35 (15 date-boundary + 17 reconciliation + 3 payroll privacy/date-pagination) = **35 targeted cases**; plus 26 related = **61 authored cases total**. Runtime execution remains **NOT RUN**; commit uses `[skip ci]`.


### Candidate receivables semantics — explicit T37 hold — 2026-10-31

Source review of the actual PR #304 diff found that Dashboard and receivables-aging now contain candidate historical-as-of and allocation-eligibility behavior. This is a factual description of the branch, **not an approval**. T37 remains DRAFT / NOT APPROVED. The Dashboard's response limitation text also contradicts its candidate cutoff behavior; this must be resolved by Master as part of the versioned metric decision. No formula or endpoint behavior was changed by this documentation correction.


### Receivables invoice-row pagination — 2026-10-31

- Added optional query parameters `limit` (1–200) and `offset` (non-negative) to the existing receivables-aging endpoint. Calls without pagination parameters retain the existing complete invoice list; an offset without a limit returns 422.
- Response metadata reports `limit`, `offset`, full `total_count`, `has_more` and `next_offset`. Invoice rows are sliced after report-wide calculations, so `invoice_count`, `by_currency` and `data_quality_warnings` remain identical across pages. Stable ordering now adds Invoice.id as the final tie-breaker.
- This is response pagination only; current implementation still materializes the full report before slicing. It is not a database-query optimization or a financial formula change. Frontend controls/API-service wiring remain separate.
- Added a synthetic no-allocation pagination regression comparing the complete result with page 1 and page 2; it does not assert disputed allocation/settlement semantics. Runtime execution remains NOT RUN.
