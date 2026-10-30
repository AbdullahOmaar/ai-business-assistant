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

## Master decision — T41 payroll privacy and bounded payroll invariants — 2026-10-30

**Owner authority:** the Product Owner explicitly delegated the policy choices to the active Master role and approved the recommendations. The following is a narrow Master decision, not blanket approval of T37.

### AUTH-T41 v1.0 — APPROVED

- OWNER-only: employee management/sensitive employee data, salary and salary history, payroll runs/calculations, payslips, approval/payment actions and payment references.
- STAFF/non-OWNER: no employee/payroll endpoint or salary/payslip/payment-reference access. Existing ordinary-expense access remains.
- Payroll-linked Expense rows and payroll-derived aggregates/counts are OWNER-only across expense lists, dashboards, reports/P&L, insights, internal summaries, AI/provider context and exports. CSV remains OWNER-only.
- Enforce server-side from authoritative `PayrollRecord.expense_id`, after business/tenant scoping and before pagination, aggregation, serialization or outbound AI context. OWNER retains full visibility; cross-tenant access is denied; no new role privileges are granted.
- This decision authorizes the narrow privacy/security implementation and regression work. It does not approve unrelated accounting formulas, shared money/currency/rounding/tax/refund/COGS rules, expense posting, payment lifecycle, production migrations, merge or deployment.

### Salary-history design direction — Master-approved technical constraints; financial calculation still gated

- Effective intervals are `[effective_from, effective_to)`; no overlapping intervals per employee.
- Salary revisions and payroll calculation snapshots are immutable/auditable; do not overwrite history.
- Retroactive salary changes must not silently recalculate approved/paid payroll. Use a separately audited adjustment/correction path.
- If a payroll period intersects multiple salary revisions, do not invent automatic proration; block calculation until a qualified accountant-approved rule exists.
- Schema/backfill implementation remains gated pending qualified accounting review and approved legacy baseline/provenance handling.

### Payment/expense direction — application invariant approved; accounting details deferred

- Approved payroll is not paid payroll. Creating an Expense is not evidence of cash disbursement.
- A payroll record must not become paid solely because an Expense row was created. A future paid transition requires an explicit, uniquely linked, idempotent payment/disbursement record.
- A manually entered payment is labelled recorded, not bank/provider-confirmed absent external confirmation.
- Expense recognition timing, account mapping, partial/failed/reversed lifecycle, journal posting and reconciliation remain DEFERRED pending qualified accountant/controller review and T37/T40/T44 alignment. No Payment schema or lifecycle implementation is authorized by this decision.

### Current release gates

- PR #308 remains OPEN/DRAFT/UNMERGED. Exact current branch head before this decision: `f89380722efb580be79a2d46013df7f29a3e3f9c`; main: `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`; branch 80 ahead / 2 behind.
- T40 PR #304 current head: `2a05f19ad608bdbdad5586f7927796ad244ed152`; its `GET /expenses` handler still lacks the approved predicate. Chat 3 retains ownership and must integrate on the existing PR #304 branch, preserving business-local date filters and deterministic pagination.
- Tests/build/security/migration/browser checks remain NOT RUN on current exact heads. No status contexts on current docs heads is NOT a pass. CircleCI is prohibited; no retries. No merge/deployment/production migration/write.
- Qualified accountant/controller is not currently staffed per Agent Registry; this remains a real blocker for financial semantics, not for the approved privacy slice.


## T37 v1.0.1 authoritative alignment correction — 2026-10-30

The later canonical T37 v1.0.1 decision supersedes earlier notes in this document that described the entire bounded contract as unapproved or treated salary interval/payment-schema suggestions as approved.

- T37 v1.0.1 is APPROVED by Product Owner for the bounded operational policy set; T37 overall remains PARTIALLY COMPLETE, not VERIFIED COMPLETE. See canonical T37 current authority/supersession note.
- T41 privacy policy is approved: OWNER-only employee/payroll sensitive data and payroll-linked Expense rows/aggregates; STAFF retains ordinary expense access; enforce server-side using business-scoped `PayrollRecord.expense_id` before pagination/aggregation/AI context; CSV and employee/payroll management OWNER-only; cross-tenant denial.
- Payroll payout contract: approved payroll is not paid; exactly one linked Expense is created atomically on explicit recorded paid/payout transition with source state and audit; exact retries cannot duplicate effects. Source review of `pay_payroll` confirms row lock on approved unpaid PayrollRecord, one linked Expense, status/paid_at/paid_by_subject update, `payroll.paid` audit, and commit/rollback through `_commit`. This is recorded in-app payout, not external bank/provider confirmation. Do not add a separate Payment schema or new payout states under the bounded contract.
- Salary effective-date/backfill/proration and failed/partial/reversed/corrected payout lifecycle are explicitly DEFERRED by T37 v1.0.1. The earlier `[effective_from, effective_to)` interval suggestion is not approved. No salary-history schema/backfill or automatic proration until a separate versioned decision and qualified accountant/controller review.
- Expense recognition/account mapping, statutory tax/ETA, supplier AP, inventory valuation/COGS, FX, GL/journal and reconciliation remain deferred. T40 owns the report mapping of incurred expenses vs recorded/settled cash outflow.
- PR #304 current head remains `2a05f19ad608bdbdad5586f7927796ad244ed152` and its `GET /expenses` handler still lacks the approved predicate. Chat 3 owns integration on the existing PR #304 branch; T41 does not edit that branch.
- No tests/build/security/migration/browser checks were run. CircleCI prohibited; no retries. No merge/deployment/production migration/write.


## T40 integration completion — latest live source checkpoint — 2026-10-30

- T40 PR #304 advanced to `6cfb8155f12e42ee6719226af49e9f9b5b34406d` on its existing branch. This supersedes the earlier statement in this audit that PR #304's `GET /expenses` lacked the predicate.
- Exact source review confirms `apply_expense_visibility` is now applied in PR #304 across `extended_api.py` (expense list before date filters/order/pagination, report summary and insights), `core_features_api.py` (dashboard/P&L), `assistant_api.py` (chat context), and `operations.py` (internal financial summary). `security.py` uses the authoritative business-scoped `PayrollRecord.expense_id` relation.
- T40 branch also carries `test_staff_cannot_read_payroll_expense_through_broad_surfaces` in `backend/tests/test_employee_payroll_api.py`, covering STAFF first-page behavior, OWNER positives, OWNER-only CSV and business-B ordinary-expense non-suppression.
- PR #304 remains OPEN/DRAFT/UNMERGED, 58 ahead / 2 behind live main `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`; exact-head status has no contexts (NOT a pass). The privacy regression, T40 tests, build, PostgreSQL, browser and security checks remain NOT RUN. CircleCI prohibited; no retry.
- The source-level integration dependency is closed; executable validation and independent security review remain open. No merge/deployment.


## Workstream closeout — 2026-10-30

- T41 reused PR #308 / branch `feat/t41-salary-history-effective-dates`; no duplicate branch/PR. Current source-level scope is limited to employee/payroll baseline and the approved payroll privacy boundary. Salary effective-date/history schema, backfill, proration, statutory payroll, advanced payout states and separate Payment schema remain deferred under T37 v1.0.1.
- Added regression coverage in code commit `da6857e9ada1b79d243ca08e12a2e69d1a4f58a2` (file `backend/tests/test_employee_payroll_api.py`): limit=1 proves payroll privacy filtering precedes pagination; mocked provider-backed chat asserts payroll employee name, net pay and reference are absent from the exact outbound provider payload while ordinary expense context remains. Test source only; NOT RUN.
- PR #308 closeout ledger is recorded in TASKS.md. The current PR remains OPEN/DRAFT/UNMERGED; branch is 2 commits behind main; no submitted review, review threads, status contexts or exact-head GitHub Actions PR runs. Empty checks are NOT a pass.
- T40 PR #304 source integration rechecked at head `38ea8c80e1ca4c3d2534ca45ddc731df2b6a35ff`: payroll visibility remains present across expense list, report summary, dashboard/P&L, assistant context and internal summary, and broad privacy regression remains present. Chat 3 owns that PR.
- Exact-head pytest, PostgreSQL concurrency, migration rehearsal, frontend tests/build, authenticated browser smoke, security scan and independent review remain NOT RUN. CircleCI prohibited; Desktop Commander device OFFLINE and no approved non-CircleCI runner found.
- Do not merge: no exact-head checks/review and branch remains 2 behind main. No merge, deployment, production migration or data write. Demo readiness remains blocked for production employee/payroll by migration 0005 restore/rehearsal/schema verification and authenticated UI smoke.


## Final T41 closeout evidence refresh — 2026-10-30

- Existing PR #308 latest head before this documentation checkpoint: `ca6c6cf26d08e508ef3cda7e71fbf42369416aa5`; branch remains OPEN/DRAFT/UNMERGED and 91 ahead / 2 behind main `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`. No reviews/status contexts; no merge.
- The broad privacy regression now covers the first visible expense page when the newer payroll row must be filtered before pagination, and the provider-backed AI chat path with a mocked transport. The exact outbound payload is asserted not to contain employee name, net salary or payroll reference. Test file has 28 functions; all current-head tests remain NOT RUN.
- Duplicate test/import from a concurrent overlapping edit was removed; one consolidated test remains. No runtime/schema/migration behavior changed.
- T40 PR #304 latest observed head `68e2cca2f738c2b266935ed12a71ccb10bb72e7c` remains OPEN/DRAFT/UNMERGED, 79 ahead / 2 behind main, GitHub mergeable=false. Current T40 source still contains the privacy predicate across expenses, report/insights, dashboard/P&L, AI context and internal financial summary. Chat 3 owns that branch; T41 made no changes to it.
- T37 overall remains PARTIALLY COMPLETE / NOT APPROVED; the canonical page separately records bounded Product-Owner-delegated AUTH-T41 privacy approval only. Salary history/backfill/proration, statutory payroll and advanced payout states remain deferred.
- Exact-head runtime tests, PostgreSQL concurrency, migrations, frontend/build, browser, dependency/security scans and independent security review remain NOT RUN. CircleCI prohibited; no new GitHub Actions CI or runs. Desktop Commander offline; no authorized runner.
- Production Employees/Payroll demo is NOT READY: main release checkpoint reports API `UndefinedTable` errors for `employees` / `payroll_records`, and migration `0005_employee_payroll` is not verified as applied/rehearsed. No production migration/write/deploy.
- Next: authorized runner for exact-head validation; safe main-base reconciliation; independent security review; isolated restored-database migration rehearsal.


## Authority supersession — 2026-10-30

This audit contains historical statements that T37 was Draft/NOT APPROVED and that all payroll/expense integration must wait for a general T37 approval. Those statements are superseded by the current Product & Agent Operating Model decision: T37 v1.0.1 is Product-Owner APPROVED for the bounded operational policy set; overall T37 remains PARTIALLY COMPLETE, not VERIFIED COMPLETE.

Approved T41 scope: payroll-sensitive data and payroll-linked Expense rows/aggregates are OWNER-only; STAFF retains ordinary expense access. Payroll Expense linking is exactly once and atomic with the explicit recorded paid/payout transition, payroll state and audit; exact retries cannot duplicate effects. The existing /pay operation means an in-app recorded payout, not external bank/provider confirmation.

Still DEFERRED: salary effective-date/history, backfill, automatic proration, failed/partial/reversed/corrected payout lifecycle, and any expansion of financial posting semantics. Do not implement salary-history schema/backfill or new payout states on the strength of the bounded v1.0.1 approval. Qualified accounting/controller review remains required for deferred domains. No merge, deployment, production migration or production financial write is authorized.

The branch name feat/t41-salary-history-effective-dates is historical and does not authorize implementing salary-history behavior. Current PR #308 is still OPEN/DRAFT/UNMERGED; its exact current head must be refreshed before validation. This addendum is documentation-only. Tests/build/PostgreSQL/browser/security are NOT RUN. [skip ci] was used; no CI was triggered.


## Payroll privacy implementation re-review — 2026-10-30 (Chat 4)

**Outcome: PARTIALLY COMPLETE — source-level privacy implementation reviewed; regression source strengthened; exact-head runtime validation remains NOT RUN.**

### Live baseline and delivery
- Current `main`: `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f` (re-read from the latest GitHub main commit).
- Existing branch: `feat/t41-salary-history-effective-dates`.
- Existing PR: [#308](https://github.com/AbdullahOmaar/ai-business-assistant/pull/308), OPEN / DRAFT / UNMERGED.
- Reviewed pre-change HEAD: `8338f92d2a5cfcc9e8efc039051d693ecbaec34d`.
- Test-only commit: `8e2776e8855c246d25dfa3740b369df501441737` (`test(t41): harden payroll privacy redaction regressions`).
- PR base remains `c464398e0a6ace77eba32aabfbdbd09091f53999`; main is two documentation-only commits ahead of that base. No rebase/merge was attempted.

### Source-level privacy review
- `backend/app/security.py`: `apply_expense_visibility` uses the authoritative `PayrollRecord.expense_id` relation and scopes the subquery to the requested business; non-OWNER queries exclude linked expense IDs; OWNER queries are unchanged.
- `backend/app/extended_api.py`: `GET /expenses` applies the predicate before ordering/offset/limit; `GET /reports/summary` applies it before currency aggregation. Expense CSV remains OWNER-only.
- `backend/app/core_features_api.py`: dashboard expense aggregation and P&L expense aggregation apply the predicate before grouping/summing.
- `backend/app/extended_api.py`: deterministic assistant insights apply the predicate before grouping/counting/summing.
- `backend/app/assistant_api.py`: recent expense records are filtered before limiting, source-record construction, fallback aggregation, and provider payload serialization.
- Internal `financial_summary` integration exists in the current PR source under `backend/app/operations.py`; this file is outside Chat 4's current write allowlist and was not modified in this pass.
- No payroll privacy inference from category, description, or reference strings was found in the shared predicate. The source review found no missing call site among the permitted integration points listed above.

### Regression hardening committed
Only `backend/tests/test_employee_payroll_api.py` changed in this pass. The existing broad-surface privacy regression now:
- Creates a synthetic ordinary expense with misleading mutable metadata (`category=Payroll`, payroll-like description, and `payroll:` reference) but no `PayrollRecord.expense_id` link, and asserts STAFF still sees it.
- Retains the limit=1 ordering case proving linked payroll rows are filtered before pagination.
- Checks the denied STAFF CSV response contains no employee name, net-pay value, or payroll reference.
- Snapshots employee, payroll, expense, and audit row counts before STAFF read/denied-export calls and asserts no side effects.
- Checks captured application logs for absence of employee name, net pay, and payroll ID.
- Retains mocked provider-payload assertions that linked payroll employee identity, net pay, and payroll reference are absent while ordinary expense context remains.
- Retains OWNER positive controls for linked expense detail, aggregate totals and CSV export.
- Existing separate regressions cover cross-business payroll IDs returning 404 without state changes and payroll listings remaining business-scoped.

The test source remains 28 test functions. A Python `compile()` syntax check of the modified test source passed in the source-review workbench; this is not pytest execution.

### T40 overlap / single-writer boundary
- Live PR #304 is OPEN / DRAFT / UNMERGED at HEAD `7fcb24526e768949c87c6a0538115510f4c802a1`, base `c464398e0a6ace77eba32aabfbdbd09091f53999`, `mergeable=false` / `dirty`.
- PR #304 overlaps T41 on `backend/app/security.py`, `backend/app/extended_api.py`, `backend/app/core_features_api.py`, `backend/app/assistant_api.py`, `backend/app/operations.py`, and `backend/tests/test_employee_payroll_api.py`.
- Chat 4 remains the primary writer for the approved payroll-visibility integration boundary. Chat 3 must not edit these overlapping files until a recorded handoff changes ownership. This pass changed only the T41 test file on PR #308; no T40 branch was changed.

### Validation and gates
- Exact-head pytest, full backend suite, PostgreSQL concurrency, frontend checks, migration rehearsal, provider integration, and independent security review: **NOT RUN**.
- Desktop Commander device recheck: OFFLINE (last seen 1143 hours ago); no authorized local Git/test runner is available in this session.
- CircleCI remains frozen by owner instruction; no trigger/retry/rerun. No GitHub Actions replacement CI was introduced or run.
- Exact-head empty status contexts remain NOT PASS. No merge, deployment, production DB operation, migration, schema change, payroll calculation, or payout lifecycle change was made.
- Salary effective-date/history schema, backfill, proration/statutory rules, and failed/partial/reversed/corrected payout lifecycle remain deferred.

**Next action for Master:** obtain an authorized non-CircleCI exact-SHA runner, run the focused payroll privacy regression and relevant backend/PostgreSQL checks on the updated PR #308 HEAD, then obtain independent security review and reconcile the two main-only documentation commits without changing shared-file ownership. Keep PR #308 Draft/Open/Unmerged until all gates are satisfied.

## PostgreSQL recorded-payout concurrency regression — 2026-10-30

- Added T41-unique regression `test_concurrent_payroll_payment_records_one_expense_and_paid_audit` to `backend/tests/test_postgres_financial_concurrency.py` on the existing PR #308 branch.
- The test creates a payroll draft under one OWNER, approves it under a different OWNER (preserving creator/approver separation), then races two recorded `/pay` requests against the same approved PayrollRecord using two concurrent TestClient requests.
- Expected evidence when executed: exactly one HTTP 200 and one HTTP 409; one paid PayrollRecord with one linked Expense; expense amount/reference match the payroll record; exactly one `payroll.paid` audit event alongside one created and one approved event. This is recorded in-app payout behavior only, not external bank/provider confirmation.
- Commits: `5fd16b911e9f1bb1b98f07cfa63846771f29173e` (initial test) and `3e751a9188df70faa135da3f3a2af5f03c2d0ba8` (assert no orphan duplicate Expense rows); both test-only and include `[skip ci]`.
- A Python AST syntax check of the new function passed. PostgreSQL execution remains **NOT RUN**: it requires `CI_ALLOW_DATABASE_SCHEMA_TESTS=true` and an authorized disposable PostgreSQL `TEST_DATABASE_URL`. CircleCI remains frozen; no retry or replacement CI was triggered.
- No runtime code, schema, migration, financial formula, payout state, production data, merge or deployment changed.

## Fresh source inventory and UI boundary review — 2026-10-30 (Chat 4 @n)

Static source review against the existing T41 branch. This is source inspection, not runtime verification. Blob SHAs are intentionally omitted here; the exact branch/commit is recorded in the T41 task and PR.

### Route / model / migration / UI inventory

- `backend/app/employee_payroll_api.py`: OWNER-only employee and payroll management routes. Source includes employee normalization and business-scoped duplicate checks; deterministic employee listing; active filtering; payroll period filtering and pagination; creator/approver separation; and row-locked recorded `/pay` transaction.
- `backend/app/models.py`: business-scoped employee/payroll relations, per-business employee code/email uniqueness, employee-period payroll uniqueness, unique payroll expense linkage, positive/nonnegative amount checks and status constraint.
- `backend/migrations/versions/0005_employee_payroll.py`: revision `0005_employee_payroll` follows `0004_platform_user_roles`; creates employee/payroll tables and constraints. No effective-dated salary-history or payslip-version table is present. Status constraint is limited to draft/approved/paid.
- `backend/app/security.py`: non-OWNER expense visibility uses the business-scoped `PayrollRecord.expense_id` relation; OWNER query is unchanged.
- `backend/tests/test_employee_payroll_api.py`: source inventory contains 28 test functions covering employee normalization/duplicate updates, active filtering and deterministic pagination, payroll period filtering/pagination, tenant isolation, approval separation/replay, payment rollback/immutability and broad payroll privacy surfaces.
- `backend/tests/test_postgres_financial_concurrency.py`: contains T41-specific concurrent same-employee/period creation and concurrent recorded `/pay` regressions. Runtime requires explicit opt-in and a disposable PostgreSQL `TEST_DATABASE_URL`.
- `frontend/src/app/employee-payroll.component.ts`: Arabic/English RTL/LTR employee and payroll workflow. UI wording reports payment as recorded and linked to one Payroll expense, not a bank/provider confirmation.
- `frontend/src/app/api.service.ts`: employee and payroll reads hardcode `limit=200&offset=0`; the component loads a single result page and provides local search/filtering, with no next/previous page controls or total-count handling.

### Additional UI finding

The backend supports deterministic offset/limit pagination, but the current UI API client requests only the first 200 employees and first 200 payroll rows. The inspected component does not expose page navigation or total-count handling. Records beyond the first 200 are therefore not reachable through this screen. This is a source-level usability gap, not a test failure. No UI changes were made because the current Master handoff prioritizes T41-unique tests/docs and prohibits scope expansion into shared files without coordination.

### Recorded payout boundary

The `/pay` endpoint locks the PayrollRecord, accepts only approved/unpaid records, creates one linked Expense, changes the record to paid, and writes the paid audit event in the same database transaction. The UI success message says the payment was recorded and linked. This is an in-app recorded-paid operation only; no bank transfer/provider confirmation or separate cash-disbursement record is evidenced by this implementation. Do not describe it as an external transfer.

### Validation and production evidence boundary

- Source review above: COMPLETE for the listed branch files.
- API test source inventory: 28 test functions; PostgreSQL concurrency source includes T41 creation and payout race cases.
- Python AST syntax check for the newly added payout concurrency test: PASS (syntax only).
- Focused pytest, PostgreSQL runtime, full backend suite, frontend tests/build, browser E2E, migration rehearsal and independent security review: NOT RUN.
- Latest Master production checkpoint reports Neon default main at revision `0005_employee_payroll` with employee/payroll tables present; Chat 4 did not independently query Neon. Isolated restored-database migration rehearsal remains NOT VERIFIED and authenticated employee/payroll E2E remains NOT RUN.
- No runtime code, schema, migration, financial rule, permissions, shared T40 file, production data, merge or deployment changed in this source/UI review.

### Current handoff

Preserve PR #308 as Draft/Open/Unmerged. Master should triage the first-200 UI limitation against demo volume. Keep salary history/effective dates/backfill/proration, payslip versioning and advanced payout lifecycle deferred. Exact-head runner, disposable PostgreSQL database, independent security review and main-only `TASKS.md` ancestry reconciliation remain outstanding.
