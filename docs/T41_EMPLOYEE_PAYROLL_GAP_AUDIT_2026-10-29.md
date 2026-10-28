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
