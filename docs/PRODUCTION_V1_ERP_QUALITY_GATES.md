# Production V1 — ERP Quality Gates & Business Scenario Testing

**Status:** Acceptance contract / execution baseline. This document does not claim that Production V1 is complete or authorize a merge, deployment, production migration, or production data change.

## Product rule

Production V1 is the system the business will actually operate. A feature is not complete because a screen renders, an endpoint returns 200, or a unit test passes. It must complete its business workflow, persist the correct records, produce correct financial results, enforce permissions, and reconcile with related modules.

Every critical scenario must record:
- Exact GitHub commit SHA and environment.
- Synthetic setup data and preconditions.
- User-visible/API actions in order.
- Expected values calculated independently before execution.
- Actual API response and persisted database values.
- Expected-versus-actual assertions for totals, balances, quantities, statuses, audit records, and source links.
- PASS / FAIL / NOT RUN / BLOCKED, with logs and artifact links.

## Strict release gates

### 1. Core ERP workflows
- Business/workspace, members, customers, suppliers, products, units, opening balances.
- Sales: draft, edit, issue, customer statement, partial/full collection, outstanding balances.
- Procurement: purchase order, approval, receiving, supplier bill/payable, supplier payment.
- Inventory: opening, receipt, sale, return, adjustment, stock balance, valuation, costing.
- Expenses: incurred, approved, paid/settled, cancelled, reversed, with explicit state semantics.
- Returns/refunds/credit notes: original source link, limits, tax/discount allocation, stock effect, refund/payment effect.
- Employees/payroll only under an approved salary, effective-date, authorization, calculation, payment, and accounting contract.

### 2. Accounting engine
- Approved chart of accounts and account classification.
- Immutable journal entries and lines; corrections only through linked reversal/correction.
- Every posted entry balances per currency (debits = credits).
- Trusted server-side posting; client input cannot dictate accounting amounts, account mappings, permissions, or payment state.
- Source event posted once; idempotency key and source-event uniqueness enforced transactionally.
- Closed periods reject posting; posted history cannot be edited or deleted.
- Subledger-to-GL reconciliation for AR, AP, cash/bank, inventory, tax, expenses, and payroll.

### 3. Inventory valuation and COGS
- Explicitly approved costing method (e.g. FIFO or weighted average); do not assume one.
- Purchase receipt creates cost layers/value under the approved method.
- Sales issue relieves inventory and posts COGS exactly once.
- Returns restore quantity and value according to source cost policy.
- Stock quantities and values reconcile to movements and ledger; no silent overwrite, negative stock, or double receipt/issue.

### 4. Reports and reconciliation
- Trial Balance, General Ledger, Balance Sheet, P&L, Cash Flow, AR/AP aging, inventory valuation, tax reports.
- Every report metric maps to source transactions and a documented formula/date/currency basis.
- Invoices are not cash; approved/recorded payroll is not cash paid; expenses incurred are not necessarily settled.
- Returns/refunds and supplier payments are counted exactly once.
- Currency totals remain separate unless a reviewed FX policy supplies dated rates and functional-currency handling.
- Bank reconciliation matches statement lines to cash/bank ledger entries and preserves unmatched/adjustment audit trails.

### 5. Tax and localization
- Effective-dated configurable rules; never hardcode one tax rate as universally applicable.
- Explicit inclusive/exclusive tax, rounding, discounts, exemptions, credit-note/return allocation and reporting behavior.
- Egypt-specific filing/e-invoice/e-receipt integrations are accepted only after official requirements, credentials, lifecycle, signatures, and accountant/legal review are documented and tested.

### 6. Security and operational safety
- Route × role × action matrix and tenant isolation on every read/write/export/report.
- Denied operations have verified no-write/no-financial-side-effect behavior; audit behavior follows the approved policy.
- Sensitive payroll/customer data is redacted from logs, AI context, exports and unauthorized reports.
- Duplicate requests, changed-payload idempotency reuse, concurrency, timeout/retry, partial failure, rollback and reversal are tested.
- Production backup and restore rehearsal, migration upgrade/check/rollback plan, monitoring and safe recovery evidence exist.

### 7. Release gates
- All required tests run against the exact candidate SHA; stale pipeline results do not count.
- Backend, frontend, PostgreSQL migrations, Docker image build/import, browser E2E, dependency security and targeted accounting/security suites pass.
- Independent review and release approvals are complete.
- Deployment uses the authorized release flow; after deployment verify exact deployed SHA/version, health/readiness and safe authenticated smoke.
- No production deployment or production database mutation without explicit owner authorization.

## Test architecture

1. **Unit/domain:** Decimal, HALF_UP, line/discount/tax calculations, allocation caps, stock/return limits, currency isolation.
2. **API + database integration:** real synthetic customer/product/invoice/payment/expense/return/purchase records, with DB state assertions.
3. **PostgreSQL-specific:** row locks, concurrent payments/receipts/postings, unique-key races, idempotency and migration behavior.
4. **Browser E2E:** sign-in, workspace, create customer/product, issue invoice, collect payment, view reports, permission failures and retry/error states.
5. **ERP scenario suite:** full multi-module business cycles with independently calculated expected results and persisted-result reconciliation.
6. **Negative/recovery suite:** insufficient stock, over-allocation, invalid rates, wrong customer/currency, foreign tenant references, duplicate requests, changed idempotency payload, rollback/reversal, closed-period posting.
7. **Release/restore suite:** migration upgrade, Alembic check/offline SQL, disposable backup/restore drill, Docker build/import and deployment smoke.

Use isolated synthetic test data only. Do not run destructive fixtures, schema drops, restore drills, or financial mutations against production.

## Initial verified scenario: sale + partial collection

The first API/persistence scenario is implemented in `backend/tests/test_erp_v1_business_cycle.py` and will be included in the existing backend pytest collection.

| Step | Expected result |
|---|---:|
| Create product at EGP 200, opening stock 10 | Stock 10 |
| Invoice 3 units | Subtotal EGP 600.00 |
| Discount 10% | EGP 60.00 |
| Tax 14% on EGP 540.00 | EGP 75.60 |
| Invoice total | **EGP 615.60** |
| Issue invoice | Stock 7 |
| Record collection | EGP 400.00 |
| Customer outstanding | **EGP 215.60** |
| Record operating expense | EGP 100.00 |
| Preliminary operating result before COGS | **EGP 515.60** |

The scenario also verifies exact payment replay returns the same record, changed payload under the same idempotency key is rejected, and only one payment/allocation/audit event is persisted.

**Important limitation:** the current report explicitly includes stored tax in gross invoice revenue and excludes COGS because product purchase costs are not linked to sales. EGP 515.60 is therefore an operational result *before cost of goods sold*, not net profit. The test asserts this limitation instead of presenting it as a complete P&L.

## Known blockers to full ERP acceptance

- No implemented chart of accounts/general ledger/journal posting engine.
- No immutable balanced double-entry posting and no fiscal-period locks.
- No inventory valuation/COGS linkage from purchase receipts to sales.
- No bank reconciliation.
- Incomplete credit-note/refund and tax allocation lifecycle.
- Shared financial contracts in Notion T37 remain Draft / not approved; dependent financial semantics remain gated.
- Exact GitHub→GitLab SHA mirroring/status association is not verified. A green GitLab pipeline on a GitLab-only or older SHA is not release evidence.

## Progress reporting

Use the weighted acceptance model in `TASKS.md`: Core ERP 25, Accounting Engine 25, Reconciliation/Reports 15, Inventory Valuation/COGS 10, Tax/Localization 10, Security/Tenant/Audit 10, Release/Operations 5. Award points only for implemented and verified criteria. Report the evidence SHA, category scores, overall percentage, blocked criteria, and tests not run. Do not infer progress from PR count or UI completion.
