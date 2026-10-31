# Existing Product Feature Inventory — 2026-10-26

## Current demo UI inventory — 2026-11-01 (source-only refresh)

This section supersedes the historical frontend-screen summary below for the current main revision. The remainder of this document is a 2026-10-26 source snapshot; its backend endpoint list and older verification notes have not been fully re-audited against the current main SHA.

- **Current source:** `main` at `dcb0853ab06dc9271b1109db03eb84ab2e3360c8`, release `v1.3.5`.
- **Production:** Vercel Web and API deployments are both `READY` on this exact SHA. The latest 24-hour Vercel runtime-error query returned no errors; the latest 30-minute error/fatal log query returned no entries. T50 previously recorded direct `/version`, `/readyz`, `/health` and Web-root HTTP 200 probes against this same deployment. These are health/shell checks, not authenticated product acceptance.
- **Verification boundary:** this is a source-level UI inventory only. Authenticated OWNER/STAFF/non-member journeys, manual browser interaction, mobile viewport, keyboard, RTL and accessibility checks remain **NOT RUN**.

### Current tab destinations

The root Angular app declares 19 tab destinations and corresponding `setTab` navigation handlers:

| Area | UI destination | Visibility / limitation |
|---|---|---|
| Home | Overview / dashboard | Default workspace view |
| Customers | Customer directory and statements | Workspace-scoped |
| Products | Products and inventory | Workspace-scoped; inventory completeness needs separate acceptance |
| Invoices | Invoice drafts, issue/void and list | Server remains authoritative for totals and validation |
| Payments | Payment recording and allocations | OWNER-only navigation |
| Expenses | Expense recording and list | Workspace-scoped |
| Employees | Employee and payroll workspace | OWNER-only navigation; payroll policy remains restricted |
| Assistant | AI assistant | Model-backed behavior depends on backend provider configuration |
| Reports | Profit & loss and receivables views | Current P&L is preliminary; not a reconciled GL/net-profit report |
| Taxes | Tax summary | OWNER-only; reads saved invoice tax totals, not tax-rule configuration or compliance |
| Audit | Activity log | Intended OWNER-only; mobile menu currently exposes the item without the OWNER wrapper (P1 UI defect; API authorization must be independently verified) |
| Integrity | Data integrity review | OWNER-only, read-only |
| Release Guide | In-app feature/release guide | Current catalogue has 9 groups; see coverage gap below |
| Platform Admin | Platform administration | Only when `platformAdminAvailable` is true |
| Suppliers | Supplier directory | Workspace-scoped |
| Purchases | Purchase orders and receiving | Receiving is OWNER-only; no AP/supplier-payment semantics are implied |
| Recurring | Recurring invoice schedules | Schedule configuration only; automatic invoice generation requires a deployed scheduler worker |
| Notifications | Notification queue | Stores notification metadata/status; delivery requires a configured provider and deployed worker |
| Health | Operational health | OWNER-only, read-only |

### Navigation and discoverability

- **Desktop:** the sidebar contains the module destinations, with Owner/Platform Admin visibility conditions.
- **Mobile:** the bottom dock intentionally has four slots (Home, Invoices, Customers, More). Secondary destinations are grouped in the scrollable More menu; this is a responsive navigation choice, not proof that every workflow is complete.
- **Home quick access:** the current Home `quick-grid` links only to Customers, Products, Invoices and AI Assistant. The remaining existing destinations are discoverable through the sidebar / More menu but are not surfaced from the Home dashboard. A role-aware **All Modules / Quick Access** launcher is a P1 demo-discoverability improvement.
- **Mobile More active state:** its active-tab expression omits `suppliers`, `purchases`, `recurring`, `notifications`, `health`, `integrity` and `taxes`. More may not remain highlighted when those destinations are active (P2 UI defect).
- **Role consistency:** desktop Activity Log is OWNER-only, but its mobile More menu item is currently unconditional. Hide it for non-owners in the UI and independently verify server-side OWNER/STAFF/non-member authorization; frontend visibility is never an authorization boundary.
- **Feature catalogue coverage:** `FEATURE_CATALOG` currently contains 9 groups (workspace, customers, products, invoices, payments, finance, employees/payroll, assistant, admin). It does not document the existing Supplier Directory, Purchase Orders/Receiving, Recurring Schedules, Notification Queue, Data Integrity Review, Operational Health or Tax Summary destinations. Add only verified current functionality and preserve the limitations stated above.

### Standalone static demo warning

The repository also contains `demo/index.html` and `frontend/public/demo/index.html`. These are standalone illustrative prototypes with local synthetic data and simulated interactions; they are explicitly labelled as independent demos and are not connected to the production API, Firebase authentication, PostgreSQL or real financial workflows. They must not be presented as proof that the corresponding production features work. Use the authenticated Angular application for the real product demo; use the static pages only when clearly labelled as mock prototypes.

### Safe demo scope — do not present as implemented

The Production V1 Charter requires several larger capabilities that are not established by the current UI inventory, including a reconciled double-entry GL/Trial Balance, complete AP and supplier-payment lifecycle, approved inventory valuation/COGS, bank/cash reconciliation, fully reconciled cash-flow/Balance Sheet reporting, period close, and Egypt tax/ETA compliance. Do not expose these as live modules or imply completion from a model/table, a static mock-up or a planned issue. T37 remains DRAFT / NOT APPROVED; do not invent financial, tax, posting or payroll semantics.

---


## Scope and evidence

- Source baseline reviewed: `main` at `dec7f26bd2bb33a4c27af4e785abe982e8486676`.
- This is a source-level inventory, not proof that each workflow works in production.
- Frontend is a single Angular standalone root component with tab-based navigation; no Angular Router route declarations were found in the reviewed source.
- Backend routers are registered in `backend/app/main.py`. The current source contains the endpoints listed below.
- Product scope is unchanged. Entries labelled API-only/modelled are not represented as complete user-facing features.

## Frontend screens and visible workflows

The current tab union in `frontend/src/app/app.component.ts` contains:

| Tab / area | Visible workflows identified in source | API/data dependencies | Verification status |
|---|---|---|---|
| Overview / Home | Workspace selection and creation; dashboard metrics for invoiced sales, collected payments, expenses and outstanding balances; reporting period controls; profit/loss and receivables aging | Workspace, dashboard, profit/loss, invoices/payments/expenses and aging endpoints | Source mapped; browser interaction not executed |
| Customers | Customer list/management entry point | Customer list/detail/create/update/delete APIs | Source mapped; browser interaction not executed |
| Products & inventory | Product catalog and inventory-related display | Product list/detail/update/delete; product creation and stock-movement APIs | Source mapped; full inventory workflow not manually verified |
| Invoices | Invoice list/detail and invoice workflow; invoice drafts and issue actions appear in current API contracts/UI source | Invoice list/detail/create/draft update/issue/void APIs | Source mapped; end-to-end behavior not executed |
| Payments | Payment list and recorded allocations | Payment list and record-payment APIs | Source mapped; concurrency/idempotency not proven against PostgreSQL |
| AI assistant | Chat/assistant interaction and suggestions | Tenant-scoped assistant chat/insights APIs; requires configured provider key for model-backed response | Source mapped; live provider behavior not exercised |
| Reports | Financial reporting, currency-separated results, receivables aging | Dashboard, profit/loss, summary, receivables-aging endpoints | Source mapped; financial report timezone defect pending PR #143 |

Other visible states include sign-in/sign-up, loading and retry states, workspace setup, language selection (Arabic/English), mobile navigation, app installation guidance, and UI/API build-version metadata. These are states/flows within the existing app, not additional product modules.

## Backend HTTP endpoint inventory

Prefixes below are relative to the registered FastAPI app. Most business endpoints are under `/api/v1`.

### Runtime
- `GET /health` — process liveness only.
- `GET /readyz` — readiness check for configured database/principal dependencies.
- `GET /version` — runtime version metadata.

### Workspace, settings and dashboard — `core_features_api.py`
- `GET /api/v1/businesses`
- `POST /api/v1/businesses`
- `GET /api/v1/businesses/{business_id}`
- `PATCH /api/v1/businesses/{business_id}`
- `GET /api/v1/businesses/{business_id}/dashboard`
- `GET /api/v1/businesses/{business_id}/profit-loss`

### Core business workflows — `api.py`
- `POST /api/v1/businesses/{business_id}/customers`
- `POST /api/v1/businesses/{business_id}/suppliers`
- `POST /api/v1/businesses/{business_id}/products`
- `POST /api/v1/businesses/{business_id}/invoices`
- `POST /api/v1/businesses/{business_id}/invoices/issue`
- `POST /api/v1/businesses/{business_id}/invoices/{invoice_id}/issue`
- `PATCH /api/v1/businesses/{business_id}/invoices/{invoice_id}`
- `POST /api/v1/businesses/{business_id}/invoices/{invoice_id}/void`
- `POST /api/v1/businesses/{business_id}/stock-movements`
- `POST /api/v1/businesses/{business_id}/payments`

### Extended workflows — `extended_api.py`
- Create expenses, purchase orders, sales returns, recurring invoice schedules, pricing rules and notifications.
- List notifications; update business settings.
- Read financial summaries, customer/product/payment/expense/invoice lists and details, profit/receivables reports and assistant insights.
- Export supported entity data to CSV; preview and execute supported CSV imports.
- Exact endpoint decorators are in `backend/app/extended_api.py`; each handler still requires per-route authorization and input/output review.

### AI assistant — `assistant_api.py`
- `POST /api/v1/businesses/{business_id}/assistant/chat` — tenant-scoped chat with bounded history and selected business data.

## Data model found in `backend/app/models.py`

- Identity and tenancy: `Business`, `BusinessMembership`, `MembershipRole`.
- Catalog and inventory: `Product`, `StockMovement`.
- Parties: `Customer`, `Supplier`.
- Receivables: `Invoice`, `InvoiceLine`, `Payment`, `PaymentAllocation`.
- Operating records: `Expense`, `PurchaseOrder`, `PurchaseOrderLine`, `SalesReturn`, `SalesReturnLine`.
- Supporting workflows: `RecurringInvoiceSchedule`, `PricingRule`, `Notification`, `AuditEvent`, `ImportJob`, `BusinessSetting`.

A model/table is not evidence that its complete lifecycle is exposed, implemented, and tested.

## Existing test suites discovered

- API and core workflow: `test_api.py`, `test_core_features_api.py`, `test_main.py`.
- Authentication/authorization/tenant isolation: `test_firebase_auth.py`, `test_security.py`, `test_assistant_security.py`, `test_business_tenant_boundaries.py`.
- Domain and financial behavior: `test_domain_rules.py`, `test_services.py`, `test_operations.py`, `test_invoice_lifecycle_edges.py`, `test_receivables_aging.py`.
- Data exchange and persistence: `test_data_exchange.py`, `test_database_config.py`, `test_domain_models.py`, `test_models.py`.
- Frontend: `workspace-load-guard.spec.ts`; further component/browser coverage was not identified in the initial source tree scan.
- CI run results are currently not evidence of test execution: observed failed jobs had `runner_id=0` and zero steps. No suite is marked passed by this inventory.

## Confirmed gaps / release gates

1. PR #143's business-timezone fix is not merged and its tests have not been shown to pass. The added test initially covered one local-day boundary; DST spring/fall boundary assertions have since been added on the PR branch and still need a real runner.
2. CI execution is blocked by jobs failing before runner assignment; retry attempt 2 for run 40250433967 also concluded failure. Job logs are unavailable (BlobNotFound/404). Root cause remains an external runner/platform/access blocker unless later logs establish otherwise.
3. The accounting audit explicitly says profit/loss is preliminary operational reporting, not a general ledger or complete net-profit calculation; cost of goods sold/inventory valuation, FX accounting, jurisdiction-aware tax filing, balanced double-entry ledger, reconciliation, and period close are not implemented.
4. PostgreSQL concurrency/idempotency for payments and stock updates requires database-backed tests. SQLite/in-memory unit tests do not prove row-lock or transaction behavior in PostgreSQL.
5. Production deployment SHA/aliases, authenticated read-only smoke tests, runtime secrets/configuration, and Android Chrome installed-PWA update behavior are not verified from this audit environment. Vercel API calls currently return 403 Not authorized.
6. UI source review is not a substitute for desktop/mobile browser testing. No physical Android Chrome test was performed.

## Next execution order

1. Obtain a usable GitHub Actions runner/log and run the checks on the exact candidate SHAs.
2. Complete PR #143's DST and timezone-update regression coverage, run tests, then review and merge only after required checks are evidenced.
3. Review the security route inventory against every extended endpoint and add negative cross-tenant/role tests where coverage is missing.
4. Run the full backend suite, Alembic checks and PostgreSQL concurrency cases; run frontend tests and production build.
5. Resolve actual dependency scan findings from scanner output, not assumptions.
6. Verify Vercel production project/alias/SHA access, then conduct approved authenticated read-only smoke tests and installed-PWA checks.
7. Update the production-readiness report with evidence and issue the final verdict. Until all critical gates pass, status remains **NOT CLEARED FOR PRODUCTION**.
