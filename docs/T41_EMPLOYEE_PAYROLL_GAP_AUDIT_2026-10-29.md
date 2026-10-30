# T41 — Employees & Payroll Gap Audit (2026-10-29)

## Baseline
- Repository: AbdullahOmaar/ai-business-assistant
- Main SHA inspected: c464398e0a6ace77eba32aabfbdbd09091f53999
- Existing employee/payroll implementation: backend/app/employee_payroll_api.py, backend/app/models.py, backend/migrations/versions/0005_employee_payroll.py, frontend/src/app/employee-payroll.component.ts, backend/tests/test_employee_payroll_api.py.
- Current status: PARTIALLY COMPLETE. This audit does not claim the feature is complete.

## Confirmed existing behavior
- Business-scoped employee CRUD with duplicate email/code checks and audit events.
- Server-side Decimal payroll calculation with ROUND_HALF_UP.
- Payroll states currently constrained to draft, approved, paid.
- Payroll expense is created when an approved payroll record is marked paid.
- Payroll endpoints are restricted to business OWNER membership; tests cover STAFF/non-member denial and no-side-effect assertions.
- One payroll record per employee/business/period and at most one linked expense per payroll record are enforced by database constraints.

## Confirmed gaps / acceptance work
1. Salary is stored as a mutable monthly_salary on Employee; effective-dated salary history is not represented in migration 0005.
2. Payroll schema only permits draft/approved/paid. Explicit failed, partially paid, reversed/corrected states and payment attempt/retry semantics are not represented in the current schema.
3. No separate versioned payslip snapshot/history was confirmed in the inspected schema/API.
4. Existing tests show key authorization denials, but effective-date boundaries, payment failure/retry, reversal, concurrency/idempotency and payroll-to-expense reconciliation need dedicated coverage.
5. Leave/termination settlement and proration should not be invented without an approved policy/source-of-truth contract.

## Implementation sequence
1. Confirm T40's approved expense-posting contract and Master approval for any shared financial-model changes.
2. Add effective-dated salary/contract history with business/employee composite constraints, overlap prevention, audit events, and a safe migration/backfill from existing monthly_salary.
3. Select the effective salary for the payroll period and preserve a reproducible calculation snapshot; do not silently rewrite existing approved/paid runs.
4. Define explicit payment-attempt/failure/reversal semantics before widening status constraints; make payment and expense posting idempotent and transaction-safe.
5. Add versioned payslip snapshot/history and owner-only access controls.
6. Add API/database tests for dates, invalid values, duplicate/replayed requests, failed retries, correction/reversal, tenant isolation, privacy, and source-to-expense reconciliation.
7. Run backend tests, frontend tests/build, migration checks, and CircleCI on the exact PR head. Do not merge or deploy from this feature agent.

## Risks and decisions
- Migration must preserve existing employee salary and historical payroll amounts.
- No legal/tax rules are assumed.
- Payroll details must not appear in broad STAFF reports, AI chat context, or unnecessary logs.
- No shared expense/accounting semantics are redefined by T41.
- Local tests/build are NOT RUN in this connector-only execution environment; CI evidence is required before VERIFIED COMPLETE.

## Handoff
- Branch created: feat/t41-salary-history-effective-dates
- No runtime code changed in this audit commit.
- Next action: implement the effective-dated salary history and reproducible payroll snapshot only after confirming the exact existing migration chain and T40 posting contract, then validate via exact-head CI.


## Dependency gate re-check (2026-10-29)
- Master Task Plan T37 record currently shows **Not started**: https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd
- T40 record currently shows **In progress** and explicitly says implementation waits for Master-approved source-event/cost contracts: https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30
- Therefore, do not implement payroll expense posting or shared financial-model/migration changes yet. Continue safe discovery/spec/test design only until Master approves the shared contract and permission model.
- Notion data-source SQL/rows query allowance was exhausted during the second task lookup; the error says retry later or use the offered Business trial option. Direct fetch of the known T37 and T40 pages succeeded, so their displayed statuses above are based on those page records.
- Next unblock owner: Master — Product & Release, to approve T37 shared financial contracts and confirm the T40 payroll posting integration contract. After approval, Chat 4 implements effective-dated salary history and calculation snapshots on this branch.

## Safe test-design checkpoint (2026-10-29)
This section is test design only; it does not change runtime behavior or authorize a schema/financial-contract decision.

### Salary history and calculation snapshot cases to implement after T37/T40 approval
- Effective-date selection: salary beginning on period start; salary ending at the boundary; mid-period salary change; no matching salary record; future-dated salary; inactive/terminated employee.
- Interval integrity: reject start >= end; reject overlapping periods for the same employee/business; permit adjacent non-overlapping periods; prove business A cannot read or attach business B's salary row.
- Backfill: every legacy employee gets a deterministic history representation without guessing the real-world start date; migration must preserve current monthly_salary and existing payroll base_salary/net_pay for all existing rows; downgrade behavior must be explicitly reviewed before migration.
- Snapshot reproducibility: calculation inputs, currency, rounding-policy version and selected salary-history ID are frozen for a payroll run; changing salary later cannot mutate existing approved/paid runs or their payslip snapshot.
- Financial boundaries: draft/approval/payment transitions follow the Master-approved state contract; duplicate/replayed payment requests produce one payment effect and one expense posting; failed attempt does not mark paid; reversal/correction is auditable and reconciles to the approved expense/reporting contract.
- Security/no-side-effects: STAFF and non-members cannot read salary/payslip/payment details or mutate payroll; denied requests leave payroll, expense, and audit state unchanged except where the approved audit policy explicitly requires a denial event.
- Reconciliation: synthetic scenarios reconcile payroll totals to the single linked expense by currency and period; no cross-currency aggregation; invalid/negative inputs and precision boundaries are rejected or rounded only per the approved money contract.

### Decisions that must be recorded by Master before implementation
1. The authoritative salary effective-date convention and the legacy backfill start date/meaning (do not infer employment start date).
2. Whether salary periods are half-open [start, end), and how mid-month changes are prorated (default is no proration until explicitly approved).
3. T40-approved source-event/expense contract for payroll paid, retry, correction and reversal.
4. Shared idempotency key, transaction boundary, audit metadata and OWNER/STAFF permission contract.
5. Whether calculation snapshots are immutable JSON, normalized rows, or both, and how snapshot schema versions are retained.

### Current verification checkpoint
- Source review: 0005_employee_payroll.py confirms revision 0005_employee_payroll follows 0004_platform_user_roles; this single migration alone does not establish full-chain upgrade/downgrade safety.
- Existing API test file contains employee CRUD, duplicate checks and role-denial coverage, but new cases above are not implemented or executed.
- Local pytest, migration upgrade/downgrade, frontend tests/build and local security checks: NOT RUN in this connector-only session.
- No runtime files changed; the shared-contract gate remains active.

## Additional feature-quality workstreams — 2026-10-30

Five test-only workstreams were added to the existing T41 branch and tracked as tasks 21–25 in TASKS.md:

1. Employee update duplicate code/email rejection with no employee or audit side effects.
2. Employee directory stable pagination and active-only filtering.
3. Payroll period filtering and deterministic pagination.
4. Payroll approval separation-of-duties and repeated-approval idempotency guard.
5. Payment transaction rollback when the paid-audit write fails, proving no expense or paid transition is committed.

Evidence: five regressions in backend/tests/test_employee_payroll_api.py, initial commit 0f346eaf7fe77465490330fbc529e1a087bd8324; approval timestamp assertion made timezone-robust in 85fbcfe8c41fc68bbaddd63b369d2a035fb16989. These are test additions, not implementation of new runtime behavior. Execution is NOT RUN on the latest HEAD. The SQLite fixture is not evidence for PostgreSQL concurrency or production transaction behavior. Existing T37/T40 approval gates remain unchanged; no merge or deployment performed.


## Additional five-workstream integrity batch — 2026-10-30

On the existing T41 branch / PR #308, added test-only regressions for:
- Expense insert failure during payroll payment: transaction rollback leaves the record approved/unpaid, with no expense or paid audit event.
- Paid payroll immutability: post-payment edit and payment replay are rejected without changing amounts, expense linkage, or audit lifecycle.
- Salary snapshot stability: a later employee salary update does not rewrite a previously created payroll record; subsequent payroll uses the new current salary.
- Payroll listing tenant isolation: the second business cannot see the first business's payroll rows.
- Invalid employee update atomicity: empty/whitespace/null profile updates are rejected without changing employee or audit state.

Implementation evidence: commit `1daf5f9f73de2ecd1bbe5674bda5a4c23f28d355` in `backend/tests/test_employee_payroll_api.py`; task record updated separately in `TASKS.md`. These are regression tests only; runtime/schema/financial-policy behavior was not changed. Tests are NOT RUN on the latest HEAD. The existing SQLite fixture does not establish PostgreSQL concurrency guarantees. T37/T40 contract gates remain active; no merge or deployment.


## Regression refinement — 2026-10-30

The tenant-isolation regression now creates payroll records in both businesses and checks that each listing returns only the matching record ID and business_id. The invalid employee-update regression additionally checks persisted database fields, not only the response payload, and confirms no audit event was added. The foreign employee is created through the foreign business endpoint to avoid reusing a fixture helper scoped to the primary business. Commits: `babbe6c282372d350963f4955a59de345cfe7deb`, `bc7462416c5043cd9d0dd96821cbbde0fa3ec451`. Tests remain NOT RUN pending a usable runner; current CircleCI jobs are blocked before execution by the no-credits plan limit. No runtime behavior, schema, or payroll policy changed.


## Cross-feature payroll privacy finding — 2026-10-30

### Source evidence (static review; runtime exploit test NOT RUN)

Reviewed `backend/app/employee_payroll_api.py` (PR branch blob `6efccc6632d01a8ab8f138017d95af0b402e481b`) and `backend/app/extended_api.py` on main (source reviewed at main SHA `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`). The employee/payroll API applies OWNER-only membership checks to employee and payroll routes. The generic extended API uses `_authorized(..., owner_only=False)` by default, which calls `authorize_membership(..., allowed_roles=None)` and therefore allows ordinary business members unless a route explicitly opts into OWNER-only access.

When `POST /api/v1/businesses/{business_id}/payroll/{payroll_id}/pay` succeeds, it creates an Expense with:
- `category="Payroll"`
- `description="Payroll payment — {employee.name} — {period}"`
- `amount=record.net_pay`
- `vendor_name=employee.name`
- `reference="payroll:{record.id}"`

The same payroll action changes the PayrollRecord to `paid` and links `expense_id`. The following generic member-readable surfaces currently include this data:
- `GET /expenses` returns description, amount, vendor_name and reference for every business expense.
- `GET /reports/summary` returns expenses_by_currency count and total, including payroll expenses.
- `GET /assistant/insights` returns expenses_by_currency count and total, including payroll expenses.

The CSV `GET /exports/{entity_type}.csv` route explicitly requests OWNER-only authorization; it is not the same exposure path in this review. The finding is that STAFF access to the generic expenses list can disclose the employee name, net salary and payroll reference, while summary/insights disclose aggregate payroll expense totals/counts. This is source-level evidence; an authenticated runtime STAFF request has NOT RUN.

### Required policy-independent follow-up

1. Master/T37 must decide whether STAFF may read ordinary expenses while Payroll-category rows and payroll-derived aggregates remain restricted/redacted, or whether the broader expense surfaces are OWNER-only. Do not silently choose a policy in T41.
2. T37's route × role × action matrix must include `GET /expenses`, `GET /reports/summary`, `GET /assistant/insights`, CSV export, pagination, and any future expense detail/report/chat surfaces.
3. After the policy is approved, add positive OWNER and negative STAFF/non-member regressions. Seed one Payroll expense containing a synthetic employee name, unique net amount and payroll reference plus an ordinary expense. Assert STAFF cannot recover the sensitive payroll row/fields or payroll-only aggregate, while the approved ordinary-expense behavior remains intact; OWNER retains the authorized payroll view. Include no-side-effect assertions and tenant isolation.
4. Verify all surfaces from API responses and any frontend/AI context consumer; do not infer privacy from OWNER-only payroll routes alone.

### Gate and status

- Status: SECURITY FINDING / POLICY DECISION REQUIRED; implementation BLOCKED by T37 shared authorization contract.
- No runtime, schema, permission, report formula, or financial lifecycle changes were made.
- Static source review only. Runtime exploit/regression test, full route-role matrix, frontend/AI consumer review, and exact-head CI are NOT RUN.
- Preserve existing PR #308 and its Draft/Open/Unmerged state. No merge or deployment.

### Frontend exposure confirmed

The STAFF-facing application navigation includes the Expenses tab without an OWNER-only condition. The expense tab renders each returned expense's category, amount, description, vendor_name and reference. `ApiService.expenses()` calls the member-readable `GET /expenses` endpoint. Therefore, this is not merely an API-only theoretical path: a STAFF user who opens Expenses can see payroll employee name, net pay and payroll reference in the normal UI. By contrast, the Employees & Payroll navigation/component is OWNER-gated in `app.component.ts`, and the payroll component's own explanatory text says salary data is owner-only. The generic expense list contradicts that privacy promise.

Reviewed frontend sources:
- `frontend/src/app/app.component.ts` (Expenses tab and employee/payroll OWNER gate; expense list renders description/vendor/reference).
- `frontend/src/app/api.service.ts` (`expenses()` calls the business `/expenses?limit=100&offset=0` endpoint).
- `frontend/src/app/employee-payroll.component.ts` (payroll UI text states salary data is restricted to workspace owners).

This frontend review confirms the presentation path statically. An authenticated STAFF browser session, API response capture and UI smoke test are still NOT RUN.


## Payroll-derived expense privacy remediation — 2026-10-30

**Implementation candidate on this existing T41 branch (not yet runtime-verified):**
- The privacy boundary uses the authoritative PayrollRecord.expense_id relationship, not mutable Expense category/description text.
- Added a shared query helper in backend/app/security.py; OWNER keeps full visibility, while STAFF/member read surfaces exclude payroll-linked Expense rows.
- Applied to GET /expenses, report summary, deterministic assistant insights, dashboard expenses, profit/loss expense totals, the internal financial_summary helper, and the AI chat's recent-expense context before it is sent to the external provider or used by local fallback.
- CSV expense export was already OWNER-only. Employee/payroll endpoints remain OWNER-only.
- Added test_staff_cannot_read_payroll_expense_through_broad_surfaces to create a paid payroll and a normal expense, then verify STAFF sees the normal expense but not employee name/net pay/payroll reference across list, summary, dashboard, P&L, deterministic insights and AI chat. The test also verifies OWNER retains payroll expense visibility and aggregate totals.
- No migration, stored row, payroll state, posting calculation, expense amount, or OWNER report semantics changed. No shared financial contract was redefined.

**Verification:** authored and source-reviewed only; pytest, full backend suite, PostgreSQL, frontend build, browser E2E and security scans remain NOT RUN. Do not mark this privacy fix VERIFIED until exact-head tests and independent security review pass.

## Exact-head source and cross-PR integration review — 2026-10-30 02:55 UTC

**Review basis:** PR #308 live metadata at the start of this review: `b35ce019a4de19d32750bea15261757a51482077` (OPEN / DRAFT / UNMERGED; base SHA `c464398e0a6ace77eba32aabfbdbd09091f53999`; main checkpoint `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`; 78 commits ahead / 2 behind; GitHub reports mergeable=true). No review submissions were present in the fetched PR metadata. This is a static source review, not runtime verification.

### Source findings revalidated

- `backend/app/security.py`: `apply_expense_visibility` uses `PayrollRecord.expense_id` scoped to the same business; it does not infer sensitivity from mutable category/description text.
- PR #308 applies the predicate to the expense list **after business scoping and before ordering/offset/limit**, report-summary and dashboard aggregates, P&L expense totals, deterministic assistant insights, `operations.financial_summary`, and the recent-expense context assembled by `assistant_api` before either provider or local fallback. CSV remains OWNER-only.
- `backend/app/employee_payroll_api.py`: employee/payroll endpoints remain OWNER-only. Payroll payment currently locks the approved record, creates one linked Expense, sets status to paid, and writes the audit event in the same transaction. This is not evidence of a cash-disbursement/Payment record.
- `backend/app/models.py` and migration `0005_employee_payroll`: Employee has mutable `monthly_salary`; PayrollRecord snapshots base salary/allowances/bonuses/deductions/net pay and stores a unique expense link. Status constraint is only `draft/approved/paid`. No effective-dated salary/contract history table, linked Payment ID, or failed/partial/reversed/corrected lifecycle was found in this migration/model slice.
- `backend/tests/test_employee_payroll_api.py`: privacy regression is authored and asserts STAFF ordinary-expense visibility, payroll-linked row/aggregate redaction across broad read surfaces, CSV denial, and OWNER positive access. It is **NOT RUN** on the reviewed head. It disables the provider key and therefore does not execute a provider-backed request/payload assertion.
- Remaining privacy test gaps: explicit cross-tenant assertions on the broad expense/report/chat surfaces; provider-backed payload capture proving payroll fields are absent before outbound request; pagination-boundary checks where payroll rows would otherwise occupy a page; and no-side-effect assertions for denied export/read paths. Existing general payroll API tenant tests do not substitute for these specific surface-level cases.

### Cross-PR integration gate — T40 PR #304

Live PR #304 is OPEN / DRAFT / UNMERGED on `task/t40-fin-report-003-current-main-20261029`, head `c46370a64ddb157a621a7de44084d070835875c2`. Its current `backend/app/extended_api.py` expense handler adds business-timezone date filters and deterministic ordering, but the exact-head source does **not** import or call `apply_expense_visibility`. The current PR #308 version does. This is a confirmed integration conflict, not a hypothetical risk.

Before PR #304 is reconciled or merged, preserve the T41 visibility predicate in its date-filtered expense statement after `Expense.business_id == business_id` and before ordering/offset/limit. The existing GitHub handoff comment on PR #304 records this requirement. No edits were made to PR #304.

### Decisions and verification gates unchanged

- T37 remains PARTIALLY COMPLETE / NOT APPROVED; no versioned role/permission decision authorizes the STAFF payroll-visibility candidate. T40 payroll expense vs settled/cash-disbursement semantics also remain unapproved. No salary-history schema/backfill, shared permission change, payroll payout/payment, expense-posting or reversal lifecycle implementation is authorized by this review.
- Current-head tests/build/security/browser/migration checks: NOT RUN. Historical passing tests are not evidence for this head. CircleCI execution/retry is prohibited by the current Operating Model; no retry was attempted. No GitHub Actions replacement CI was introduced.
- No runtime source, schema, migration, financial data, permissions, merge or deployment changed in this review.

**Next independent action:** once an authorized non-CircleCI runner and disposable PostgreSQL target are available, run the focused suite and concurrency test on the then-current exact SHA; before that, keep the PR Draft and reconcile the PR #304 expense-handler integration conflict.