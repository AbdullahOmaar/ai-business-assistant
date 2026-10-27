# Authenticated API Route Inventory

**Reviewed:** 2026-10-23  
**Scope:** FastAPI routes registered by `backend/app/main.py`, `api.py`, `core_features_api.py`, `extended_api.py`, and `assistant_api.py`.  
**Purpose:** Source-level inventory for security review. This document is not a claim that every endpoint has exhaustive integration coverage.

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


## Current-source role audit — updated 2026-10-28

**Baseline:** source review began on earlier mainline snapshots. This section is a source-level security review, not a claim that every route has exhaustive runtime authorization coverage.

### Confirmed issue — opening stock through product creation

- The OWNER-only check for positive `opening_quantity` now executes before product, audit, or stock writes.
- Regression coverage verifies STAFF with positive opening stock is denied without persisted side effects, STAFF with zero opening quantity remains allowed, and OWNER with positive opening quantity succeeds.
- Fix merged through [PR #225](https://github.com/AbdullahOmaar/ai-business-assistant/pull/225), merge commit `e4117291ab64bbac395ba6c64c15bbf1914d27b4`; all four exact-head CircleCI contexts and GitGuardian passed on PR head `84377e500d2464bcfc94394b30e9a8e3ad8a5fd3`.

### SEC-002 — duplicate route declarations

- The duplicate GET declarations for recurring invoices, operations health, and tax summary were consolidated through PR #221; the route-registration regression remains part of the codebase.
- Re-check exact current-main CI before treating the merge commit as release-verified.

### Remaining authorization coverage

- Explicit OWNER-only checks exist for invoice issue/void, payment recording, direct stock movements, purchase-order approval/receiving, sales-return approval, recurring-invoice creation, pricing-rule creation, notification creation, settings writes, CSV import/export, customer/product deactivation, product price or stock-tracking changes, membership changes, operational health, audit-event reads, and data-integrity reporting.
- Broader membership-authorized CRUD, expense/supplier, return-creation, and report routes still need a documented product-role matrix and route × role × tenant negative tests. Do not infer a policy change or broaden/narrow roles without that matrix.
- A further financial integrity defect was identified during the current review: voiding an issued invoice after an approved sales return could restore the full original stock again. Candidate fix blocks voiding when approved returns exist; a regression reproduces the baseline failure and passes after the fix. The prior candidate passed all four CircleCI contexts; after syncing this newer mainline commit, exact-head CI must run again.
