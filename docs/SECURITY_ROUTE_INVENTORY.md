# Authenticated API Route Inventory

**Reviewed:** 2026-10-31  
**Scope:** FastAPI routes registered by `backend/app/main.py`, `api.py`, `core_features_api.py`, `extended_api.py`, `assistant_api.py`, `platform_admin_api.py`, and `employee_payroll_api.py`.  
**Purpose:** Source-level inventory for security review. This document is not a claim that every endpoint has exhaustive integration coverage.


## Denied-mutation regression evidence — merged successors and remaining scope

- **PR #251** is merged. Its STAFF-denial regression checks 16 sensitive requests individually for HTTP 403, verifies business-scoped audit-event counts remain unchanged, and compares protected-row snapshots for Customer, Invoice, InvoiceLine, Payment, Supplier, and PurchaseOrder.
- **PR #267** is merged at `9fc9a9a53ef1df744ddd2137e09ff4ec5bc2310d`. Its cross-tenant suite covers foreign customer/product references during invoice creation, payment allocation to another business's invoice, foreign invoice issue, stock movement, purchase-order create/receive, and sales-return create/approval. Denied operations assert no protected-record, stock, payment, or audit side effects. The same PR fixed payment allocation ordering so a rejected request cannot leave an orphan Payment row.
- **PR #261** is closed without merge and superseded by #267. Review of its patch found the broad test `test_owner_cannot_mutate_foreign_business_financial_and_stock_ids`; that behavior is present on main as `backend/tests/test_foreign_business_workflows.py::test_owner_cannot_mutate_foreign_business_financial_and_stock_ids`. No unique missing regression was identified from this PR.
- **PR #270** is closed without merge and superseded by #264. It is a partial historical audit snapshot, not application behavior; its findings are represented in the current reconciliation ledger. Do not restore its partial document.
- **PR #244** is merged at `c0f9b475f6b86248862f1a58defc2e3223f58046`. Its exact-head CircleCI gate passed 7/7 and GitHub Actions checks passed 7/7. Backend test job: 231 passed, 7 skipped, 16 warnings; full test job: 232 passed, 6 skipped, 16 warnings. It adds non-member denial and no-side-effect coverage for customer CSV export, preview, and import.
- **Current follow-up:** issue [#276](https://github.com/AbdullahOmaar/ai-business-assistant/issues/276) remains OPEN. The merged tests are targeted coverage, not proof that every sensitive route × role × tenant combination is complete. Remaining workflow edges, OWNER-positive cases, authenticated production smoke, and physical mobile/accessibility QA must remain explicitly tracked.
- **Employee/payroll security follow-up (PR #281):** two dedicated regressions cover (1) non-member attempts to read/create/update employees and read/create/update/approve/pay payroll, requiring 403 and unchanged employee/payroll/expense/business-audit state; and (2) cross-business payroll update/approve/pay plus payroll creation with a foreign employee ID, requiring 404 and unchanged state in both businesses. Code/test head `dd0e9168f635e5aea9b4ef8551c269bd1f7d70ad` passed CircleCI 7/7. Duplicate GitHub Actions workflows were rerun on the code/test head and failed within seconds before executable steps; job steps are absent and log endpoints return 404, so root cause is UNVERIFIED. This documentation update requires fresh exact-head checks. Local tests NOT RUN.
- **PR #292 — extended STAFF denied-side-effect matrix:** merged at `9d478c63e94011eb919ee518d83726f51a59f1f8`. `test_staff_is_denied_sensitive_business_routes` snapshots business-scoped rows for `BusinessSetting`, `Customer`, `Invoice`, `InvoiceLine`, `Notification`, `Payment`, `PaymentAllocation`, `PricingRule`, `Product`, `PurchaseOrder`, `PurchaseOrderLine`, `RecurringInvoiceSchedule`, `SalesReturn`, `SalesReturnLine`, `StockMovement`, and `Supplier` before/after denied requests, alongside per-request audit-count checks. The OWNER-positive workflow verifies pricing-rule creation. Exact pre-merge CircleCI passed 7/7; post-merge CircleCI was still partially pending at last poll.
- **PR #294 — non-member extended workflow matrix:** OPEN / Draft on branch `security/nonmember-extended-route-matrix-current-main-20261029`. It prepares valid owner-created purchase-order and draft sales-return records, then asserts non-member 403 denials for purchase-order create/approve/receive, sales-return create/approve, recurring schedule, pricing rule, notification, settings, and audit-event routes. It snapshots business-scoped rows and verifies audit counts remain unchanged. Previous code/test head `1f8a7ebbca222b6b731727dce46ff839baedfb23` passed CircleCI 7/7; this documentation update creates a new head, so exact-head CI must pass again before merge.
- Local pytest/build: **NOT RUN** in this connector-only session. No production data, authorization policy, or permissions were changed by this documentation update.


## STAFF invoice-void denial no-side-effect regression — 2026-10-29

- Current-main baseline: PR #297 merged at `3c560a0f425c8a97bcbe9384c5eefb580c936025`; the CSV entity × role denial matrix is present.
- Candidate branch strengthens `backend/tests/test_api.py::test_staff_cannot_void_invoice` to assert that a STAFF request to void an issued invoice returns HTTP 403 and leaves invoice status/financial fields, business-scoped AuditEvent count, StockMovement count, and SalesReturn count unchanged.
- This is targeted regression coverage for a high-impact financial lifecycle action. It does not claim exhaustive route × role × tenant coverage.
- Exact-head CI: pending until the candidate PR opens and all required checks complete. Local pytest/build: NOT RUN in this connector-only session. No production data, authorization policy, or deployment was changed.


## OWNER-positive invoice-void audit regression — 2026-10-29

- Candidate branch: `test/security-owner-invoice-void-audit-20261029`; main baseline `bf0bcdaf08353f15a532e692522730f42d2258e1`.
- Adds `backend/tests/test_api.py::test_owner_can_void_unpaid_issued_invoice_and_records_audit_event`: an OWNER voids an unpaid issued invoice, receives HTTP 200 and status `void`, and exactly one business-scoped `invoice.voided` AuditEvent targets that invoice.
- This complements the merged STAFF denial test that asserts 403 and unchanged invoice financial fields, stock movements, sales returns, and audit count.
- Exact-head CI: pending until the candidate PR checks finish. Local pytest/build: NOT RUN in this connector-only session. No production data, authorization policy, or deployment changed.

## Authorization model

- `GET /health` is a public liveness endpoint and does not imply database or authentication readiness.
- `GET /readyz` is an operational readiness endpoint. It returns ready only when the database session factory and trusted principal resolver exist and the database query succeeds.
- Business routes require the trusted principal dependency (`get_principal`) and must authorize membership for the requested `business_id`. Identity must come from the configured Firebase token verifier, never from caller-controlled JSON or headers outside the bearer-token verification path.
- Resource queries and mutations must scope both the business and resource ID (for example, `Invoice.id == invoice_id AND Invoice.business_id == business_id`). Cross-business customer, product, invoice, and payment-allocation references must be rejected.
- The public Firebase web-app configuration is not a server secret. Firebase service-account credentials, database URLs, and provider API keys must remain server-side environment variables.

## Complete route inventory

### Operational routes — `backend/app/main.py`

| Method | Path | Access expectation |
|---|---|---|
| GET | `/health` | Public liveness only |
| GET | `/readyz` | Operational readiness gate; no business data |
| GET | `/version` | Public, non-sensitive release metadata only; never expose secrets or tokens |

### Workspace and dashboard — `backend/app/core_features_api.py` (prefix `/api/v1`)

| Method | Path | Access expectation |
|---|---|---|
| GET | `/api/v1/businesses` | Trusted principal; return only memberships for that user |
| POST | `/api/v1/businesses` | Trusted principal; create workspace and owner membership transactionally |
| GET | `/api/v1/businesses/{business_id}` | Active membership required |
| PATCH | `/api/v1/businesses/{business_id}` | OWNER only; business must be active |
| GET | `/api/v1/businesses/{business_id}/dashboard` | Active membership required; aggregates scoped to business |
| GET | `/api/v1/businesses/{business_id}/memberships` | OWNER only; list roles within the requested business |
| PATCH | `/api/v1/businesses/{business_id}/memberships/{membership_id}` | OWNER only; target membership must belong to business; never demote/remove the last owner |
| DELETE | `/api/v1/businesses/{business_id}/memberships/{membership_id}` | OWNER only; target membership must belong to business; preserve at least one owner |
| GET | `/api/v1/businesses/{business_id}/profit-loss` | Active membership required; business-scoped revenue/expense summary without cross-currency aggregation |

### Core business workflows — `backend/app/api.py` (prefix `/api/v1`)

| Method | Path | Access expectation |
|---|---|---|
| POST | `/api/v1/businesses/{business_id}/customers` | Membership required |
| POST | `/api/v1/businesses/{business_id}/suppliers` | Membership required |
| POST | `/api/v1/businesses/{business_id}/products` | Membership required; positive `opening_quantity` requires OWNER before any product/stock/audit writes |
| POST | `/api/v1/businesses/{business_id}/invoices` | Membership required; customer/product IDs must belong to same business |
| POST | `/api/v1/businesses/{business_id}/invoices/issue` | OWNER only; create and issue atomically; customer/product IDs must belong to same business |
| POST | `/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue` | OWNER only; invoice must belong to the requested business and satisfy issue lifecycle rules |
| PATCH | `/api/v1/businesses/{business_id}/invoices/{invoice_id}` | Membership, same-business invoice, and draft-state checks required |
| POST | `/api/v1/businesses/{business_id}/invoices/{invoice_id}/void` | OWNER only; same-business invoice and void lifecycle rules required |
| POST | `/api/v1/businesses/{business_id}/stock-movements` | OWNER only; product must belong to the requested business |
| POST | `/api/v1/businesses/{business_id}/payments` | OWNER only; customer and invoice allocations must belong to the requested business; idempotency key enforced |

### Extended business workflows — `backend/app/extended_api.py` (prefix `/api/v1/businesses/{business_id}`)

All paths below inherit the business ID and require a trusted principal plus active business membership. Rows marked OWNER additionally enforce the OWNER role server-side.

| Method | Path suffix | Access expectation |
|---|---|---|
| GET | `/operations/health` | OWNER only; read-only operational snapshot, no secret values |
| GET | `/reports/tax-summary` | Membership required; totals separated by currency |
| POST | `/purchase-orders/{order_id}/approve` | OWNER only; draft-only transition with one audit event |
| POST | `/imports/{entity_type}.csv/preview` | OWNER only; validate/preview without persistent writes |
| GET | `/reports/receivables-aging` | Membership required; currency-separated outstanding balances |
| GET | `/customers/{customer_id}/statement` | Membership and same-business customer; read-only, currency-safe |
| GET | `/audit-events` | OWNER only; paginated and business-scoped |
| GET | `/reports/data-integrity` | OWNER only; read-only integrity findings scoped to business |
| POST | `/expenses` | Membership required |
| GET | `/expenses` | Membership required; filter by business |
| GET | `/suppliers` | Membership required; list only active suppliers scoped to the requested business |
| GET | `/purchase-orders` | Membership required; orders and lines scoped to the requested business |
| POST | `/purchase-orders` | Membership; supplier/products must be in same business |
| POST | `/purchase-orders/{order_id}/receive` | OWNER only; order, lines, and products must belong to the requested business |
| POST | `/sales-returns` | Membership; invoice and invoice lines must be same-business |
| POST | `/sales-returns/{return_id}/approve` | OWNER only; same-business return and invoice/line references; lifecycle and cumulative quantity/amount checks |
| GET | `/recurring-invoices` | Membership required; schedules scoped to the requested business |
| POST | `/recurring-invoices` | OWNER only; any customer reference must belong to the requested business |
| POST | `/pricing-rules` | OWNER only |
| POST | `/notifications` | OWNER only; creation may trigger downstream delivery |
| GET | `/notifications` | Membership required; filter by business |
| PUT | `/settings/{setting_key}` | OWNER only; setting key validated; business audit-event gap remains under review |
| GET | `/reports/summary` | Membership required; aggregates scoped by business and currency |
| GET | `/exports/{entity_type}.csv` | OWNER only; supported export data scoped by business and CSV cells formula-neutralized |
| POST | `/imports/{entity_type}.csv` | OWNER only; bounded CSV input, schema/row validation, business-scoped writes |
| GET | `/customers` | Membership required; filter by business |
| GET | `/customers/{customer_id}` | Membership and same-business customer |
| PATCH | `/customers/{customer_id}` | Membership and same-business customer |
| DELETE | `/customers/{customer_id}` | OWNER only; same-business customer; soft-deactivate and audit |
| GET | `/products` | Membership required; filter by business |
| GET | `/products/{product_id}` | Membership and same-business product |
| PATCH | `/products/{product_id}` | Same-business product; ordinary metadata is member-level, but price/stock-sensitive fields require OWNER |
| DELETE | `/products/{product_id}` | OWNER only; same-business product; soft-deactivate and audit |
| GET | `/payments` | Membership required; payments and allocations scoped by business |
| GET | `/invoices/{invoice_id}` | Membership and same-business invoice/lines |
| GET | `/invoices` | Membership required; filter by business |
| GET | `/assistant/insights` | Membership required; read-only aggregates scoped by business |

**Sensitive derived-data note — HIGH / P1 privacy exposure (2026-10-31):** The narrow Master-approved Payroll Privacy Policy v1.0 is separate from T37: OWNER-only access to payroll-linked Expense rows and derived aggregates; STAFF retains ordinary expense access. `PayrollRecord.expense_id` is the authoritative link; mutable category/description text is not a privacy boundary. The approval is recorded in the T40/T41 Notion handoffs; the canonical T37 page remains Draft / NOT APPROVED for other shared financial semantics, and its broader authorization row still requires reconciliation. On current main, `GET /expenses` returns payroll Expense description, amount, vendor name and reference; `GET /reports/summary`, `GET /assistant/insights`, dashboard aggregates, and member-authorized `POST /assistant/chat` include payroll-linked amounts and/or employee-identifying details in derived data/provider context. The privacy filter exists in candidate T40/T41 branches but is not integrated on main or exact-SHA runtime-verified. Keep Issue #110 OPEN and treat STAFF payroll-derived visibility as a HIGH finding until the approved filter is integrated and OWNER-positive / STAFF-denied / non-member / cross-tenant regressions pass.

## AI assistant — `backend/app/assistant_api.py` (prefix `/api/v1/businesses/{business_id}/assistant`)

| Method | Path | Access expectation |
|---|---|---|
| POST | `/api/v1/businesses/{business_id}/assistant/chat` | Membership check before provider configuration/use; bounded input; reject caller-supplied system/tool roles; never expose another tenant’s records |

### Platform administration — `backend/app/platform_admin_api.py` (prefix `/api/v1/platform-admin`)

All routes require a trusted authenticated principal and explicit server-side platform allowlist/permission checks; workspace OWNER/STAFF roles do not grant platform access.

| Method | Path | Access expectation |
|---|---|---|
| GET | `/api/v1/platform-admin/access` | Active delegated platform-role grant or bootstrap super-admin allowlist; return only the caller's effective roles and permissions |
| GET | `/api/v1/platform-admin/system-status` | `view_system_status` permission; safe runtime metadata only |
| GET | `/api/v1/platform-admin/overview` | `view_overview` permission; platform counts with financial totals separated by currency |
| GET | `/api/v1/platform-admin/businesses` | `view_workspaces` permission; bounded, read-only workspace search |
| GET | `/api/v1/platform-admin/businesses/{business_id}` | `view_workspaces` permission; no credentials or tokens |
| PATCH | `/api/v1/platform-admin/businesses/{business_id}/status` | `manage_workspace_status` permission; meaningful reason and audit event required |
| GET | `/api/v1/platform-admin/audit-events` | `view_audit` permission; bounded, read-only platform audit stream |
| GET | `/api/v1/platform-admin/audit-events/export.csv` | `view_audit` permission; bounded, redacted export with security logging |
| GET | `/api/v1/platform-admin/users` | `view_users` permission; Firebase account listing/search with bounded pagination |
| POST | `/api/v1/platform-admin/users/{user_uid}/roles` | Platform super-admin only; bounded delegated roles, reason and audit trail; root admin cannot be granted in-app |
| GET | `/api/v1/platform-admin/role-audit-events` | `view_audit` permission; read-only history of delegated platform role changes |

### Employees and payroll — `backend/app/employee_payroll_api.py` (prefix `/api/v1/businesses/{business_id}`)

All endpoints require OWNER membership in the requested business; employee/payroll IDs must also be scoped to that business. Payroll totals are calculated server-side. Marking payroll paid is a financial mutation and must only apply to an approved eligible record with linked expense/audit effects.

| Method | Path | Access expectation |
|---|---|---|
| GET | `/api/v1/businesses/{business_id}/employees` | OWNER only; list employees scoped to business |
| POST | `/api/v1/businesses/{business_id}/employees` | OWNER only; create employee in business; enforce business-scoped uniqueness and audit trail |
| PATCH | `/api/v1/businesses/{business_id}/employees/{employee_id}` | OWNER only; employee ID must belong to business; no cross-tenant mutation |
| GET | `/api/v1/businesses/{business_id}/payroll` | OWNER only; list payroll records and employee labels scoped to business |
| POST | `/api/v1/businesses/{business_id}/employees/{employee_id}/payroll` | OWNER only; employee ID must belong to business; server-calculated payroll totals |
| PATCH | `/api/v1/businesses/{business_id}/payroll/{payroll_id}` | OWNER only; payroll ID must belong to business and remain in an editable lifecycle state |
| POST | `/api/v1/businesses/{business_id}/payroll/{payroll_id}/approve` | OWNER only; same-business payroll; enforce approval lifecycle and audit |
| POST | `/api/v1/businesses/{business_id}/payroll/{payroll_id}/pay` | OWNER only; same-business approved payroll; create linked expense exactly once and audit payment |

## Current regression-test evidence

- **Current T03 candidate (refreshed 2026-11-01):** PR #302 / `qa/foreign-resource-read-no-side-effects-20261029` at latest branch head `a0a5a1da84e2e7e715abd93e646a9ac6280a1de4` (documentation-only update; code-under-test remains unchanged at `c359831a7f7f62f27afcfe09984c3a78df922646`), base `c464398e0a6ace77eba32aabfbdbd09091f53999`, OPEN/DRAFT/UNMERGED. GitHub compare against current main `dcb0853ab06dc9271b1109db03eb84ab2e3360c8` reports 54 commits ahead / 3 behind (DIVERGED). GitHub currently reports mergeable=true, which is not authorization or proof that the stale base is reconciled. Owner/Master must authorize and coordinate a normal synchronization before exact-head validation. No merge or deployment has occurred.
- **Route inventory:** current registered source has 79 route decorators and 79 unique method/path pairs. This inventory has 79 unique entries; exact source-to-inventory comparison reports zero missing and zero extra paths.
- **T03 test coverage in the candidate:** `test_business_tenant_boundaries.py` includes OWNER/STAFF/non-member, foreign customer statement/report/purchase-order, supplier creation/list, and route-scope cases. Its foreign customer/product/invoice GET/PATCH/DELETE matrix now executes requests sequentially and compares every persisted row for both businesses (including Business and AuditEvent) immediately after each denial. The foreign customer-statement, PO-approval and PO-receive denials also have per-request two-tenant snapshots. The added `test_tenant_payroll_route_snapshots.py` snapshots every business-scoped row, Business and AuditEvent after each STAFF/non-member denial and foreign OWNER employee/payroll ID attempt. `test_extended_route_snapshot_matrix.py` snapshots all business rows after each non-member/STAFF denial and allowed STAFF report/statement read. `test_foreign_resource_id_side_effects.py` snapshots both tenants after rejected foreign stock, sales-return invoice/line/approval, recurring-customer, purchase-order supplier/product, and payment-allocation attempts.
- **Existing regression coverage:** `test_foreign_business_workflows.py` covers cross-business invoice, payment, stock, purchase-order and sales-return boundaries; `test_employee_payroll_api.py` covers STAFF/non-member and cross-business employee/payroll access. The T03 candidate now extends per-request persisted-row snapshots to the previously end-of-test-only customer/product/invoice and foreign statement/PO denial cases.
- **Static checks:** route source/inventory parity is recorded as 79/79 with zero missing/extra/duplicate paths. Earlier AST syntax checks passed on prior candidate revisions; AST has not been independently rerun on the current code head `c359831a...` (the latest `a0a5a1da...` commit changes documentation only). Full-module pytest, focused pytest and the full backend suite remain NOT RUN.
- **CI authority:** no exact-head GitLab pipeline was found for code head `c359831a...` or documentation head `a0a5a1da...`; none was triggered. The T03 work package explicitly prohibits CI triggers pending Owner/Master permission. Current main `AGENTS.md` names GitLab as the sole approved CI provider; Owner/Master must reconcile the task-level restriction. CircleCI/Semaphore contexts are retired/non-authoritative.
- **Payroll privacy integration:** current main does not yet contain the `apply_expense_visibility` predicate. Candidate implementations/tests are on PR #304 (T40) and PR #308 (T41), both still unmerged and sharing backend files; Chat 5 has independently reviewed their current heads.

## Remaining coverage gaps

- **Feature-branch routes:** T39 PR #306 adds supplier detail/update/activation/export and expanded purchase-order detail/history/cancel behavior that is not part of current main's 79-route inventory. Chat 5 must extend this inventory and test foreign IDs/role boundaries after Chat 2's sequential integration; do not duplicate or edit Chat 2's branch.
- **Platform administration:** delegated `platform_viewer` no-mutation/no-audit regression is on PR #313 and is not merged. Re-test the exact integrated head and retain OWNER/super-admin positive controls.
- **Payroll privacy:** the narrow Payroll Privacy v1.0 candidate remains on PR #304/#308, not main. After Chat 3/4 sequential shared-file integration, retest OWNER-positive visibility vs STAFF ordinary-expense-only, non-member denial, tenant isolation, pre-pagination filtering, CSV, reports/dashboard/P&L/insights, provider payload and log redaction.
- **Customer statement date boundaries:** T40's `customer_statement()` still filters invoice and payment-allocation timestamps using UTC `.date()` rather than the business IANA timezone. Chat 3/5 must complete the documented single-writer handoff before changing shared `extended_api.py`; add Cairo local-midnight cases for both event types.
- **Cross-feature browser journey:** T22's authenticated OWNER/STAFF/non-member browser journey and UI-to-API persistence assertions remain queued behind T03 on PR #315.
- **Runtime validation:** exact-head pytest/full backend suite, PostgreSQL concurrency and browser/E2E execution remain NOT RUN pending an authorized runner. Do not trigger CI while the T03 task-level prohibition remains unresolved.


## Current-source role and financial-integrity audit — 2026-10-28

- **Opening stock authorization:** positive `opening_quantity` now requires OWNER before any product/audit/stock writes. Merged via PR #225; exact PR-head CircleCI passed all four contexts and GitGuardian passed.
- **Duplicate routes:** the repeated GET declarations for recurring invoices, operations health, and tax summary were consolidated through PR #221; retain the route-registration regression and re-check current-main CI.
- **Invoice void after sales return:** `void_invoice` now rejects an issued invoice when an approved sales return exists, preventing a second restoration of the original sold quantity. The fix and SQLite regression test are present on main at commit `6fde1b7191314a8225285f44154fa8963c89ae65`.
- **Concurrent lifecycle coverage:** PR #236 adds a PostgreSQL race test between return approval and invoice voiding and asserts exactly one matching lifecycle audit event commits. Supplemental disposable PostgreSQL 18.6 validation on a layered sandbox snapshot passed **5/5 repeated race runs** and **217 tests, 11 warnings, 0 skipped**. This is not a clean exact-head checkout; exact-head CircleCI remains the merge gate. PR #236 candidate `51c63b79fb36340940a6f9d01ed0e828ee3c4640` passed CircleCI 5/5, but current main advanced to `7d9f270662b7a838ee1eae4748c2df4634c19448`; revalidation is required.
- **Remaining coverage:** complete route × role × tenant negative tests and broader payment/allocation/return/stock lifecycle review. This document records source and test evidence; it does not claim exhaustive authorization coverage or production readiness. PR #236 candidate must pass the current aggregate gate after sync.

## Added regression — non-member supplier creation (2026-10-28)

- `backend/tests/test_api.py::test_nonmember_cannot_create_supplier_without_writes_or_audit_events` uses an isolated SQLite database and a principal with no workspace membership.
- The supplier-create request must return HTTP 403; the test snapshots the business-scoped supplier row count and `AuditEvent` count before the request and verifies neither changes after denial.
- The test was added on branch `test/security-nonmember-supplier-no-write-2026-10-28`; exact-head CircleCI validation is pending. Do not mark this regression verified until the backend-accounting and aggregate checks pass on the exact PR head.
- Scope is intentionally narrow: it closes one explicit non-member/no-side-effect gap and does not claim complete route × role × tenant coverage.


## Non-member CSV export/import denial regression — 2026-10-28

- Current-main baseline: PR #274 merged at `84000ed6a1d2459dedca6296008563dab1147bd8`; customer CSV preview/import UI and business-scoped duplicate-email handling are present.
- Follow-up candidate adds a regression for a principal with no membership in the requested business. Customer CSV export, preview, and import must each return HTTP 403 and leave business-scoped Customer, ImportJob, and AuditEvent counts unchanged.
- PR #244 merged at `c0f9b475f6b86248862f1a58defc2e3223f58046`; its exact-head CircleCI gate passed 7/7 and GitHub Actions checks passed 7/7. Backend test job: 231 passed, 7 skipped, 16 warnings; full test job: 232 passed, 6 skipped, 16 warnings.
- This targeted regression does **not** close tracking issue #276 or prove the full route × role × tenant matrix. Remaining sensitive workflows and authenticated production smoke remain outstanding.
- Local pytest/build: NOT RUN in this connector-only session. No production data or permissions changed. Vercel automatically deployed main after the merge; web root, `/version`, `/health`, and `/readyz` returned HTTP 200. Authenticated production workflows remain NOT RUN.

## Candidate regression — CSV entity × role denial matrix (2026-10-29)

- Branch: `test/security-csv-entity-role-matrix-20261029`; tracking issue: [#276](https://github.com/AbdullahOmaar/ai-business-assistant/issues/276).
- Candidate test: `backend/tests/test_customer_csv_import_api.py::test_nonmember_and_staff_cannot_export_or_import_supported_csv_entities_without_side_effects`.
- Exercises non-member and STAFF denial for customer/product/expense CSV export and customer/product CSV preview/import. Every request must return HTTP 403.
- Each request snapshots business-scoped Customer, Product, Expense, ImportJob, and AuditEvent counts before and after; denied requests must not mutate records or audit state.
- **Status: IMPLEMENTED, NOT YET VERIFIED.** Exact-head CircleCI, especially backend-accounting and aggregate, must pass before this regression is marked verified. Local pytest is NOT RUN in this connector-only session.
- This targeted matrix does not complete issue #276's remaining route × role × tenant coverage or authenticated production smoke.

## Owner-positive CSV authorization regression — 2026-10-29

- Candidate branch: `test/security-csv-owner-positive-20261029`; tracking issue: [#276](https://github.com/AbdullahOmaar/ai-business-assistant/issues/276).
- Test: `backend/tests/test_customer_csv_import_api.py::test_owner_can_export_and_preview_supported_csv_entities`.
- Confirms the authorized OWNER can export customers, products, and expenses and can preview valid customer/product imports (HTTP 200, valid preview, no writes during preview).
- Review found the test omitted `_configure_test_identity(engine)`; fixed on the candidate branch. The test now configures/restores identity and compares business-scoped Customer, Product, Expense, ImportJob, and AuditEvent counts before/after.
- This complements PR #297's STAFF/non-member denial and no-side-effect checks. It is not considered verified until exact-head CircleCI backend-accounting and aggregate checks pass.
- Local pytest is NOT RUN in the connector-only session. No production data, authorization policy, or deployment settings changed; issue #276 remains open for remaining routes and authenticated production smoke.


## Foreign resource-ID access regression — 2026-10-29

- Added `backend/tests/test_business_tenant_boundaries.py::test_owner_cannot_read_or_mutate_foreign_resource_ids_without_side_effects`.
- A tenant-A OWNER attempts GET/PATCH/DELETE against tenant-B customer/product IDs and GET/PATCH/void against a tenant-B invoice through tenant-A routes. Foreign customer/product and invoice reads plus customer/product mutations must return 404; invoice edit/void must return 422 from the scoped workflow validation.
- The test snapshots both tenants' audit-event totals and confirms no audit writes occur; tenant B's customer/product data and issued invoice state/number remain unchanged and readable by tenant B's OWNER.
- The same regression seeds an unlinked issued invoice only in tenant B: tenant A's OWNER data-integrity report must not disclose its ID, while tenant B's OWNER report must include it. Both tenant row snapshots are compared after all reads and denied foreign-PO operations.
- This closes a direct foreign-resource read/update/delete test gap for customer/product/invoice routes. It does not complete the entire route × role × tenant matrix; other routes and authenticated production smoke remain outstanding.
- Exact-head CI and test execution are pending on the dedicated branch. Local pytest/build were not run in this connector session.


## Candidate route-matrix regressions — 2026-10-29

- On the existing PR #302 branch, `backend/tests/test_business_tenant_boundaries.py` now includes `test_purchase_order_approval_is_owner_only_and_idempotent`: STAFF and non-members must be denied; denied requests leave the order draft and add no approval audit event; OWNER approval transitions the order and writes one approval event; duplicate approval is rejected without a second event.
- The same file includes `test_nonmember_cannot_access_remaining_sensitive_route_inventory_without_side_effects`, exercising non-member denial for operations health, tax summary, purchase-order approval, CSV preview, receivables aging, customer statement, audit events, and data-integrity report. Each request is followed by an audit-count assertion.
- Strengthened `test_non_member_cannot_access_or_mutate_customers_products_invoices_or_payments`: every denied GET and POST/PATCH/DELETE now immediately compares the complete protected-row snapshot (Customer, Product, Invoice, InvoiceLine, Payment, PaymentAllocation, StockMovement, AuditEvent) with the pre-request baseline, rather than checking only once after the full sequence.
- It also includes `test_staff_owner_only_route_matrix_and_allowed_read_reports`: STAFF is denied owner-only operations-health, CSV-preview, audit-events, and data-integrity endpoints; STAFF can read tax summary, receivables aging, and a same-business customer statement. All requests assert unchanged business audit counts.
- These tests are **implemented but not yet verified**. Exact-head CircleCI is currently not visible from the GitHub combined-status endpoint; local pytest/build are NOT RUN in this connector-only environment. Do not treat the regressions as passing until exact-head CI completes.
- This is targeted denial coverage, not proof that every role × route × tenant combination or production behavior is verified. Authenticated production smoke remains NOT RUN.


## Supplier creation membership and tenant regression — 2026-10-31

- Added `backend/tests/test_business_tenant_boundaries.py::test_supplier_create_denies_non_members_without_side_effects_and_allows_members` on the existing PR #302 branch.
- This complements the existing `backend/tests/test_api.py::test_nonmember_cannot_create_supplier_without_writes_or_audit_events` count-only regression; it is not a replacement or duplicate assertion.
- A non-member attempts `POST /api/v1/businesses/{business_id}/suppliers`; the API must return HTTP 403 and the new test compares every business-scoped persisted row (including AuditEvent) before and after the denied request.
- OWNER and STAFF positive controls then create suppliers successfully; names are normalized and exactly two `supplier.created` audit events and two tenant-owned Supplier rows are asserted.
- The existing route uniqueness test independently checks that no HTTP method/path pair is registered more than once, protecting the canonical supplier-create route from duplicate registration.
- The same suite now seeds a STAFF member and verifies STAFF can read the tenant's supplier, purchase-order and recurring-invoice lists while receiving only that tenant's IDs; full business-scoped row snapshots (including AuditEvent) remain unchanged after each read.
- **Status: IMPLEMENTED, NOT YET VERIFIED.** No local pytest runner is connected and no CI pipeline was triggered; project QA policy prohibits CI triggers/retries. Do not treat this test as PASS until an authorized exact-head test execution is available.
