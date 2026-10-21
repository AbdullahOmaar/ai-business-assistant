# First 10 Features — Implementation Audit

**Reviewed branch:** `feat/api-workflows-and-angular-shell`  
**Review date:** 2026-10-21  
**Architecture:** Angular + FastAPI + PostgreSQL  
**Safety status:** no PR merged, no Firebase changes, no production database accessed.

## Feature-by-feature status

| # | Feature | Evidence present on this branch | Status / remaining work |
|---|---|---|---|
| 1 | Business workspace and profile | PostgreSQL business/membership schema; create workspace assigns verified creator as owner; profile GET/PATCH | **Partial** — trusted identity adapter and onboarding UI are not configured |
| 2 | Secure membership and roles | Server-side membership checks; owner-only profile updates; cross-business negative service test; endpoints fail closed without trusted resolver | **Partial / release blocker** — no real token verifier is selected or configured; role policy needs review across all write endpoints |
| 3 | Dashboard overview | Date-filtered API separates issued sales, recorded payments, expenses, and outstanding balances by currency; empty-state and invalid-date tests | **API foundation** — Angular page is not connected to this endpoint; no live metrics in deployed shell |
| 4 | Customer management | Create/list endpoints and business-scoped records | **Partial** — customer detail/update/deactivation/search and API-level authorization tests remain |
| 5 | Products and services | Create/list endpoints; exact decimal price; stock is derived from movement ledger | **Partial** — catalog update/archive and full product CRUD remain |
| 6 | Sales and invoices | Draft creation, server-calculated totals, issue endpoint, invoice list; tracked stock is deducted as an auditable movement on issue | **Partial** — invoice detail, safe draft editing, void/correction workflow, and complete API tests remain |
| 7 | Payments and allocations | Idempotent payment recording; allocation/currency/outstanding constraints; dashboard derives outstanding balances | **Partial** — payment history endpoint and broader PostgreSQL concurrency tests remain |
| 8 | Expense management | Validated create workflow and explicit currency/date; expense totals in dashboard and reports | **Partial** — list/detail/update/archive UX and additional API tests remain |
| 9 | Reports and operational alerts | Currency-separated summary, date-filtered dashboard, low/zero-stock deterministic alert, CSV tools | **Partial** — richer period comparisons and operational alert delivery remain |
| 10 | Read-only AI business assistant | Deterministic database-derived insights; no invented profit calculation; currencies separated; explicit limitations | **Foundation only** — no actual generative AI/chat provider, record-level citations, or connected frontend chat |

## Verification evidence

- Earlier CI run on the previous commit passed backend tests, PostgreSQL migrations, and Angular build: [workflow run #13](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39625644932).
- After the latest review changes, new CI runs were started; their results must be checked before calling the latest commit verified:
  - [Backend tests run #58](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39626805299)
  - [Backend + frontend run #26](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/39626805778)
- PostgreSQL migration CI validates schema application, but the service workflow's unit tests do not replace real-world auth-provider and end-to-end browser tests.
- The Angular production build previously reported four high-severity npm audit findings. Review/remediate these before production release.

## Important correctness and security findings

1. **Inventory correctness:** issuing an invoice previously changed only invoice status. The workflow now checks stock-tracked product balances and appends negative stock movements in the same transaction; insufficient stock rejects issuing. New tests cover both paths.
2. **Authentication:** the principal resolver deliberately fails closed until a trusted verifier is configured. Do not treat a test resolver or caller-supplied headers as authentication.
3. **Financial reporting:** sales, collected payments, expenses, and outstanding balances are distinct values. Currency totals are never combined, and no net-profit claim is made.
4. **Frontend:** the deployed page is a progress shell, not a connected business application. It currently shows no live business data.
5. **Operational workers:** recurring schedules and notification rows do not themselves execute recurring invoices or deliver messages.

## Release checklist still required

- Configure and integration-test a trusted identity provider/token verifier.
- Complete customer/product/invoice/payment/expense read-update-deactivate flows.
- Connect Angular routes/forms to the authenticated API and test mobile/desktop flows.
- Add end-to-end tests for cross-business denial and owner/staff permissions.
- Resolve high-severity npm audit findings and pin reproducible dependencies.
- Confirm current CI is green on the exact PR head.
- Review and merge stacked PRs in dependency order only after explicit approval.
