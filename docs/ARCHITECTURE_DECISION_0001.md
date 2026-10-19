# ADR-0001: Proposed V0 Application Architecture

- **Status:** Proposed for review; not implemented or deployed
- **Date:** 2026-10-19

## Context
V0 handles business membership, customers, catalog items, invoices, payments, expenses, and financial summaries. These require strict business-level isolation, auditable state changes, reliable monetary calculations, and automated tests. Python is the intended backend language. Existing Firebase and Railway resources must not be changed without explicit approval.

## Proposed stack
- **Frontend:** Angular, the only V0 client.
- **Backend:** Python + FastAPI as a modular monolith with a versioned REST API.
- **Database:** PostgreSQL.
- **Persistence/migrations:** SQLAlchemy and Alembic, subject to compatibility checks during scaffolding.
- **Validation:** Pydantic request/response schemas.
- **Testing:** pytest, FastAPI integration tests, and PostgreSQL-backed security/financial tests.
- **Local development:** documented Python/Node requirements and a local PostgreSQL option. Local Docker Compose is acceptable but does not authorize cloud provisioning.
- **AI:** no external AI dependency in the first vertical slice; add a provider-neutral Python service boundary after core data and calculations are tested.

## Rationale
Python is the intended language and aligns with future AI/data workflows. FastAPI provides typed API boundaries; PostgreSQL transactions, constraints, and migrations suit related financial records. A modular monolith is simpler than microservices for V0. Local tests can precede any hosting choice or cloud cost.

## Initial modules
- identity: authentication and account identity.
- business: businesses, memberships, roles, settings, and currency.
- customers: customer records.
- catalog: products/services and optional inventory.
- invoicing: drafts, issue/cancel/correction lifecycle, line items, and totals.
- payments: payment records and invoice allocation.
- expenses: expenses and cost classifications.
- reporting: read-only projections from source records.
- audit: append-only records for important actions.
- ai: deferred; suggestions are drafts and consequential changes require confirmation.

These remain modules in one application, not separate services.

## Security and financial invariants
- Every business-owned record is scoped to a business; verify active membership before access.
- Never trust a client-supplied business identifier without checking membership and permissions.
- Enforce owner/staff permissions in backend services, not just the UI.
- Deny cross-business access by default and prove it with integration tests.
- Use transactions for invoice issuance, payment recording, and multi-record financial changes.
- Use PostgreSQL NUMERIC/DECIMAL and Python Decimal for money, never binary floating-point. Define rounding and currency precision.
- Reproduce invoice totals from stored line items and documented rules; do not claim tax compliance in V0.
- Separate issued invoice value, collected payments, and outstanding balance.
- Never aggregate different currencies into one total.
- Disclose missing COGS/direct costs/expense data when estimating profit.
- Never silently overwrite issued invoices; corrections/cancellations require a reason and audit event.
- Audit important actions with actor, business, action, target, timestamp, and AI involvement when applicable.
- Keep secrets out of Git and Angular bundles.

## Trade-offs and constraints
Backend/database setup is more involved than a client-only Firebase prototype. Hosting remains undecided. Reusing Firebase Auth/Firestore would require a separate decision; do not change the existing Firebase project or rules under this proposal. Production deployment requires a separate security, recovery, operations, and cost review.

## Decision gate
This is a proposal, not an irreversible approval. Confirm Python + FastAPI and the local PostgreSQL workflow before implementation. No Firebase/Railway changes, paid provisioning, or production deployment are included.