# Architecture Baseline — Accepted V0

## Status

**Accepted for V0 implementation.** [ADR-001 — V0 Application Architecture](adr/ADR-001-v0-architecture.md), accepted on 2026-10-20 by the repository owner, is the authoritative decision. This summary must not reopen choices settled by the ADR.

## Approved stack

- Frontend: Angular (web-first).
- Backend: Python + FastAPI, as a modular monolith with a versioned REST API.
- Database and migrations: PostgreSQL, SQLAlchemy 2.x, Alembic.
- Request/response validation: Pydantic.
- Tests: pytest, API integration tests, and PostgreSQL-backed authorization/financial invariant tests.
- Identity: the existing implementation uses a trusted Firebase ID-token verification boundary. Changing the identity provider, Firebase project, or security rules requires a separate review and approval.
- AI: provider-neutral service boundary; consequential changes require human review and confirmation.

## Required constraints

- Enforce active business/workspace membership and role permissions server-side for every relevant read and write.
- Deny cross-business access by default and prove it with negative integration tests.
- Keep credentials and provider keys server-side, never in source control or browser assets.
- Use decimal types with explicit rounding/currency policy. Keep invoiced sales, collected payments, allocations, expenses, and outstanding balances distinct.
- Use transactions and audit events for consequential changes; derive stock balances from recorded movements.
- Do not silently overwrite issued invoices, payment allocations, stock balances, or other derived financial state.
- Use disposable test data; never point tests or migration validation at production.

## Outside this decision

This ADR selects the V0 application stack only. It does not authorize deployment, paid cloud provisioning, destructive migrations, production-data changes, or changes to Firebase/Firestore/Railway resources. Operations, backups/recovery, monitoring, and cloud costs remain subject to their runbooks and required approvals. A second client such as Flutter remains deferred until validated demand justifies it.

## References

- [ADR-001](adr/ADR-001-v0-architecture.md)
- [Security route inventory](SECURITY_ROUTE_INVENTORY.md)
- [Production deployment runbook](PRODUCTION_DEPLOYMENT.md)
- [Contributor roles and workflow](../CONTRIBUTING.md)
