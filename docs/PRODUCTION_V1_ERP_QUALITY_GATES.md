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

The scenario also verifies exact payment replay returns the same record, changed payload under the same idempotency key is rejected, and only one payment/allocation/audit event is persisted. It then reconciles the product stock read model, customer statement, receivables aging, invoice list allocation/outstanding, and saved-tax summary against the same invoice and payment.

**Important limitation:** the current report explicitly includes stored tax in gross invoice revenue and excludes COGS because product purchase costs are not linked to sales. EGP 515.60 is therefore an operational result *before cost of goods sold*, not net profit. The test asserts this limitation instead of presenting it as a complete P&L.

## Initial procurement scenario: purchase order + partial receiving

A second API/persistence scenario is implemented in `backend/tests/test_erp_v1_business_cycle.py`:
- Create a supplier and a stock-tracked product with opening quantity 10.
- Create a purchase order for 5 units × EGP 100 = EGP 500 and approve it.
- Receive 3 units: order becomes partially_received and stock becomes 13.
- Attempt to receive 3 more units while only 2 remain: request is rejected and both received quantity and stock remain unchanged.
- Receive the remaining 2 units: order becomes received, received quantity is 5, stock becomes 15, and exactly two receipt movements / receipt audit events exist.

**Important limitation:** purchase-order line unit costs are stored, but supplier bill/payable/settlement and inventory valuation/COGS linkage are not implemented as a complete accounting workflow. This scenario verifies PO approval and quantity receiving only; it does not claim AP recognition, inventory value, or COGS correctness.

## Initial procurement scenario: purchase order + partial receiving

The API/persistence scenario in `backend/tests/test_erp_v1_business_cycle.py`:
- Creates a supplier and stock-tracked product with opening quantity 10.
- Creates and approves a purchase order for 5 units × EGP 100 = EGP 500.
- Receives 3 units: order becomes partially_received and stock becomes 13.
- Attempts to receive 3 more units when only 2 remain: request is rejected and both received quantity and stock remain unchanged.
- Receives the remaining 2 units: order becomes received, received quantity is 5, stock becomes 15, and exactly two receipt movements / receipt audit events exist.

**Important limitation:** purchase-order line unit costs are stored, but supplier bill/payable/settlement and inventory valuation/COGS linkage are not implemented as a complete accounting workflow. This scenario verifies PO approval and quantity receiving only; it does not claim AP recognition, inventory value, or COGS correctness.

## Initial returns scenario: approved return + stock restoration

The API/persistence scenario:
- Issues a 3-unit invoice at EGP 200/unit with 10% discount and 14% tax.
- Creates and approves a one-unit return linked to the original invoice line.
- Verifies the return amount is EGP 180 (discounted line value before tax allocation), stock returns from 7 to 8, and the approved return is stored.
- Verifies the preliminary report still shows gross invoice revenue EGP 615.60 and separately shows approved returns EGP 180; it does not silently net the return.
- Verifies no cash refund/payment row is created by return approval.

**Important limitation:** tax allocation to returns and the cash refund/credit-note settlement lifecycle are not complete. The scenario validates the implemented quantity/discount return behavior and exposes the gap; it does not claim that the customer refund or tax liability is complete.

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


## Cross-feature regression matrix — T22 execution map

The matrix maps existing automated coverage to workflows. A listed test is source-level coverage, not proof of a pass on the current PR head. The ERP scenario suite additionally rejects malformed invoice quantities without creating a row and reads invoice, payment, allocation, and expense values back from persisted records before reconciling reports.

| Workflow / risk | Primary automated coverage | Assessment |
|---|---|---|
| Firebase identity and fail-closed behavior | `test_firebase_auth.py`, `test_security.py`, `test_main.py` | Backend source coverage present; exact-head execution pending |
| Business creation, membership and workspace isolation | `test_core_features_api.py`, `test_membership_management_api.py`, `test_business_tenant_boundaries.py` | API coverage present; real Firebase browser sign-in E2E not established |
| OWNER / STAFF permissions and denied side effects | `test_api.py`, `test_purchase_order_approval_api.py`, `test_employee_payroll_api.py`, `test_membership_management_api.py` | Targeted role matrix present; not every route × role pair is claimed exhaustive |
| Customers and products | `test_core_features_api.py`, `test_erp_v1_business_cycle.py` | CRUD and persisted sale workflow coverage |
| Invoice draft, edit, issue and invalid-input handling | `test_core_features_api.py`, `test_invoice_lifecycle_edges.py`, `test_erp_v1_business_cycle.py` | API/persistence coverage |
| Payment allocation, replay, changed-payload rejection and duplicate side effects | `test_core_features_api.py`, `test_postgres_financial_concurrency.py`, `test_erp_v1_business_cycle.py` | Replay/persistence covered; PostgreSQL races require disposable PostgreSQL |
| Inventory, purchasing, partial receipt and over-receipt | `test_erp_v1_business_cycle.py`, `test_foreign_business_workflows.py`, `test_purchase_order_approval_api.py` | Quantity and tenant safety covered; AP/valuation intentionally not claimed |
| Expenses and reports / currency and date boundaries | `test_erp_v1_business_cycle.py`, `test_receivables_aging.py`, `test_business_timezone_reporting.py`, `test_operations.py` | Report values reconciled to saved records; no full GL/P&L claim |
| Employees/payroll privacy and role denial | `test_employee_payroll_api.py`, `employee-payroll-ui.spec.ts` | Backend privacy/role coverage; lifecycle remains contract-gated |
| AI success, invalid input, provider failure/timeout and safe errors | `test_assistant_security.py`, `test_assistant_resilience.py`, `test_core_features_api.py` | Backend provider/fallback safety coverage |
| Frontend unit regression | `frontend/src/app/*.spec.ts` | Node test suite is repeatable; exact-head run pending |
| Browser E2E | `frontend/e2e/startup.spec.ts`, `frontend/e2e/platform-admin.spec.ts` | Startup/admin only; authenticated full ERP journey remains NOT IMPLEMENTED / NOT RUN |

### Exact repeatable commands

Run from a clean checkout of the candidate SHA in an isolated environment only.

**Backend API/domain suite:**

```bash
cd backend
mkdir -p test-results
python -m pytest -q --junitxml=test-results/pytest.xml
```

**Disposable PostgreSQL schema/concurrency gate (CI-provided disposable service only):**

```bash
cd backend
python -m alembic upgrade head
python -m alembic current
python -m alembic check
python -m pytest -q --junitxml=test-results/pytest.xml
python -m alembic upgrade head --sql > test-results/alembic-upgrade.sql
test -s test-results/alembic-upgrade.sql
```

Set `DATABASE_URL`, `TEST_DATABASE_URL`, and `CI_ALLOW_DATABASE_SCHEMA_TESTS=true` only for the disposable PostgreSQL service. Never point these commands at production.

**Frontend unit tests and production compilation:**

```bash
cd frontend
npm ci --no-audit --no-fund
npm test
npm run prebuild
npx ng build
```

**Chromium browser suite:**

```bash
cd frontend
npm ci --no-audit --no-fund
npm install --no-save --no-audit --no-fund @playwright/test@1.55.0
npx playwright --version
npx playwright test
```

Retain backend JUnit at `backend/test-results/pytest.xml`, Playwright JUnit at `frontend/test-results/e2e-junit.xml`, traces/screenshots on failure, migration SQL, and `git rev-parse HEAD`. Report PASS / FAIL / NOT RUN against that exact SHA; stale results do not count.

### Current execution boundary

Backend/frontend suites, PostgreSQL migration/concurrency checks, browser E2E, Docker build/import, and dependency audits have **NOT RUN** on the current PR head. CircleCI is prohibited and has not been triggered. GitLab remains the intended validation-only runner but exact GitHub SHA synchronization/status association is not demonstrated. The lack of an authenticated full ERP browser journey is a concrete remaining automation gap.


### T22 follow-up — AI malformed upstream response safety

Added `test_assistant_malformed_provider_responses_return_safe_error` in `backend/tests/test_assistant_security.py`. It exercises three upstream failure shapes (invalid JSON content, missing provider response envelope, and empty answer) through the real authenticated assistant API route. Each must return the same safe HTTP 502 contract and must not expose provider payload details or the test API key. This is source-level test coverage only; execution on the current SHA remains NOT RUN.
