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
- [Proposed second 10 features and acceptance criteria](docs/IMPLEMENTATION_PLAN_SECOND_10_FEATURES.md)
- [Architecture baseline](docs/ARCHITECTURE_BASELINE.md)

## Current status (implementation branch)

The implementation branch now includes:
- PostgreSQL-backed business/workspace schema and migrations, membership authorization primitives, and a fail-closed trusted identity resolver boundary.
- Workspace creation/profile endpoints, customer/product/invoice listing, customer/product/invoice/payment creation workflows, expense and purchasing/return workflows, CSV import/export, currency-separated reports, and deterministic read-only insights.
- Invoice issuance now records stock deductions as auditable stock movements for tracked products and rejects insufficient stock.
- A date-filtered dashboard API that separates invoiced sales, recorded payments, expenses, and outstanding balances by currency.
- GitHub Actions that run backend tests, apply migrations to a disposable PostgreSQL service, and build the Angular frontend.

**Not production-ready yet:** no trusted token verifier is configured; the deployed Angular shell is not connected to a live API/database; the frontend is still a non-interactive progress/dashboard shell; full customer/product update/deactivation flows, invoice detail/edit/void lifecycle, richer payment history, and true generative-AI chat are incomplete. Recurring invoice scheduling and notification delivery are represented by data/workflow endpoints but do not run background workers. Review the open, stacked PRs in dependency order before merging or using real business data.

No Firebase changes or production database access were made.
