# Authenticated API Route Inventory

**Reviewed:** 2026-10-23  
**Scope:** FastAPI routes registered by `backend/app/main.py`, `api.py`, `core_features_api.py`, `extended_api.py`, and `assistant_api.py`.  
**Purpose:** Source-level inventory for security review. This document is not a claim that every endpoint has exhaustive integration coverage.


## Denied-mutation regression evidence — PR #251 candidate

- Current main at sync: `8facda01faa66dcad758be8d31c85fc1df114182`. It retains the 16-request STAFF denial regression, permitted ordinary product-name edit, and business-scoped audit-event count invariant.
- Candidate extension snapshots every persisted column for each business-scoped `Customer`, `Invoice`, `InvoiceLine`, `Payment`, `Supplier`, and `PurchaseOrder` row before the denied-request batch, then compares full row snapshots afterward. Each of the 16 denied requests is now executed sequentially with its own before/after business-scoped `AuditEvent` count and an explicit HTTP 403 assertion, preventing a passing batch total from masking which individual request emitted an audit event.
- Previous exact candidate `aec8493a535410ca58dc0b138fda164751809adb` had five CircleCI contexts PASS and backend-accounting FAIL (run 2003). Private job logs were inaccessible. Supplemental diagnostic on a non-exact sandbox snapshot: focused denial test **1 passed**; full backend suite **221 passed, 11 warnings**; `alembic check` reported no new upgrade operations; offline migration SQL generated; `pip-audit` found no known vulnerabilities. These results are not exact-head verification and do not override the CircleCI failure.
- Fresh exact-head CI must pass after this synchronization. No application permission policy was changed.
- Remaining gaps: exhaustive route × role × tenant coverage, including OWNER-positive, STAFF/non-member, foreign-business IDs, and field-level no-write/no-audit checks, remains open under issues #110 and #244.

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

### Workspace and dashboard — `backend/app/core_features_api.py` (prefix `/api/v1`)

| Method | Path | Access expectation |
|---|---|---|
| GET | `/api/v1/businesses` | Trusted principal; return only memberships for that user |
| POST | `/api/v1/businesses` | Trusted principal; create workspace and owner membership transactionally |
| GET | `/api/v1/businesses/{business_id}` | Active membership required |
| PATCH | `/api/v1/businesses/{business_id}` | Active membership/role policy required |
| GET | `/api/v1/businesses/{business_id}/dashboard` | Active membership required; aggregates scoped to business |

### Core business workflows — `backend/app/api.py` (prefix `/api/v1`)

| Method | Path | Access expectation |
|---|---|---|
| POST | `/api/v1/businesses/{business_id}/customers` | Membership required |
| POST | `/api/v1/businesses/{business_id}/suppliers` | Membership required |
| POST | `/api/v1/businesses/{business_id}/products` | Membership required |
| POST | `/api/v1/businesses/{business_id}/invoices` | Membership required; customer/product IDs must belong to same business |
| POST | `/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue` | Membership and invoice ownership required |
| PATCH | `/api/v1/businesses/{business_id}/invoices/{invoice_id}` | Membership, same-business invoice, and draft-state checks required |
| POST | `/api/v1/businesses/{business_id}/invoices/{invoice_id}/void` | Membership, same-business invoice, and lifecycle rules required |
| POST | `/api/v1/businesses/{business_id}/stock-movements` | Membership and same-business product required |
| POST | `/api/v1/businesses/{business_id}/payments` | Membership; allocations must target issued invoices in the same business |

### Extended business workflows — `backend/app/extended_api.py` (prefix `/api/v1/businesses/{business_id}`)

All paths below inherit the business ID in the prefix and require a trusted principal plus membership authorization.

| Method | Path suffix | Access expectation |
|---|---|---|
| POST | `/expenses` | Membership required |
| GET | `/expenses` | Membership required; filter by business |
| POST | `/purchase-orders` | Membership; supplier/products must be in same business |
| POST | `/purchase-orders/{order_id}/receive` | Membership and same-business order/lines |
| POST | `/sales-returns` | Membership; invoice and invoice lines must be same-business |
| POST | `/sales-returns/{return_id}/approve` | Membership and same-business return |
| POST | `/recurring-invoices` | Membership; customer reference must be same-business |
| POST | `/pricing-rules` | Membership required |
| POST | `/notifications` | Membership required |
| GET | `/notifications` | Membership required; filter by business |
| PUT | `/settings/{setting_key}` | Membership/role policy required |
| GET | `/reports/summary` | Membership required; aggregates scoped by business and currency |
| GET | `/exports/{entity_type}.csv` | Membership required; export data scoped by business |
| POST | `/imports/{entity_type}.csv` | Membership required; imported references must not cross businesses |
| GET | `/customers` | Membership required; filter by business |
| GET | `/customers/{customer_id}` | Membership and same-business customer |
| PATCH | `/customers/{customer_id}` | Membership and same-business customer |
| DELETE | `/customers/{customer_id}` | Membership and same-business customer |
| GET | `/products` | Membership required; filter by business |
| GET | `/products/{product_id}` | Membership and same-business product |
| PATCH | `/products/{product_id}` | Membership and same-business product |
| DELETE | `/products/{product_id}` | Membership and same-business product |
| GET | `/payments` | Membership required; payments and allocations scoped by business |
| GET | `/invoices/{invoice_id}` | Membership and same-business invoice/lines |
| GET | `/invoices` | Membership required; filter by business |
| GET | `/assistant/insights` | Membership required; read-only aggregates scoped by business |

### AI assistant — `backend/app/assistant_api.py` (prefix `/api/v1/businesses/{business_id}/assistant`)

| Method | Path | Access expectation |
|---|---|---|
| POST | `/api/v1/businesses/{business_id}/assistant/chat` | Membership check before provider configuration/use; bounded input; reject caller-supplied system/tool roles; never expose another tenant’s records |

## Current regression-test evidence

- [PR #51 — tenant, invoice lifecycle, and AI safety tests](https://github.com/AbdullahOmaar/ai-business-assistant/pull/51) is merged. It covers workspace/dashboard access denial, issued-invoice edit rejection, AI input bounds, missing-provider safe failure, timeout-safe failure, and source-ID filtering.
- [PR #53 — expanded cross-tenant resource tests](https://github.com/AbdullahOmaar/ai-business-assistant/pull/53) adds passing CI coverage for customer/product/invoice/payment/expense/report/insight reads, unauthorized writes/deactivation, foreign customer/product IDs in invoice creation, and foreign invoice IDs in payment allocations. It is a separate open PR, not yet merged.
- CI evidence for PR #53 latest tested commit: [backend tests](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39979705976), [backend container verification](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39979706021), and [combined backend/frontend CI](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39979705944).

## Remaining coverage gaps

The route inventory is broader than current negative integration tests. Add explicit non-member and foreign-ID tests for supplier CRUD, stock movements, purchase orders/receiving, sales returns/approval, recurring invoices, pricing rules, notifications, settings/role enforcement, CSV import/export, and invoice lifecycle/payment reversal boundaries. Confirm authorization is evaluated before any external provider use or persistent mutation. Treat this inventory as a checklist to update whenever routes are added or changed.


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
- Local pytest/build: NOT RUN in this connector-only session. No production data, permissions, or deployment changed.
