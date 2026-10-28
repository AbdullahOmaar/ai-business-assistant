# Authenticated API Route Inventory

**Reviewed:** 2026-10-23  
**Scope:** FastAPI routes registered by `backend/app/main.py`, `api.py`, `core_features_api.py`, `extended_api.py`, and `assistant_api.py`.  
**Purpose:** Source-level inventory for security review. This document is not a claim that every endpoint has exhaustive integration coverage.


## Denied-mutation regression evidence — PR #251 (merged)

- Merged at main SHA `a62502c981fad9a63c05813ed81f86956802f83a`; exact PR-head CircleCI passed all six substantive jobs plus the aggregate (7/7) before merge.
- `backend/tests/test_api.py::test_staff_is_denied_sensitive_business_routes` executes 16 denied STAFF requests sequentially. Each request must return HTTP 403 and leave the business-scoped `AuditEvent` count unchanged. The test also compares persisted fields for business-scoped `Customer`, `Invoice`, `InvoiceLine`, `Payment`, `Supplier`, and `PurchaseOrder` rows before and after the denied batch.
- This is a STAFF negative/no-side-effect regression, not proof of exhaustive OWNER-positive, non-member, foreign-business-ID, or route × role × tenant coverage.
- Main SHA `d9f942bf9959fe4829d975c1685c232a95890dc3` later passed CircleCI 7/7. Vercel deployment contexts are a separate build-rate-limit issue; no permission policy was changed by PR #251.
- Proposed PR #261 adds foreign-ID tests for invoice issue, payment allocation, stock movement, purchase-order creation/receiving, and sales-return creation/approval. These tests are **NOT VERIFIED** until the exact current PR head and aggregate pass.

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

## Non-member supplier creation regression — present on main

- `backend/tests/test_api.py::test_nonmember_cannot_create_supplier_without_writes_or_audit_events` uses an isolated SQLite database and a principal with no workspace membership.
- The supplier-create request must return HTTP 403; the test snapshots the business-scoped supplier row count and `AuditEvent` count before the request and verifies neither changes after denial.
- The test is present on main SHA `d9f942bf9959fe4829d975c1685c232a95890dc3`; exact-main CircleCI passed 7/7 at the last verified poll.
- Scope is intentionally narrow: it closes one explicit non-member/no-side-effect gap and does not claim complete route × role × tenant coverage.


## Foreign-business sensitive lifecycle regression — PR #261 candidate

- Candidate test: `backend/tests/test_api.py::test_owner_cannot_mutate_foreign_business_financial_and_stock_ids`.
- It creates two isolated workspaces and attempts eight cross-business operations as an authenticated OWNER: issue a foreign invoice, allocate payment to a foreign invoice, create stock movement for a foreign product, create a purchase order with foreign supplier/product IDs, receive a foreign purchase order, create a return for a foreign invoice, and approve a foreign sales return.
- Each attempt expects HTTP 422 and snapshots audit-event counts plus purchase-order, sales-return, payment, allocation, stock-movement and lifecycle state before/after. Prior heads `19866b7c9407cf162bc4c04093ebea65c8c319c1` (job 2493) and `91756fc89004166329ea9935a4e892c54a6c79dc` (job 2521) each had five CircleCI contexts PASS and `backend-accounting` FAIL; aggregate did not report. Logs are inaccessible through the connected integration, so the cause remains UNVERIFIED. The latest code head splits the purchase-order supplier/product attempts and expands state snapshots; exact-head CI is pending. Treat this as proposed coverage, not verified protection, and do not merge until a clean exact-head run passes.
- The broader authorization matrix remains open until OWNER-positive, STAFF/non-member, and foreign-business-ID cases are covered for every sensitive route.
