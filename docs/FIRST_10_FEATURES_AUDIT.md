# First 10 Features — Implementation Audit

**Reviewed branch:** `feat/api-workflows-and-angular-shell`  
**Review date:** 2026-10-21  
**Architecture:** Angular + FastAPI + PostgreSQL  
**Safety status:** PR #10 merged (FastAPI starter); no Firebase project settings changed; no production database accessed or backend deployed.

## Feature-by-feature status

| # | Feature | Evidence present on this branch | Status / remaining work |
|---|---|---|---|
| 1 | Business workspace and profile | PostgreSQL schema; Firebase-verified workspace creation; profile GET/PATCH; Angular onboarding | **Implemented in code** — configure the production Firebase project and database before live use |
| 2 | Secure membership and roles | Firebase Admin verifies bearer ID tokens; project-qualified subject; membership-scoped workspace listing; server-side membership checks; `/readyz` fails closed without DB and verifier | **Implemented in code / release blocker** — real project credentials and production cross-tenant tests still required |
| 3 | Dashboard overview | Date-filtered API and Angular dashboard display sales, collected payments, expenses, and outstanding balances separately by currency | **Connected in code** — requires deployed API/database and runtime config |
| 4 | Customer management | Create, search, list, detail, update, soft-deactivate; Angular list/create form; business scope and audit events | **Core flow connected** — update/deactivation UI and more adversarial tenant tests remain |
| 5 | Products and services | Create/list/detail/update/soft-deactivate; Angular catalog/create form; exact decimal price; stock derived from movement ledger | **Core flow connected** — update/deactivation UI and broader adversarial tests remain |
| 6 | Sales and invoices | Draft create/edit, issue/list/detail, void with audit trail; stock deducted on issue and restored on void; void blocked for invoices with allocated payments; Angular single-line draft editor and lifecycle actions | **Core lifecycle implemented** — UI editor supports one product line; refund/credit-note workflow and multi-line editing UI remain |
| 7 | Payments and allocations | Idempotent payment recording, replay payload validation, payment history/allocations, currency and outstanding constraints | **Partial** — broader PostgreSQL concurrency tests and payment UI remain |
| 8 | Expense management | Validated create/list workflows and explicit currency/date; expense totals in dashboard and reports | **Partial** — update/archive UX and additional API tests remain |
| 9 | Reports and operational alerts | Currency-separated summary, date-filtered dashboard, low/zero-stock deterministic alert, CSV tools | **Partial** — richer period comparisons and operational alert delivery remain |
| 10 | Read-only AI business assistant | Tenant-scoped generative chat; bounded recent invoices/expenses and counts; validates cited IDs against current workspace; connected Angular chat UI | **Implemented in code** — configure backend-only `OPENAI_API_KEY`; provider responses and real multi-tenant abuse tests remain release gates |

## Verification evidence

- Current reviewed application commit `526ce2d47afab0c84a6b0c9ffef0de7013725821` passed:
  - [Backend tests run #89](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39631431312) — pytest, PostgreSQL migration upgrade/head validation, and offline migration SQL rendering passed.
  - [Backend + frontend run #96](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39631431153) — backend tests, PostgreSQL migration validation, and Angular production build passed.
- A separate CI failure on PR #16 was fixed by updating the expected model-table registry; [run #90](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39631695464) now passes.
- The CI migration check uses a disposable PostgreSQL instance. It does not verify production credentials, real Firebase project configuration, production network access, or full browser E2E.
- The latest Angular build must still be checked for npm audit findings before production release.

## Important correctness and security findings

1. **Inventory correctness:** issuing an invoice checks tracked product balances and appends negative stock movements atomically. Voiding an unpaid issued invoice restores tracked stock with an auditable return movement. Invoices with allocated payments are not voided directly; the caller must record a refund/credit note first.
2. **Authentication:** Firebase Admin token verification is implemented and never trusts caller-supplied identity headers. Production project credentials are not configured here; `/readyz` stays unready until the database and verifier are configured.
3. **Financial reporting:** sales, collected payments, expenses, and outstanding balances are distinct values. Currency totals are never combined, and no net-profit claim is made.
4. **Frontend:** Angular now has Firebase sign-in, a token-bearing API client, and dashboard/customer/product/invoice/assistant views. It remains in setup mode until `frontend/public/runtime-config.json` receives the real public Firebase web config and deployed API URL.
5. **Operational workers:** recurring schedules and notification rows do not themselves execute recurring invoices or deliver messages.

## Release checklist still required

- Configure the Firebase project, backend service-account secret, PostgreSQL URL, exact CORS origins, frontend runtime config, and backend host.
- Add/update/deactivate UI flows for customers/products/expenses and payment operations.
- Add multi-line invoice editing UI, refund/credit-note workflow, and end-to-end browser tests.
- Add end-to-end tests for cross-business denial and owner/staff permissions using real Firebase tokens.
- Resolve any high-severity npm audit findings and commit a reproducible lockfile.
- Confirm CI is green on the exact merge candidate.
- Merge feature PRs in a clean dependency order; the older stacked PR chain has merge conflicts after PR #10 was squash-merged.
