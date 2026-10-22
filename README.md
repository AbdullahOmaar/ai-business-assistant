# AI Business Assistant

AI-powered business assistant for retail shops and service providers.

## Live links and deployment

- **Live frontend:** https://ai-business-assistant-web.vercel.app
- **Backend API base URL:** https://ai-business-assistant-api.vercel.app
- **Backend readiness check:** https://ai-business-assistant-api.vercel.app/readyz
- **Frontend Vercel project and deployments:** https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-web
- **Backend Vercel project and deployments:** https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api
- **Backend environment variables:** https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api/settings/environment-variables
- **Firebase Authentication settings:** https://console.firebase.google.com/project/ai-business-assistant-97f37/authentication
- **GitHub repository:** https://github.com/AbdullahOmaar/ai-business-assistant
- **GitHub Actions / CI:** https://github.com/AbdullahOmaar/ai-business-assistant/actions
- **Current auth + language fix PR:** https://github.com/AbdullahOmaar/ai-business-assistant/pull/47
- **Production deployment runbook:** [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)

> **Deployment status:** The frontend and backend URLs above are the configured production aliases, but this does not mean the latest branch changes are deployed. The last verified production frontend deployment points to an older commit. The latest preview deployment attempt was blocked by Vercel's daily deployment API limit. Do not treat the current production build as containing PR #47 until a successful deployment is confirmed. Check /readyz, Firebase web-app configuration and authorized domains, backend CORS, and the frontend runtime config before relying on sign-in or AI features. Never put service-account credentials or API secrets in runtime-config.json or this README.

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

**Not production-ready yet:** the Firebase project/service-account configuration, production PostgreSQL URL, frontend runtime config, and backend host are not configured; therefore the frontend remains in setup mode and `/readyz` is not ready. AI chat requires a backend-only `OPENAI_API_KEY`. Issued invoices with allocated payments cannot be voided directly; use a refund/credit-note workflow. The quick editor in the UI supports a single product line per draft, while the API supports multiple lines. Recurring invoice schedules and notification records still need background execution/delivery workers. Review [the production runbook](docs/PRODUCTION_DEPLOYMENT.md) before production use.

The Firebase verifier and client SDK are implemented in code only. No Firebase project settings or production database were changed, and no production backend was deployed.


## Mobile experience and installation

- On phones, primary navigation uses four fixed bottom destinations: overview, sales/invoices, customers, and **More**. Products, payments, and the AI assistant are grouped in the More menu to avoid cramped six-item navigation.
- The app provides a mobile **Install app / تثبيت التطبيق** action when it is not running as an installed app. Chromium browsers can show the native install prompt when installability criteria are met; otherwise the action explains how to use the browser menu. On iOS, use Safari's Share menu and choose **Add to Home Screen**.
- PWA metadata is in `frontend/public/manifest.webmanifest`, the scalable icon is in `frontend/public/icons/icon.svg`, and the minimal service worker is in `frontend/public/sw.js`. The worker caches only the shell entry/manifest/icon and does not cache API responses or business data.
- These changes are on the implementation branch and are **not yet confirmed deployed**. Verify the production build and a real Android Chrome install flow before considering the installation work complete.
