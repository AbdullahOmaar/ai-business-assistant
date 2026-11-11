# AI Business Assistant

AI-powered business assistant for retail shops and service providers.

## Live links and deployment

- **Live frontend:** https://ai-business-assistant-web.vercel.app
- **Backend API base URL:** https://ai-business-assistant-api.vercel.app
- **Backend readiness check:** https://ai-business-assistant-api.vercel.app/readyz
- **Frontend Vercel project:** https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-web
- **Backend Vercel project:** https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api
- **Backend environment settings:** https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api/settings/environment-variables
- **Firebase Authentication:** https://console.firebase.google.com/project/ai-business-assistant-97f37/authentication
- **CI:** GitHub Actions only — [workflow runs](https://github.com/AbdullahOmaar/ai-business-assistant/actions). The active default-branch ruleset requires the exact-SHA `all-checks-passed` aggregate. CircleCI's GitHub webhook was disabled on 2026-11-11; no CircleCI schedules remain.
- **First 15-feature roadmap:** [docs/IMPLEMENTATION_PLAN_NEXT_15_FEATURES.md](docs/IMPLEMENTATION_PLAN_NEXT_15_FEATURES.md)
- **Additional 10-feature roadmap:** [docs/IMPLEMENTATION_PLAN_NEXT_10_FEATURES.md](docs/IMPLEMENTATION_PLAN_NEXT_10_FEATURES.md)
- **Mobile navigation PR (merged):** https://github.com/AbdullahOmaar/ai-business-assistant/pull/55
- **Tenant, invoice, and AI regression tests:** https://github.com/AbdullahOmaar/ai-business-assistant/pull/51
- **Production deployment runbook:** [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)

**Deployment caveat:** These are configured production aliases, not proof that every recent source change is deployed or that the full sign-in flow works. On 23 October 2026, the frontend alias and backend `/readyz` endpoint responded with HTTP 200; the frontend HTML still contains a startup fallback until Angular initializes, so browser-level validation remains necessary. Vercel has previously rejected deployment attempts due to the free daily deployment limit. Confirm the latest production deployment commit in Vercel before release.

Never place Firebase service-account credentials, database passwords, or API secrets in this README, frontend runtime configuration, or source control. Configure secrets only in the appropriate backend environment settings.

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

- [Contribution guide, roles, and engineering workflow](CONTRIBUTING.md)
- [In-app feature catalogue and release history policy](docs/RELEASE_HISTORY.md)
- [Product scope](docs/PRODUCT_SCOPE.md)
- [First 10 features and acceptance criteria](docs/IMPLEMENTATION_PLAN_FIRST_10_FEATURES.md)
- [First 10 features implementation audit](docs/FIRST_10_FEATURES_AUDIT.md)
- [Proposed second 10 features and acceptance criteria](docs/IMPLEMENTATION_PLAN_SECOND_10_FEATURES.md)
- [Architecture baseline](docs/ARCHITECTURE_BASELINE.md)
- [Production deployment runbook](docs/PRODUCTION_DEPLOYMENT.md)

## Current implementation status

The repository includes:
- PostgreSQL-backed business/workspace schema and migrations, membership authorization primitives, and a fail-closed trusted identity resolver boundary.
- Workspace creation/profile and membership-scoped workspace listing; customer/product/invoice APIs; expenses, purchasing/returns, CSV import/export, currency-separated reports, and deterministic insights.
- Firebase Admin ID-token verification adapter, fail-closed startup behavior, PostgreSQL session configuration, exact-origin CORS, and `/readyz` readiness checks (runtime credentials still required).
- Angular email/password sign-in, authenticated API client, live dashboard/customer/product/invoice views, invoice draft editing/issuing/voiding, and a record-grounded AI chat UI.
- Invoice issuance stock deductions as auditable stock movements for tracked products and insufficient-stock validation.
- A date-filtered dashboard API that separates invoiced sales, recorded payments, expenses, and outstanding balances by currency.
- GitHub Actions is the sole CI provider for backend tests, PostgreSQL migration validation, frontend unit tests/builds, Playwright browser smoke, backend container checks, and dependency/security audits. Its `all-checks-passed` aggregate is required by the active default-branch ruleset.
- Regression tests for cross-business authorization boundaries, invoice state transitions, and AI input/provider safety.

## Release blockers and known limitations

- Confirm production Firebase web-app configuration, backend service-account credentials, production PostgreSQL connectivity, CORS, and frontend runtime configuration using the deployment runbook.
- AI chat requires a backend-only `OPENAI_API_KEY`; do not expose it to the browser.
- Real Android Chrome checks for mobile navigation, install flow, keyboard/viewport behavior, and the latest deployed commit remain outstanding.
- Issued invoices with allocated payments must not be voided directly; refunds/credit notes need a separate workflow.
- The quick editor supports a single product line per draft even though the API supports multiple lines.
- Recurring invoice schedules and notification records still need background execution/delivery workers.
- Do not consider a release complete until CI is green for the release commit, production deployment is confirmed, and authenticated smoke tests are completed safely.

Review [the production runbook](docs/PRODUCTION_DEPLOYMENT.md) before production use.

## Mobile release verification

Before declaring the mobile release complete, follow the [Android mobile release checklist](docs/MOBILE_RELEASE_CHECKLIST.md). A successful deployment response alone does not verify sign-in, navigation, or install behavior on a physical device.
