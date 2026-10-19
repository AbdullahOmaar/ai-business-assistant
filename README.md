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
- [Architecture decision proposal (ADR-0001)](docs/ARCHITECTURE_DECISION_0001.md)
- [Phased implementation plan](docs/IMPLEMENTATION_PLAN.md)

## Status
The repository is at the architecture/foundation stage. The proposed stack is Angular + Python/FastAPI + PostgreSQL, pending review. No application code has been scaffolded and no deployment target is selected. Do not change existing Firebase/Railway resources or provision paid infrastructure without explicit approval.