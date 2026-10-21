# AI Business Assistant

AI-powered business assistant for retail shops and service providers.

## Accepted V0 architecture

- Frontend: Angular.
- Backend: Python + FastAPI.
- Database: PostgreSQL.
- ORM and migrations: SQLAlchemy + Alembic.
- Validation and tests: Pydantic + pytest.
- Local-first development; deployment and identity-provider choices require separate decisions.

See [ADR-001 — V0 architecture](docs/adr/ADR-001-v0-architecture.md).

## Product principles

- Keep each business's data isolated.
- Distinguish invoiced sales, collected payments, and outstanding balances.
- Never combine currencies without an explicit conversion policy.
- Treat profit as an estimate when cost data is incomplete.
- Require human approval for consequential AI-proposed changes and keep important actions auditable.
- Derive stock balances from recorded movements rather than silently overwriting quantity totals.

## Project documentation

- [Product scope](docs/PRODUCT_SCOPE.md)
- [First 10 features and acceptance criteria](docs/IMPLEMENTATION_PLAN_FIRST_10_FEATURES.md)
- [First 10 features implementation audit](docs/FIRST_10_FEATURES_AUDIT.md)
- [Proposed second 10 features and acceptance criteria](docs/IMPLEMENTATION_PLAN_SECOND_10_FEATURES.md)
- [Architecture baseline](docs/ARCHITECTURE_BASELINE.md)
- [Production deployment runbook](docs/PRODUCTION_DEPLOYMENT.md)

## Current status (implementation branch)

The implementation branch now includes:
- PostgreSQL-backed business/workspace schema and migrations, membership authorization primitives, and a fail-closed trusted identity resolver boundary.
- Workspace creation/profile and membership-scoped workspace listing; customer/product/invoice APIs; expenses, purchasing/returns, CSV import/export, currency-separated reports, and deterministic insights.
- Firebase Admin ID-token verification adapter, fail-closed startup behavior, PostgreSQL session configuration, exact-origin CORS, and `/readyz` readiness checks (runtime credentials still required).
- Angular email/password sign-in, authenticated API client, live dashboard/customer/product/invoice views, invoice draft editing/issuing/voiding, and a record-grounded AI chat UI.
- Invoice issuance now records stock deductions as auditable stock movements for tracked products and rejects insufficient stock.
- A date-filtered dashboard API that separates invoiced sales, recorded payments, expenses, and outstanding balances by currency.
- GitHub Actions that run backend tests, apply migrations to a disposable PostgreSQL service, and build the Angular frontend.

**Not production-ready yet:** the Firebase project/service-account configuration, production PostgreSQL URL, frontend runtime config, and backend host are not configured; therefore the frontend remains in setup mode and `/readyz` is not ready. AI chat requires a backend-only `OPENAI_API_KEY`. Issued invoices with allocated payments cannot be voided directly; use a refund/credit-note workflow. The Angular draft editor supports multiple catalog-product and manual item/service lines, including editing existing drafts. Recurring invoice schedules and notification records still need background execution/delivery workers. Review [the production runbook](docs/PRODUCTION_DEPLOYMENT.md) before production use.

The Firebase verifier and client SDK are implemented in code only. No Firebase project settings or production database were changed, and no production backend was deployed.
