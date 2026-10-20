# Architecture Baseline — V0 Stack Accepted

## Status
**V0 stack accepted for implementation on 2026-10-20.** See [ADR-001: V0 Application Architecture](adr/ADR-001-v0-architecture.md) for the decision and constraints. Hosting and production deployment remain undecided.

## Selected stack
- **Web client:** Angular.
- **Backend:** Python + FastAPI modular monolith with a versioned REST API.
- **Database:** PostgreSQL.
- **Persistence/migrations:** SQLAlchemy + Alembic.
- **API validation:** Pydantic.
- **Tests:** pytest, API integration tests, and PostgreSQL-backed security/financial tests.
- **Local development first:** no cloud provisioning is required for the initial implementation.

Flutter/mobile is deferred until validated demand justifies a second client.

## Non-negotiable requirements
- Enforce authorization and business isolation at the trusted API/data boundary on every read and write.
- Never trust a client-supplied business identifier without checking membership and permissions.
- Keep secrets out of source control and client bundles.
- Use PostgreSQL NUMERIC/DECIMAL and Python Decimal for money; define rounding and currency precision.
- Distinguish invoice value, collected payments, allocations, outstanding balances, expenses, and estimated profit.
- Never silently aggregate currencies or overwrite issued invoices.
- Make important invoice/payment/expense and AI-assisted changes auditable.
- Keep AI integrations behind a service boundary; consequential changes require human confirmation.
- Include migrations, automated tests, environment setup, and a clear local-development guide.
- Prove tenant isolation, owner/staff permissions, allocation limits, idempotency, currency handling, and audit behavior with tests before financial features are considered ready.

## Existing infrastructure constraints
- Do not modify the existing Firebase project, Firebase Auth settings, Firestore rules/data, or any Railway resource as part of this architecture decision.
- Firebase Authentication integration with FastAPI requires a separate documented and tested decision covering token verification, issuer/audience, failure handling, role mapping, and business membership.
- Do not provision paid services, incur costs, or deploy to production without explicit approval and a cost/security review.
- Do not reuse unrelated Railway projects/resources.

## Implementation sequence
1. Review the existing local FastAPI starter.
2. Add local PostgreSQL configuration and Alembic migrations.
3. Design and test authentication integration before enabling protected endpoints.
4. Enforce tenant isolation and roles server-side with negative cross-business tests.
5. Implement core business, customer, and catalog workflows.
6. Add financial workflows with transactions, precise money types, idempotency, and audit history.
7. Consider AI integrations after the core workflows are tested.

## Engineering guardrails
- Work in small, reviewable changes on feature branches and pull requests.
- Do not merge pull requests without explicit owner approval.
- Never commit credentials, tokens, real customer data, or production secrets.
- Do not claim production readiness until security, tests, deployment, and operational behavior have been verified.
