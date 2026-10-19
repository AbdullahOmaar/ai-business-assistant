# V0 Implementation Plan

**Status:** Proposed sequence; implementation has not started.

## Phase 0 — Architecture and foundation
- [ ] Confirm Python + FastAPI proposal and local PostgreSQL workflow.
- [ ] Add Python/Angular ignore rules, repository conventions, and secret protection.
- [ ] Select compatible Python, Node, and Angular versions.
- [ ] Document local setup and quality checks.
- [ ] No production deployment or cloud-resource changes.

**Exit criteria:** setup and test commands are documented; no credentials are required or committed.

## Phase 1 — Authentication, membership, isolation
- [ ] Implement sign-in/session handling and logout.
- [ ] Create business and membership models with OWNER and STAFF roles.
- [ ] Require active membership for every business-scoped API.
- [ ] Test cross-business read/write denial, role permissions, and unauthenticated requests.

## Phase 2 — Customers and catalog
- [ ] Add business-scoped customer and product/service CRUD.
- [ ] Support service items and optional inventory tracking.
- [ ] Test validation, authorization, and tenant isolation.

## Phase 3 — Invoices and payments
- [ ] Define invoice draft/issued/cancelled/corrected lifecycle.
- [ ] Store monetary values as Decimal/NUMERIC with explicit currency.
- [ ] Recalculate totals in the backend and transact financial operations.
- [ ] Record payment allocations and derive outstanding balances from source records.
- [ ] Add audit events and invalid-transition tests.

**Exit criteria:** invoiced, collected, and outstanding amounts are separately reproducible.

## Phase 4 — Expenses and reporting
- [ ] Record expenses with dates, categories, amounts, currency, and business scope.
- [ ] Build reports from source records.
- [ ] Add low-stock alerts only when inventory tracking is enabled.
- [ ] Disclose missing data in estimated-profit reports.
- [ ] Reject or separate cross-currency aggregation.

## Phase 5 — AI insights (deferred)
- [ ] Define a provider-neutral Python AI service boundary and data-minimization rules.
- [ ] Use read-only, business-scoped context for initial insights.
- [ ] Label facts, estimates, assumptions, and missing data.
- [ ] Return drafts; require explicit confirmation before consequential writes.
- [ ] Audit AI-assisted actions and test that AI cannot bypass authorization.

## Definition of done
Automated tests cover normal, invalid, unauthorized, and cross-business cases. Keep changes reviewable and documentation current. No secrets, real customer data, unapproved infrastructure changes, or unapproved costs. Do not call the system production-ready until security, deployment, recovery, and operations are verified.