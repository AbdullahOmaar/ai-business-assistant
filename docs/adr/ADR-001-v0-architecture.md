# ADR-001: V0 Application Architecture

- **Status:** Accepted for V0 implementation
- **Decision date:** 2026-10-20
- **Decision owner:** Repository owner
- **Scope:** Architecture and local development only; this does not approve deployment or changes to existing cloud services.

## Decision

Use the following stack for V0:

- **Frontend:** Angular (web-first client).
- **Backend:** Python with FastAPI, organized as a modular monolith with a versioned REST API.
- **Database:** PostgreSQL.
- **Persistence and migrations:** SQLAlchemy 2.x and Alembic, subject to compatibility checks during implementation.
- **API schemas:** Pydantic request/response models.
- **Tests:** pytest, FastAPI integration tests, and PostgreSQL-backed tests for authorization and financial invariants.
- **Local development:** documented local setup. A local PostgreSQL installation or Docker Compose may be used; this does not authorize cloud provisioning.
- **AI:** defer external AI-provider integration until core data models, permissions, and calculations are tested. Keep AI behind a provider-neutral service boundary.

## Why this stack

Python/FastAPI supports the intended AI and data workflows while providing explicit API validation. PostgreSQL provides transactions, constraints, and precise numeric types for business and financial records. A modular monolith keeps V0 simpler than a distributed-services architecture while preserving module boundaries.

## V0 module boundaries

Keep these as modules within one backend application, not separate services:

- Identity and access
- Businesses, memberships, roles, settings, and currency
- Customers
- Products and services
- Invoices and invoice lines
- Payments and payment allocations
- Expenses and cost classifications
- Read-only reporting projections
- Audit history
- AI suggestions (deferred)

## Security and financial requirements

1. Every business-owned record must be scoped to a business; verify active membership and role permissions server-side on every read and write.
2. Never trust a client-supplied business ID without checking membership and authorization.
3. Deny cross-business access by default and prove it with integration tests.
4. Store money with PostgreSQL NUMERIC/DECIMAL and Python Decimal, with explicit rounding and currency-precision rules. Do not use binary floating point for monetary calculations.
5. Keep invoice totals, collected payments, allocations, and outstanding balances distinct. Do not silently aggregate different currencies.
6. Prevent over-allocation of payments unless an explicit refund/credit workflow permits it.
7. Do not silently overwrite issued invoices; corrections and cancellations need a reason and an audit event.
8. Disclose missing cost data when estimating profit; do not double-count cost of goods sold and expenses.
9. Record important actions with actor, business, action, target, timestamp, and AI involvement where applicable.
10. AI may suggest or draft changes; consequential changes require human review and confirmation.
11. Keep secrets out of Git and browser bundles. Never use real customer or financial data in the local starter.

## Authentication and existing services

- Do not change the existing Firebase project, Firebase Auth configuration, Firestore rules/data, or Railway resources as part of this decision.
- Whether to retain or integrate Firebase Authentication with FastAPI is a separate security decision. Before integration, document and test token signature/issuer/audience verification, failure behavior, role mapping, and business membership checks.
- Do not provision cloud resources, incur costs, or deploy to production without separate explicit approval and a cost/security review.

## Implementation sequence

1. Review and accept the minimal local FastAPI starter.
2. Add PostgreSQL configuration and Alembic migrations for the initial business/membership schema.
3. Implement authentication integration only after its separate design and tests are approved.
4. Enforce server-side business isolation and owner/staff authorization, with negative cross-tenant tests.
5. Add business/customer/catalog workflows before financial workflows.
6. Add invoices, payments, expenses, and reports with transaction, currency, idempotency, and audit tests.
7. Consider AI integrations only after core workflows are reliable and consequential actions require confirmation.

## Consequences and open decisions

- The team must support both TypeScript/Angular and Python.
- Local PostgreSQL setup is an additional development requirement.
- Hosting, production operations, backup/recovery, monitoring, and cloud costs remain undecided and require a separate review.
- Flutter/mobile is deferred until validated demand justifies a second client.
- This ADR selects the V0 stack; it does not claim the application is production-ready.
