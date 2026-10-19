# ADR-0001: Proposed V0 Application Architecture

- **Status:** Proposed for review; not implemented or deployed
- **Date:** 2026-10-19
- **Scope:** V0 web application and trusted business logic

## Context
V0 handles business membership, customers, catalog items, invoices, payments, expenses, and financial summaries. These require strict business-level isolation, auditable state changes, reliable monetary calculations, and automated tests. The project must remain cost-conscious; existing Firebase and Railway resources must not be changed without explicit approval.

## Proposed stack
- **Frontend:** Angular, as the only V0 client.
- **Backend:** Java + Spring Boot as a modular monolith with a versioned REST API.
- **Database:** PostgreSQL with Flyway-managed schema migrations.
- **Authentication/authorization:** Spring Security. Prefer same-origin hosting with secure, HttpOnly session cookies and CSRF protection. Final production configuration is a separate decision.
- **Testing:** JUnit 5, Spring Boot integration tests, PostgreSQL-backed repository/security tests, and Angular unit tests. Use Testcontainers if practical; otherwise document a local PostgreSQL test path.
- **Local development:** documented Java/Node requirements and a local PostgreSQL option. Docker Compose may be used locally; this does not authorize cloud provisioning.
- **AI:** no AI dependency in the first vertical slice. Add a provider-neutral service boundary only after core data and financial rules are tested.

## Rationale
1. Financial and invoice lifecycle rules live in a trusted backend rather than depending on browser behavior.
2. PostgreSQL transactions, foreign keys, uniqueness constraints, and migrations suit related financial records.
3. A modular monolith keeps V0 simpler than microservices while preserving boundaries.
4. Angular + Spring Boot is a conventional, testable web stack.
5. Local development and tests can precede any hosting choice or cloud cost.

## Initial module boundaries
- identity: authentication and account identity.
- business: businesses, memberships, roles, settings, and currency.
- customers: customer records.
- catalog: products/services and optional inventory fields.
- invoicing: drafts, issue/cancel/correction lifecycle, line items, and totals.
- payments: payment records and allocation to invoices.
- expenses: recorded expenses and cost classifications.
- reporting: read-only projections derived from source records.
- audit: append-only records for important business actions.
- ai: deferred; future suggestions are drafts and consequential changes require confirmation.

These are modules/packages in one backend application, not separate deployable services.

## Security and data invariants
- Every business-owned record is scoped to a business identifier. Authorization must verify active membership before access.
- Never trust a business identifier supplied by the client without checking membership and permissions.
- Owner/staff permissions are enforced in backend services, not only hidden in the UI.
- Cross-business access is denied by default and covered by integration tests.
- Use database transactions for issuing invoices, recording payments, and other multi-record financial changes.
- Use decimal database types and BigDecimal for money, never binary floating-point. Define rounding and currency precision explicitly.
- Invoice totals are reproducible from stored line items and documented discounts/taxes. Do not claim tax compliance in V0.
- Distinguish issued invoice value, payments collected, and outstanding balance.
- Never aggregate different currencies in one total.
- Estimated profit must disclose missing cost/COGS or expense data.
- Issued invoices are not silently overwritten; corrections/cancellations require a reason and audit event.
- Audit events capture actor, business, action, target, timestamp, and AI involvement when applicable. Avoid secrets and unnecessary sensitive payloads in logs.
- Secrets belong in environment configuration, never in Git or Angular bundles.

## Trade-offs and constraints
- This adds backend/database setup compared with a client-only Firebase prototype.
- Hosting and operations remain undecided; this ADR creates no cloud resources.
- Reusing Firebase Auth/Firestore is not ruled out forever, but requires a separate decision. Do not change the existing Firebase project or rules under this proposal.
- Production deployment requires a separate review of TLS, cookies, CSRF, backups, migrations, logging, monitoring, and costs.

## Decision gate
This is a recommended proposal, not an irreversible approval. Review the stack before implementation. No Firebase/Railway changes, paid provisioning, or production deployment are included.
