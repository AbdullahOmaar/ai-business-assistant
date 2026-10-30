# T40 / T41 Expense Visibility Integration Review

Date: 2026-10-30  
Status: **BLOCKED — integration contract decision required; no runtime changes made.**

## Scope

This note reconciles the existing T40 Expenses & Reports PR #304 with T41 Employee/Payroll PR #308. It records a concrete privacy integration requirement and the source-level changes needed to preserve both workstreams. It does not approve the proposed role policy or authorize a merge.

## Verified repository evidence

- Live `main`: `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`.
- T40 PR #304 branch: `task/t40-fin-report-003-current-main-20261029`; source-level code reviewed at `c46370a64ddb157a621a7de44084d070835875c2`; documentation checkpoints `5ef93cea54cb39e036ca2e21f73da2e29718d383` and `757a07649cc27ec7a15e96901c1af0babe2a2896`; latest exact PR head at this review is `757a07649cc27ec7a15e96901c1af0babe2a2896`.
- T41 PR #308 branch: `feat/t41-salary-history-effective-dates`, head `f89380722efb580be79a2d46013df7f29a3e3f9c`.
- Both branches diverge from live main by two commits; their merge base is `c464398e0a6ace77eba32aabfbdbd09091f53999`.
- PR #304 is OPEN / DRAFT / UNMERGED (49 ahead / 2 behind); latest GitHub metadata says `mergeable=true`. PR #308 is OPEN / DRAFT / UNMERGED (80 ahead / 2 behind). Neither metadata value constitutes validation or permission to merge.
- Current T40 exact head `757a07649cc27ec7a15e96901c1af0babe2a2896` returns six CircleCI FAILURE contexts (backend-accounting, backend-container, frontend-unit-tests, frontend-production-build, frontend-dependency-audit, frontend-browser-smoke). Current T41 exact head `f89380722efb580be79a2d46013df7f29a3e3f9c` returned no status contexts. Neither is a pass.
- T37 remains PARTIALLY COMPLETE / NOT APPROVED. Master has requested an explicit decision on payroll-linked expense visibility; no versioned APPROVED decision is present.

## Source-level integration finding

### T40 implementation that must be preserved

On PR #304, `backend/app/extended_api.py::list_expenses`:
- accepts optional inclusive `start_date` / `end_date`;
- resolves local-day bounds using the business IANA timezone and UTC half-open intervals;
- rejects reversed/unrepresentable ranges with HTTP 422;
- orders by `Expense.incurred_at DESC, Expense.id DESC` before offset/limit.

This is the T40 date-boundary and deterministic-pagination behavior.

### T41 privacy candidate

On PR #308:
- `backend/app/security.py::apply_expense_visibility` excludes expenses whose IDs are referenced by `PayrollRecord.expense_id` for non-OWNER roles; OWNER remains unrestricted.
- `backend/app/extended_api.py` applies the predicate to expense list, report summary and deterministic insights.
- `backend/app/core_features_api.py` applies it to dashboard and P&L.
- `backend/app/operations.py` applies it to internal `financial_summary`.
- `backend/app/assistant_api.py` applies it to expense records included in AI chat context.
- T41's authored regression `test_staff_cannot_read_payroll_expense_through_broad_surfaces` checks STAFF and OWNER behavior across these surfaces, but the current PR #308 exact head has not been executed.

### Required integration — do not overwrite either side

1. The final `GET /expenses` query must start with the business-scoped Expense query, apply `apply_expense_visibility(..., business_id=business_id, role=membership.role)`, then apply T40's date predicates, stable ordering and pagination. The privacy predicate must run before offset/limit so hidden payroll rows do not affect visible page contents.
2. The current T40 `_authorized` helper returns `None`; T41's candidate requires retaining the returned membership role. If Master approves the candidate, update the helper to return `authorize_membership(...)` and pass `membership.role` to the visibility predicate. Do not hardcode role assumptions independently in route handlers.
3. Reconcile `core_features_api.py` as well: T40's `_day_bounds` overflow handling and report date behavior must survive while the T41 visibility predicate is applied to dashboard and P&L expense aggregates.
4. Preserve the T41 predicate on report summary, insights, internal financial summary and AI chat context. Preserve existing OWNER-only CSV export and employee/payroll management controls.
5. Keep all tenant scoping in the predicate itself (`PayrollRecord.business_id == business_id`) and in the base Expense query. Never rely on mutable category/description text as the privacy boundary.

## Decision gate

T41's candidate policy is:
- OWNER can read payroll-linked Expense rows and payroll-derived aggregates.
- STAFF and other non-OWNER members can continue reading ordinary business expenses but cannot read payroll-linked rows or their derived totals/counts across expenses, dashboard, P&L, report summary, deterministic insights, internal financial summary or AI chat context.
- CSV export and employee/payroll management remain OWNER-only.

This is a candidate only. T37's route × role × action × tenant matrix remains unapproved. Master must explicitly APPROVE this exact policy or publish an alternative before code/permission behavior is integrated or either PR is marked ready.

## Required regression coverage after approval

- Seed one payroll-linked Expense (via authoritative PayrollRecord.expense_id) and one ordinary Expense in the same business.
- STAFF list: payroll row is absent with no date filters, with start-only, end-only and combined date filters; ordinary row remains visible.
- Confirm visibility predicate is applied before deterministic ordering and offset/limit; test pages containing interleaved payroll and ordinary expenses.
- OWNER retains both payroll and ordinary rows under the same date filters and pagination.
- STAFF cannot recover payroll identity, net pay, payroll reference or payroll-derived totals/counts from dashboard, P&L, report summary, deterministic insights, internal financial summary or AI chat context.
- Existing OWNER-only CSV behavior remains enforced; OWNER positive access remains intact.
- Cross-tenant PayrollRecord links cannot suppress or expose another business's Expense rows.
- Preserve existing T40 reversed-range, timezone-invalid, calendar-extreme, DST and same-principal cross-business tests.
- Assert denied cross-tenant/role paths have no business-state or audit side effects where applicable.

## Validation and release

- T40-authored tests on PR #304: 21; related existing suites: 26. All source-reviewed only, **NOT RUN**.
- T41 privacy regression on PR #308: authored/source-inspected; current exact head **NOT RUN**. Historical test results on older commits do not validate current PR heads.
- T40 current exact-head GitHub status: six CircleCI FAILURE contexts on `757a07649cc27ec7a15e96901c1af0babe2a2896`. The documentation correction commit that produced this head omitted `[skip ci]`, so CircleCI contexts appeared automatically; this was unintended and contrary to the Operating Model. No manual run or retry was initiated; no job logs/root cause were verified. Future documentation-only commits must include `[skip ci]`. T41 current exact-head status query returned no contexts; that is not a pass.
- CircleCI execution/retries are prohibited by the Operating Model; GitHub Actions must not be used as replacement CI. GitLab mirror is stale and cannot validate either GitHub head. Desktop Commander device is OFFLINE.
- No code, schema, migration, payroll calculation, posting, permission behavior, merge or deployment was changed by this review.

## Next actions

1. Master records a versioned APPROVED/DEFERRED decision for the payroll visibility policy in T37.
2. T40 and T41 owners coordinate one source integration preserving both date semantics and visibility behavior; reconcile both branches' two-behind relationship against live main before final review.
3. Add/extend the cross-surface regression matrix, then run all relevant exact-head tests, PostgreSQL integration, build and security checks through an authorized runner.
4. Keep both PRs Draft / unmerged until policy approval, exact-head validation and independent security review pass.


## Additional T40 / T38-Feature 31 report integration gate — PR #312

A broader open Draft PR #312 was inspected because it changes the same report surfaces and financial sources:

- PR #312 head: `564dfacd5b518006468deb7d53fde16a38896c27`; 191 ahead / 2 behind live main `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`; OPEN / DRAFT / UNMERGED; latest metadata says mergeable=true. Exact head has six CircleCI FAILURE contexts. No retry or manual CI run was made.
- It changes `backend/app/core_features_api.py`, `backend/app/extended_api.py`, `backend/app/models.py`, services/domain rules and adds migrations `0006`–`0011`.
- `core_features_api.py`: adds CreditNote tax/total aggregates to P&L and subtracts issued credit-note totals from revenue activity. This is a new report formula / financial semantic and remains T37-gated.
- `extended_api.py::report_tax_summary`: adds credit-note tax reversals, but the PR patch constructs date bounds at UTC midnight. That conflicts with T40's business-IANA-timezone inclusive local-day semantics for tax summary. Integration must preserve T40's business-local half-open UTC bounds for both invoice tax and credit-note tax, after the policy for credit-note issuance-date treatment is approved.
- `extended_api.py::receivables_aging`: subtracts applied CreditApplication amounts from receivables and adds credit-note warning behavior. This changes the receivables source basis and must not be accepted until T37 approves credit application/receivable treatment and current-vs-historical as-of semantics.
- The same branch adds bank reconciliation, pricing-rule effective dates and several other migrations outside the PR's stated credit-note lifecycle scope. Master has already recorded a source review requiring scope separation, migration/backfill review and T37 approval.

**Integration rule:** do not cherry-pick or merge PR #312 wholesale into T40. First obtain T37 approval and coordinate with T38/Feature 31. Then reconcile only the approved, scoped report behavior while preserving T40 date-boundary semantics and T41 payroll visibility. The six migration chain and its dependencies require independent migration review and isolated PostgreSQL upgrade/recovery validation; they are not part of T40's current authorized changes.


## Separate payroll privacy v1.0 approval; T37 financial contract remains NOT APPROVED (2026-10-30)

Master explicitly approved the narrow Payroll Privacy Policy v1.0 in the T40 task discussion. This is a separate security/access decision only. The canonical T37 page remains PARTIALLY COMPLETE / Draft / NOT APPROVED and contains no versioned T37 v1.0.1 approval; prior Operating Model/PR statements claiming otherwise conflict with the canonical T37 record and the owner's latest closeout instruction. The payroll privacy approval does NOT approve receivables-as-of, allocation/over-allocation, expense settlement, cashflow, posting, tax, COGS, FX, GL or schema semantics.

### Implemented on the existing T40 PR #304 branch

- `backend/app/security.py`: added `apply_expense_visibility`, using the business-scoped authoritative `PayrollRecord.expense_id` relation; OWNER keeps access, non-OWNER roles exclude payroll-linked Expense IDs.
- `backend/app/extended_api.py`: `_authorized` now returns the authorized membership; `GET /expenses` applies payroll visibility before business-local date filters, deterministic ordering and pagination; `/reports/summary` and `/assistant/insights` apply the predicate before aggregation.
- `backend/app/core_features_api.py`: `_authorize` returns membership; dashboard and P&L filter payroll-linked expenses before aggregation while preserving T40's local-date boundary logic.
- `backend/app/operations.py`: internal `financial_summary` filters payroll-linked expense aggregates.
- `backend/app/assistant_api.py`: AI chat context excludes payroll-linked Expense records for non-OWNER members before selecting the recent context window.
- `backend/tests/test_employee_payroll_api.py`: added `test_staff_cannot_read_payroll_expense_through_broad_surfaces`, covering STAFF list pagination, report summary, dashboard, P&L, deterministic insights, internal summary, AI chat context, OWNER positive access, OWNER-only CSV and cross-business non-suppression.

### Exact commits (all documentation/code commits used `[skip ci]`)

- `8833761e0ef8207138dc662cc1922eb9e534b109` — security predicate.
- `eeb253c9a7301fc49e2a5f0817af7d8692e8606b` — expense list, report summary and insights.
- `ed3a4b3347f4c38b3754952feb2064042fa6aeac` — dashboard and P&L.
- `ded9b146f0b969a6556196544aba88cc2bfabe6f` — internal financial summary.
- `b78c6a63657550c3c16fc17da278889e564337ad` — AI chat context.
- `6cfb8155f12e42ee6719226af49e9f9b5b34406d` — cross-surface privacy regression.

### Review findings / remaining work

- Source-level review confirms visibility is applied before expense pagination and aggregate queries on the changed surfaces. OWNER-only CSV/export and payroll management guards remain unchanged.
- The new test is authored but **NOT RUN**. All prior T40 tests and the 26 related suites remain **NOT RUN**. Build, PostgreSQL, browser, security and exact-head executable checks are **NOT RUN**.
- This is a historical PR checkpoint; exact current PR #304 head/base/mergeability must be read from live GitHub metadata. The PR is still Draft, has no formal reviews, and empty status contexts on [skip ci] commits are NOT a pass.
- CircleCI remains prohibited; no retry/run was initiated. GitHub Actions was not used. No authorized local runner is available. No merge, rebase, deployment, schema migration or production financial-data write occurred.

### T40 implementation status and approval boundaries

1. Add/extend regressions for OWNER/STAFF visibility with all date-filter variants and offset pages; cross-tenant PayrollRecord link isolation; no-side-effect assertions.
2. Complete dashboard allocation integrity: only same-currency Payment/Invoice allocations reduce receivables; expose mismatched/over-allocated records as explicit data-quality warnings; remove silent negative-balance clamping. Preserve the existing aging warning behavior.
3. Implement historical as-of receivables only where persisted allocation/credit event timestamps support the requested cutoff; otherwise return an explicit unavailable basis, not an approximation from current allocations.
4. Keep credit-note tax/reversal, supplier AP/payment, inventory valuation/COGS, FX conversion and GL posting deferred.
5. Reconcile the two commits behind main after reviewing their changes, then exact-SHA validation through an authorized non-CircleCI runner and independent review. Keep Draft/unmerged.


## Candidate allocation integrity and historical as-of implementation — T37 NOT APPROVED (2026-10-30)

The following changes are present on PR #304 as candidate code only. They do not have T37 approval and are not eligible for merge/release. This section records source state, not accepted accounting policy.

### Implemented

- Dashboard outstanding balances are calculated as-of the selected report end date (or business-local today), not as a period-only invoice cohort.
- Only allocations with the same business, non-null matching customer and matching currency reduce an invoice balance.
- Payment-level over-allocation is detected using all allocation events created before the as-of cutoff; every allocation from an over-allocated payment is excluded from receivables.
- Invoice-level over-allocation is surfaced as a data-quality warning and excluded from positive receivable totals; negative balances are not clamped.
- Currency/customer mismatches, missing invoice issue timestamps, payment-level excess and invoice-level excess are exposed in data_quality_warnings.
- Receivables aging is now explicitly historical-as-of: issued invoices must have Invoice.issue_date before the business-local cutoff; allocations count only when PaymentAllocation.created_at is before that cutoff. Missing invoice issue dates are warnings and excluded. Due dates are converted to the business-local date.
- Credit applications/credit notes remain excluded until their separate source-event and tax/receivable contract is approved and implemented.

### Additional commits (all [skip ci])

- `2527a090f05429a934babb7fe3b3bfcdc866c3a9` — dashboard valid allocation/customer/currency matching and integrity warnings.
- `a0efc44a582e7b3d5ce47d1f723ee6aeeb8852ea` — historical receivables as-of using invoice issue and allocation creation timestamps.
- `f74feefb994be23b2460d47fa6fb82e96364501c` — dashboard invalid-allocation and historical as-of tests.
- `8dfbe51b2b7a22dd87e9e9b4a97a919daa03cad6` — existing reconciliation fixtures now use real matching customer references and allocation event dates.
- `3cee40e8ccd1d4abb2fb72bf9958c20d303fe0eb` — dashboard outstanding cutoff date and period-end basis.
- `476c8978d380a30b7a3b4f292f29e0eb48fa74a7` — missing invoice issue-date warnings.
- `c0a555896dd122039d880072ef4134a40db14ddf` — dashboard payment-level over-allocation detection/exclusion.
- `6c163eabbeb6cdab0a48a2045eae1576801c553c` — payment-level over-allocation detection in historical aging.
- `e9ed52816469cf439b1b66b92bf04c97b011617b` — payment-level over-allocation regression across dashboard and aging.

### Updated regression inventory

- T40 date-boundary tests: 14.
- T40 report-reconciliation tests: 10 (7 prior + 3 new allocation/as-of cases).
- Payroll privacy integration regressions: 2 (broad-surface visibility + date-filter/offset/no-side-effect matrix).
- Related existing suites: 26.
- Total targeted/authored tests: **26 + 26 related**; all **NOT RUN**.

### Current delivery evidence

- PR #304 head at the time of this section's update: `719351f2244ee3f79dde9e7b88450f2333beec47`; subsequent TASKS.md-only sync commits are reflected in live PR metadata and the canonical T40 Notion page.
- Live main: `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`; compare 70 ahead / 2 behind; branch remains diverged from merge base `c464398e0a6ace77eba32aabfbdbd09091f53999`.
- PR #304 OPEN / DRAFT / UNMERGED; GitHub reports mergeable=true. Exact-head status has no contexts due [skip ci]; empty status is NOT a pass.
- CircleCI remains prohibited; no run/retry. Desktop Commander is OFFLINE. No authorized runner; tests/build/PostgreSQL/browser/security checks NOT RUN.
- No merge, rebase, deployment, production migration or production financial-data mutation.

### Remaining T40 work

1. The STAFF/OWNER date-filter × offset-pagination and denied-path no-side-effect matrix is now authored; execute it when an authorized runner is available.
2. The two commits behind live main were reviewed as TASKS.md-only changes and applicable content was ported. Git ancestry remains diverged and GitHub reports mergeable_state=dirty; do not merge/rebase shared history without explicit authorization.
3. Expense settlement/disbursement and cashbox lifecycle design is complete in docs/EXPENSE_SETTLEMENT_CASHBOX_DESIGN.md. Schema/API implementation is BLOCKED until Master coordinates migration numbering/ancestry with PR #312 (which already introduces migrations 0006–0011); do not create a competing Alembic head.
4. Keep statutory tax/ETA, credit-note tax/reversal, supplier AP/payment, inventory valuation/COGS, FX and GL deferred.
5. Obtain an authorized non-CircleCI runner and execute all 26 targeted + 26 related tests, PostgreSQL integration, build and security checks on the exact SHA; obtain independent review before any readiness decision.

## CURRENT WORKSTREAM AUTHORITY — T37 v1.0.1 (2026-10-30)

- The canonical T37 page records **T37 v1.0.1 — Product-Owner APPROVED** for the bounded operational policy set. Earlier statements in this document that T37 was still Draft/NOT APPROVED or that its approval was absent are historical and superseded by the final T37 authority note and OWNER DECISION comment.
- Approved and source-implemented on PR #304: payroll-linked Expense privacy (OWNER-only; STAFF ordinary expenses), business-local date boundaries, same-business/customer/currency allocation validation, payment/invoice over-allocation warnings, and historical receivables as-of using persisted invoice/allocation event timestamps.
- T37 v1.0.1 also approves incurred-vs-approved-vs-settled expense separation and the cash settlement/disbursement source boundary. The missing settlement/cashbox schema/API is designed in docs/EXPENSE_SETTLEMENT_CASHBOX_DESIGN.md but not implemented; migration-chain conflict with PR #312 must be coordinated first.
- PR #304 remains OPEN / DRAFT / UNMERGED because exact-head tests/build/security are NOT RUN and the branch is diverged 87+ commits / 2 behind main with mergeable_state=dirty. The current exact SHA must be read from live GitHub PR metadata; earlier snapshots are historical. Do not merge/rebase without explicit authorization.
- 26 targeted T40/integration tests + 26 related tests are authored/source-reviewed only and **NOT RUN**. Build/PostgreSQL/browser/security checks NOT RUN. CircleCI execution/retries are prohibited; no authorized local runner (Desktop Commander OFFLINE).
- Production Web/API deployments are READY on main d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f, but API runtime has 6 UndefinedTable exceptions for employees/payroll_records; migration 0005 application is NOT VERIFIED. No production SQL/migration/backup/restore/deployment was performed.
