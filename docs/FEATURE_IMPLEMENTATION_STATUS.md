# Feature implementation status

Last reviewed: 2026-10-21. This is an evidence-based status snapshot, not a claim that V0 is complete.

**Status key:** Foundation = schema/pure rule/service groundwork exists; Partial = one or more workflows exist but acceptance criteria are not met; Not started = no meaningful implementation found. No feature is considered complete until API authorization, validation, tests, and user-facing behavior meet its acceptance criteria.

| # | Feature | Status | Evidence now in repository | Main work remaining |
|---:|---|---|---|---|
| 1 | Business workspace and profile | Foundation | `Business`, `BusinessMembership` models and migration; settings fields | Authenticated setup/profile APIs, validation, UI, integration tests |
| 2 | Secure membership and roles | Partial | Provider-neutral principal and membership authorization helper; cross-business unit test | Select identity provider, verify tokens at request boundary, enforce role policy, negative API tests |
| 3 | Dashboard overview | Partial | Angular overview shell and sample metrics | Replace sample values with authorized, date-filtered API aggregates and useful empty states |
| 4 | Customer management | Partial | Customer create/list/search/deactivate service functions and audit events | Authenticated API, view/update workflows, schemas, UI, tests |
| 5 | Products and services | Partial | Product create/list/search/deactivate service functions and exact-decimal fields | Authenticated API, edit/category behavior, UI |
| 6 | Sales and invoices | Partial | Draft invoice creation, server totals, issue transition, audit events | API contracts, lifecycle/correction policy, immutable issued snapshots, UI and tests |
| 7 | Payments and allocations | Partial | Payment and allocation service, idempotency-key replay validation | API, payment history/outstanding balances, PostgreSQL concurrency tests |
| 8 | Expense management | Partial | Expense creation service and currency validation | Authenticated CRUD/list/date filters, UI and API tests |
| 9 | Reports and operational alerts | Partial | Currency-separated summary operation; illustrative dashboard alerts | Date filters, reliable outstanding/collection calculations, low-stock/due rules, missing-cost disclosures |
| 10 | Read-only AI business assistant | Not started | Product boundary documented only | Trusted data retrieval, provider decision, citations/periods, insufficient-data handling, no write actions |
| 11 | Inventory and auditable stock movements | Partial | Signed movement service, derived balance checks, receiving/return stock entries | Append-only enforcement, sale/adjustment flows, PostgreSQL concurrency and API tests |
| 12 | Supplier directory | Partial | Supplier create/list/search/deactivate service functions | Authenticated API, edit workflows, validation, UI |
| 13 | Purchase orders and receiving | Partial | Receiving supports partial receipts and stock movements | Create/edit/approve/cancel order workflows, duplicate request semantics, API/UI |
| 14 | Sales returns and credit notes | Partial | Return approval, original-line/quantity checks, stock return movements | Return creation, credit-note/accounting effect, robust duplicate/concurrency tests, UI |
| 15 | Recurring invoices | Foundation | Schedule schema with timezone, interval and next-run fields | Template/snapshot model, idempotent scheduler, generated draft invoices, retry tests |
| 16 | Tax and discount rules | Partial | Pure total calculation and pricing-rule model | Rule selection/scope, snapshot exact applied rates, issue-time immutability, edge-case tests |
| 17 | Reminders and notifications | Partial | Deduplicated pending-notification queue | Due/low-stock triggers, delivery worker/provider boundary, retries and delivery status |
| 18 | Data import and export | Partial | CSV allowlists, header/row limits, export field selection, formula escaping | Authenticated endpoints, preview/row errors, duplicate handling, durable job execution and tenant-scope tests |
| 19 | Audit trail and activity history | Partial | Workflow services add actor/action/target metadata | Broader action coverage, safe change summaries, append-only/retention policy, history API/UI |
| 20 | Business settings, permissions and integrations foundation | Foundation | Business profile/settings fields and owner/staff role enum | Settings APIs/UI, explicit permission matrix, secret-handling contract; integrations remain disabled until configured |

## Global release blockers

1. A trusted authentication/token-verification adapter and request-level business authorization are not implemented. Do not expose business-data endpoints before this boundary is in place.
2. The API currently exposes only `GET /health`; the Angular UI is a sample-data shell, not connected to a backend.
3. Several service tests use in-memory SQLite. PostgreSQL migrations and transaction/row-lock behavior need verification on the exact reviewed commit.
4. The read-only AI assistant, live frontend integration, and user-facing workflows remain unfinished.
5. No deployment, Firebase changes, hosted database, or paid services are included in this work.
