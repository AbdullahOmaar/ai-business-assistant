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
