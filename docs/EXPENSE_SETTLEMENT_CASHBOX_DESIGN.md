# Expense Approval, Settlement and Cashbox — T40 Design

Date: 2026-10-30  
Status: **DESIGN PROPOSAL ONLY / CASHBOX-SETTLEMENT POLICY NOT APPROVED / IMPLEMENTATION BLOCKED**  
Policy authority: T37 v1.0.1 bounded operational policy set is Product-Owner APPROVED; overall T37 remains PARTIALLY COMPLETE. This specific cashbox/expense-settlement design remains a proposal for Master + qualified accountant review and is NOT APPROVED.

## 1. Current source baseline

The current Expense model stores business, category, description, amount, currency, incurred_at, vendor/reference and created_at. It has no approval state, settlement/disbursement record, cash account, cash movement ledger or reversal model. Current expense creation is an incurred-cost record, not proof of approval or payment.

The existing repository migration head is 0005_employee_payroll. A separate open Draft PR #312 already introduces migrations 0006–0011 for a deferred credit-note/bank-reconciliation/pricing workstream. T40 must not independently allocate migration 0006 or create a competing Alembic head until Master coordinates a single migration sequence and PR #312 is split/re-scoped. This is a real dependency, not a reason to create duplicate migration IDs.

## 2. Proposed business semantics — NOT APPROVED

- Expense.incurred_at records when the cost was incurred. It is not proof of approval or settlement.
- Approval is a separate OWNER workflow decision. Approval/rejection does not rewrite the incurred event.
- A confirmed settlement/disbursement is the only event that counts as cash outflow.
- Pending/failed settlement attempts do not change cash balance or cash-flow totals.
- Partial settlements are allowed, but the sum of valid settlements minus valid reversals must never exceed the Expense amount.
- Currency must match exactly across Expense, settlement and CashAccount. No implicit FX.
- Existing Expense rows have no settlement evidence. Never backfill them as paid/settled from amount, category, age or vendor text. Their historical settlement state is unknown until evidence is supplied.
- A reversal is a new linked event and opposite cash movement; never delete or rewrite the original settlement.
- Cash-account balances are derived from immutable movements, not maintained as client-editable balance fields.
- Proposed access boundary: OWNER-only cash account management, expense approval, settlement, reversal and cash movement exports. STAFF may create/view ordinary expenses within current policy. Payroll-linked rows/aggregates remain OWNER-only under T37 v1.0.1's separately approved bounded payroll privacy policy; this does not approve any cashbox/expense-settlement design or the broader T37 financial contract.

## 3. Proposed v1 data model

### CashAccount

- id, business_id, name, account_type (cash or bank), currency_code, is_active, created_by_subject, created_at.
- Unique business/name; composite tenant key (id, business_id).
- Currency is fixed after the first movement. Deactivation blocks new movements but preserves history.
- Opening balance is an explicit, OWNER-created, audited opening movement with date/evidence. No automatic opening balance from historical Expense/Payment rows.

### ExpenseApprovalEvent

- id, business_id, expense_id, event (approved or rejected), actor_subject, reason, idempotency_key, created_at.
- Append-only. Expense may expose a current approval projection (pending/approved/rejected) but the event remains the audit source.
- Re-approval after rejection must be a new event with a reason; no deletion of prior decisions.

### ExpenseSettlement

- id, business_id, expense_id, cash_account_id, amount, currency_code, settled_at, settled_by_subject, idempotency_key, created_at.
- Represents a confirmed, recorded disbursement only. A pending/failed attempt is not a settlement and creates no cash movement.
- Composite foreign keys enforce the same business for Expense and CashAccount.
- Unique (business_id, idempotency_key); positive amount; currency matches both linked records.

### CashMovement

- id, business_id, cash_account_id, direction (inflow/outflow), amount, currency_code, source_type, source_id, occurred_at, created_by_subject, idempotency_key, created_at.
- Immutable, append-only source ledger. ExpenseSettlement creates exactly one outflow movement in the same transaction.
- Unique (business_id, idempotency_key) and unique source identity (business_id, source_type, source_id).
- No mutable balance column. Balance = sum(inflows) - sum(outflows), by account and currency.

### ExpenseSettlementReversal

- id, business_id, settlement_id, cash_movement_id, amount, reason, reversed_by_subject, idempotency_key, created_at.
- Append-only. Creates an opposite inflow movement against the same cash account.
- Cumulative reversals cannot exceed the original settlement amount. Partial reversal is supported; corrections use reversal + replacement, not update/delete.

## 4. Transaction and idempotency invariants

1. OWNER authorization and tenant membership are checked server-side before reading/writing.
2. Lock the Expense and CashAccount rows (SELECT FOR UPDATE) before calculating remaining settleable amount and available balance.
3. Verify Expense is approved, Expense/CashAccount/settlement currencies match, CashAccount is active, and requested amount is positive.
4. Compute remaining Expense amount from confirmed settlements minus confirmed reversals. Reject over-settlement with no writes.
5. Compute available cash-account balance from immutable movements. V1 default is no overdraft; reject outflow that would make the account negative. Do not add an overdraft override without a separate policy decision.
6. Create ExpenseSettlement + CashMovement outflow + AuditEvent atomically. Any failure rolls back all three.
7. Exact idempotency replay with the same canonical payload returns the original settlement. Same key with a different payload returns 409 and creates no side effect.
8. Reversal uses the same transaction/idempotency discipline and cannot exceed the unreversed amount.
9. Never log employee/payroll sensitive values, secrets, bank credentials or full payment instrument data.

## 5. Proposed API surface

- POST /api/v1/businesses/{business_id}/cash-accounts — OWNER creates a cash/bank account.
- GET /api/v1/businesses/{business_id}/cash-accounts — OWNER lists account metadata and derived balances.
- GET /api/v1/businesses/{business_id}/cash-accounts/{account_id}/movements — OWNER reads paginated movements with business-local date filters.
- POST /api/v1/businesses/{business_id}/expenses/{expense_id}/approve — OWNER approves/rejects through an append-only approval event.
- POST /api/v1/businesses/{business_id}/expenses/{expense_id}/settlements — OWNER records a confirmed settlement; server creates the outflow movement.
- POST /api/v1/businesses/{business_id}/expense-settlements/{settlement_id}/reverse — OWNER records a full/partial reversal with reason and idempotency key.
- GET /api/v1/businesses/{business_id}/cash-flow — OWNER reads movement totals by account/currency and business-local period. It must not call incurred Expense totals cash outflow.

V1 excludes bank-provider integrations, transfers between accounts, supplier payments, payroll payout execution, credit-note refunds and GL posting. These require separate T37/T38/T39/T41 interfaces and must not be inferred from this design.

## 6. Reporting contract

- P&L/operating result continues to use incurred Expense amounts (subject to the approved reporting basis), not settlement movements.
- Cash-flow reports use only confirmed CashMovement events.
- Expense lists/reports may show incurred amount, approval status, settled amount and remaining-to-settle separately, each currency-separated.
- Payroll visibility predicate must be applied before any list pagination or aggregate; STAFF must not infer payroll settlements from cash account totals or cash movement descriptions. If payroll-specific cash movement is included in a generic account total, staff access to that account/report must follow the approved OWNER-only sensitivity boundary.
- Do not label invoice-minus-expense as net profit. COGS, complete tax/returns and GL remain deferred.

## 7. Required regression / migration matrix

### Authorization and tenant isolation
- OWNER create/list/deactivate cash accounts; STAFF denied without side effects.
- OWNER approve/reject/settle/reverse; STAFF denied without state, movement or audit side effects.
- Cross-business Expense/CashAccount/settlement IDs are rejected; no cross-tenant reads/writes.

### Financial integrity
- Same-currency positive settlement; partial settlement; exact full settlement.
- Reject zero/negative amount, currency mismatch, inactive account, unapproved expense and amount greater than remaining expense.
- Reject negative cash-account balance in v1; prove concurrent settlements cannot overspend or over-settle.
- Exact idempotent replay returns original result; changed-payload replay returns 409; duplicate requests create one movement and one audit effect.
- Pending/failed attempts create no movement; confirmed settlement creates exactly one outflow.
- Full/partial reversal, over-reversal rejection, duplicate reversal idempotency, reversal + replacement settlement.
- Cash account balance equals immutable movement sum; per-currency totals never mix currencies.
- Payroll-linked expense/settlement visibility is OWNER-only across list, reports, cash movements and AI context; STAFF ordinary expenses remain visible.

### Migration / recovery
- Clean PostgreSQL upgrade from 0005.
- Upgrade from a production-like 0005 database containing historical Expense rows; existing rows must not be marked settled or backfilled as paid.
- Verify composite tenant FKs, unique/idempotency constraints, indexes and NUMERIC precision.
- Transaction rollback tests for failures between settlement, movement and audit inserts.
- Concurrent settlement/reversal tests using PostgreSQL, not SQLite alone.
- Backup/restore rehearsal and downgrade policy review. After financial movement data exists, destructive downgrade is prohibited; rollback is forward-fix or restore from verified backup.

## 8. Implementation gates

- BLOCKED: migration numbering/ancestry coordination with PR #312 (0006–0011) is unresolved. Master must designate the canonical migration chain before a new migration is created.
- BLOCKED: exact-SHA executable validation is unavailable. CircleCI is prohibited by owner directive; GitHub Actions is not a substitute; Desktop Commander is OFFLINE.
- BLOCKED: production employee/payroll schema mismatch is verified in Vercel runtime (employees/payroll_records missing); migration 0005 application status is NOT VERIFIED. No production SQL/migration/deploy.
- T37 remains Draft / NOT APPROVED. None of the proposed operational semantics above are authorized for implementation until Master publishes a versioned T37 decision. This design does not authorize migration, merge, deployment, supplier AP/COGS, tax, FX or GL posting.
- Continue design, source review, tests and documentation on the existing T40 branch. Implement schema/API only after migration-chain coordination; keep PR #304 Draft and unmerged.


## Authority clarification — 2026-10-30

T37 v1.0.1 approval is limited to its explicitly bounded operational policy set. The cashbox, approval, settlement, reversal and cash-movement semantics in this document remain DESIGN PROPOSAL ONLY / NOT APPROVED. No cashbox models, settlement states, API routes, migrations, financial calculations or production changes may be implemented from this proposal until separate Master and qualified accounting/controller approval is recorded. The payroll privacy rule referenced above is approved only within the bounded T37 v1.0.1 scope.

No runtime code or schema changed in this documentation correction. Tests/build/PostgreSQL/browser/security are NOT RUN. [skip ci] was used; no CI was triggered.
