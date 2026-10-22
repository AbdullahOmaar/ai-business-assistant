# Business-scoped API route inventory

Generated from the current `main` source on 2026-10-22. This is a source review, not a claim that every negative integration test has passed.

## Shared trust boundary
- `get_principal` in `backend/app/dependencies.py` requires `app.state.principal_resolver`; it fails closed with 503 if the verifier is not configured and rejects non-`AuthenticatedPrincipal` results.
- `firebase_principal_resolver` in `backend/app/firebase_auth.py` requires a Bearer Firebase ID token and calls `auth.verify_id_token(..., check_revoked=True)`; invalid/expired tokens return 401, missing server configuration returns 503.
- Business membership is checked via `authorize_membership` in `backend/app/security.py`. It requires an active business and matching `user_subject`.
- Most protected routes inject both `get_session` and `get_principal`. Handler-level membership checks and resource ownership checks still require route-by-route negative tests; dependency injection alone is not proof of tenant isolation.

## Route groups

### `backend/app/core_features_api.py` — prefix `/api/v1`
| Method | Route | Access type | Review/test focus |
|---|---|---|---|
| GET | `/businesses` | Authenticated identity; memberships filtered by subject | List only caller's memberships |
| POST | `/businesses` | Authenticated identity; creates workspace/membership | Ownership created for verified subject only |
| GET | `/businesses/{business_id}` | Business membership required | Foreign/inactive workspace denied |
| PATCH | `/businesses/{business_id}` | Business membership required | Cross-tenant update denied |
| GET | `/businesses/{business_id}/dashboard` | Business membership required; aggregate reads | Totals/counts scoped to business |

### `backend/app/api.py` — prefix `/api/v1`
| Method | Route | Access type | Review/test focus |
|---|---|---|---|
| POST | `/businesses/{business_id}/customers` | Principal + membership/service layer | Customer business_id derived from path; foreign references denied |
| POST | `/businesses/{business_id}/suppliers` | Principal + membership/service layer | Supplier belongs to path business |
| POST | `/businesses/{business_id}/products` | Principal + membership/service layer | Product belongs to path business |
| POST | `/businesses/{business_id}/invoices` | Principal + membership/service layer | Customer/product references same tenant |
| POST | `/businesses/{business_id}/invoices/{invoice_id}/issue` | Principal + membership/service layer | Invoice ownership and legal state transition |
| PATCH | `/businesses/{business_id}/invoices/{invoice_id}` | Principal + membership/service layer | Draft-only edits; invoice ownership |
| POST | `/businesses/{business_id}/invoices/{invoice_id}/void` | Principal + membership/service layer | Ownership, void rules, stock effects |
| POST | `/businesses/{business_id}/stock-movements` | Principal + membership/service layer | Product ownership and atomic stock update |
| POST | `/businesses/{business_id}/payments` | Principal + membership/service layer | Invoice allocation, currency, overpayment, idempotency |

### `backend/app/extended_api.py` — prefix `/api/v1/businesses/{business_id}`
All routes below inject a verified principal and a database session. Confirm the handler's shared business authorization and per-resource ownership checks with negative tests.

| Method | Route | Access type | Review/test focus |
|---|---|---|---|
| POST | `/expenses` | Business write | Amount/currency validation; tenant-scoped expense |
| POST | `/purchase-orders` | Business write | Product ownership, totals and currency |
| POST | `/purchase-orders/{order_id}/receive` | Business mutation | Order ownership; stock effects exactly once |
| POST | `/sales-returns` | Business write | Invoice/product ownership and quantities |
| POST | `/sales-returns/{return_id}/approve` | Business mutation | Return ownership; stock side effects |
| POST | `/recurring-invoices` | Business write | Customer/product tenant scope and schedule validation |
| POST | `/pricing-rules` | Business write | Rule scope, ranges and deterministic matching |
| POST/GET | `/notifications` | Business write/read | No cross-tenant notification access |
| PUT | `/settings/{setting_key}` | Business write | Setting allowlist and tenant isolation |
| GET | `/reports/summary` | Business read | Totals and currency remain scoped |
| GET | `/exports/{entity_type}.csv` | Business read/export | Entity allowlist; no cross-tenant rows |
| POST | `/imports/{entity_type}.csv` | Business write/import | Entity allowlist, row limits, atomicity, references |
| GET | `/customers`, `/customers/{customer_id}` | Business read | List and detail tenant scope |
| PATCH/DELETE | `/customers/{customer_id}` | Business mutation | Ownership; deletion constraints |
| GET | `/products`, `/products/{product_id}` | Business read | List and detail tenant scope |
| PATCH/DELETE | `/products/{product_id}` | Business mutation | Ownership; inventory/history constraints |
| GET | `/payments` | Business read | Allocations and payments scoped |
| GET | `/expenses` | Business read | Expenses scoped |
| GET | `/invoices`, `/invoices/{invoice_id}` | Business read | Invoice and line ownership |
| GET | `/assistant/insights` | Business read | Aggregates scoped; no provider side effects |

### `backend/app/assistant_api.py` — prefix `/api/v1/businesses/{business_id}/assistant`
| Method | Route | Access type | Review/test focus |
|---|---|---|---|
| POST | `/chat` | Verified principal + active membership; business-scoped invoice/expense/count queries | Cross-tenant denial, prompt-injection input, history/input budget, provider timeout/retry, malformed output |

## Cross-cutting routes
- `GET /health` is process liveness only; it does not prove database readiness, Firebase verification, or business workflow health.
- CORS is configured from `CORS_ALLOWED_ORIGINS`; verify production values are explicit and contain no wildcard when credentials are enabled.

## Gaps to close before release
1. Add automated negative tests for every resource group: foreign business ID, foreign resource ID, foreign customer/product references, and attempted mutations.
2. Add payment tests for duplicate idempotency key, changed payload reuse, currency mismatch, partial allocations and concurrent writes.
3. Confirm every extended handler calls the common business membership guard before querying/mutating and that resource IDs are additionally filtered by `business_id`.
4. Replace stale comments in `security.py` that say token verification is not implemented; Firebase adapter is now present.
5. This inventory does not mark any test as passed; run CI and inspect results before changing task status to Done.
