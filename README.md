# AI Business Assistant

AI-powered business assistant for retail shops and service providers.

## V0 focus
A secure, multi-business workspace for customer and product/service records, invoices, payments, expenses, basic reporting, and carefully bounded AI insights.

## Mandatory project rules
**Every person and AI agent must follow [Project Governance and Engineering Rules](docs/PROJECT_GOVERNANCE.md).** They cover Git workflow, approvals, security, privacy, financial integrity, AI use, testing, infrastructure, and incident handling. Do not begin work until you have read them.

## Principles
- Keep each business's data isolated.
- Distinguish invoiced sales, collected payments, and outstanding balances.
- Never combine currencies without an explicit conversion policy.
- Treat profit as an estimate when cost data is incomplete.
- Require human approval for consequential AI-proposed changes and keep important actions auditable.

## Project documentation
- [Mandatory project governance](docs/PROJECT_GOVERNANCE.md)
- [Product scope](docs/PRODUCT_SCOPE.md)
- [Architecture baseline and decision checklist](docs/ARCHITECTURE_BASELINE.md)

## Status
The repository is at the planning/foundation stage. The implementation stack and deployment target are not yet approved. See the architecture baseline before provisioning infrastructure or changing existing Firebase/Railway resources.
