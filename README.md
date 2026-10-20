# AI Business Assistant

AI-powered business assistant for retail shops and service providers.

## V0 focus
A secure, multi-business workspace for customer and product/service records, invoices, payments, expenses, basic reporting, and carefully bounded AI insights.

## Principles
- Keep each business's data isolated.
- Distinguish invoiced sales, collected payments, and outstanding balances.
- Never combine currencies without an explicit conversion policy.
- Treat profit as an estimate when cost data is incomplete.
- Require human approval for consequential AI-proposed changes and keep important actions auditable.

## Project documentation
- [Product scope](docs/PRODUCT_SCOPE.md)
- [Architecture baseline](docs/ARCHITECTURE_BASELINE.md)
- [ADR-001: V0 application architecture](docs/adr/ADR-001-v0-architecture.md)

## Status
The V0 stack is accepted for implementation: **Angular + Python/FastAPI + PostgreSQL**, using SQLAlchemy/Alembic and pytest. Work remains local-first. Hosting and production deployment are undecided. Existing Firebase and Railway resources must not be changed, and no paid resources may be provisioned, without separate explicit approval. See ADR-001 for security, financial, and implementation requirements.
