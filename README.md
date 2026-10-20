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

## Current status

The repository is in the implementation/foundation stage. The current PRs add local backend configuration, initial migrations, and inventory schema groundwork. Authentication, request-level authorization, tenant isolation at the API boundary, business workflows, and live PostgreSQL integration verification are not complete. Do not use this starter with real customer or financial data.

No deployment, Firebase changes, cloud resources, or paid services are included in this work.
