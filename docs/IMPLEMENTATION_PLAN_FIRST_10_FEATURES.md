# First 10 Product Features — Implementation Plan

- **Status:** Proposed delivery order; implementation is tracked through small pull requests.
- **Architecture:** Follow accepted ADR-001 (Angular + FastAPI + PostgreSQL, SQLAlchemy/Alembic, Pydantic, pytest).
- **Safety:** Local-first only. No deployment, paid services, Firebase changes, or production data.

## Feature order

| # | Feature | Acceptance criteria |
|---|---|---|
| 1 | Business workspace and profile | A business has a name, stable ID, timestamps, and settings boundaries; membership records connect users to businesses; one identity cannot be duplicated within the same business. |
| 2 | Secure membership and roles | Every protected operation verifies identity, active business membership, and role server-side; cross-business access is denied by default and covered by negative tests. Authentication provider selection is a separate decision. |
| 3 | Dashboard overview | Dashboard metrics are derived from authorized records, include clear date ranges, and distinguish sales, collected payments, expenses, and outstanding balances. Empty states are useful. |
| 4 | Customer management | Create, list, view, update, search, and deactivate customers within a business; validate input and prevent cross-business access. |
| 5 | Products and services | Manage catalog records, prices, SKU/category, and active status; money uses exact decimal values; stock tracking is introduced only with auditable stock movements. |
| 6 | Sales and invoices | Create drafts and issue invoices with line items and server-calculated totals; issued invoices are not silently overwritten; changes and voids are auditable. |
| 7 | Payments and allocations | Record payments and allocate them to invoices; prevent over-allocation and duplicate submissions; compute outstanding balances from source records. |
| 8 | Expense management | Record categorized expenses with date, amount, currency, and optional vendor/reference; validate money and business scope; avoid double-counting inventory costs. |
| 9 | Reports and operational alerts | Provide date-filtered summaries from source records, disclose missing cost data, keep currencies separate, and test report calculations against fixtures. |
| 10 | Read-only AI business assistant | Answer questions only from authorized data and verified calculations; cite the relevant records/period where possible; state when data is insufficient; no consequential write actions in this first AI slice. |

## Current delivery slice

Implement the foundation needed before business workflows:

1. PostgreSQL-only environment configuration with no connection at import time.
2. Alembic setup and initial businesses/memberships migration.
3. Automated tests for database URL validation and membership schema invariants.
4. Then implement feature 2 (authentication design, authorization, tenant isolation) before exposing customer, invoice, payment, or other business-data endpoints.

The current schema is groundwork, not proof of tenant isolation. The membership identity field is provider-neutral and does not verify tokens. Do not treat the starter as production-ready.

## Definition of done for each feature

- API contracts and validation are documented.
- Authorization and business scope are enforced at the trusted backend boundary.
- Automated tests cover success, invalid input, permissions, and cross-business access as applicable.
- Financial values use Decimal and database NUMERIC/DECIMAL, with explicit currency rules.
- Migrations are reversible where practical and verified against PostgreSQL.
- Documentation reflects actual behavior and limitations.
- CI passes on the exact commit being reviewed.
- Work is submitted as a reviewable pull request and is not merged without explicit approval.
