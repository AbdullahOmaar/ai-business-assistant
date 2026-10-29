# Notion source snapshot: T40 — EPIC: Expenses, Cash Flow & Financial Reports

- Source: https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30?pvs=204
- Page ID: 407bbf2b-c2c5-81cf-bb0f-d5ddc67b4a30
- Last edited reported by Notion: 2026-10-29T00:29:41.759Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30 as of 2026-10-29T00:29:41.759Z:
<page url="https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30">
<page-discussions discussion-count="1" url="pageDiscussions://407bbf2b-c2c5-81cf-bb0f-d5ddc67b4a30">

</page-discussions>

<ancestor-path>
<parent-data-source url="collection://6d386e1d-2db9-49e7-82c1-abe0029d033d" name="AI Business Assistant — Master Task Plan"/>
<ancestor-2-database url="https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f" title="AI Business Assistant — Master Task Plan"/>
<ancestor-3-page url="https://app.notion.com/p/407bbf2bc2c581aeae3cdd3282cd3366" title="06 — Delivery / QA / Release"/>
<ancestor-4-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-5-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"Acceptance Criteria":"Expense recording/approval/settlement and source-grounded, currency-separated reports reconcile across invoices, cash receipts, receivables, supplier payables/payments, stock costs and expenses; reversals/refunds and date boundaries are handled; profit estimates disclose missing costs; tenant/role tests and exact-head CI pass.","Dependencies":"T37 shared contracts; T38 sales/refund/return semantics; T39 supplier payable/payment and approved costing/COGS contract; Master signs off metric definitions.","Execution Order":40,"Feature Owner / Chat":"Chat 3 — Expenses & Reports","GitHub / Evidence":"https://github.com/AbdullahOmaar/ai-business-assistant/pull/304","Phase":"Phase 2 - Core workflows","Priority":"P0 - Release blocker","Status":"In progress","Task name":"T40 — EPIC: Expenses, Cash Flow & Financial Reports","User Action Required":"__NO__","Workstream":"Expenses & reports","date:Due:is_datetime":0,"url":"https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
## Epic objective

Make expense management and financial reporting trustworthy and reproducible.

### Scope

- Expense lifecycle and explicit actual-paid versus approved/due states where supported.
- Dashboard/report definitions for invoiced sales, cash collected, receivables, payables, supplier payments, expenses, stock cost/COGS, and cash flow.
- Currency separation, date/timezone rules, source references, reversal/refund handling and safe exports if already authorized.
- Explain incomplete data; treat profit as an estimate when costs are incomplete.

### Exit gate

Every metric is traceable to source transactions and reconciles for each currency/date range. Issued sales are not cash, supplier bills are not payments, costs are not double-counted, and missing cost coverage is visible. Permissions, tenant isolation, date/currency, refund and reconciliation tests pass.

### Work order

<mention url="https://app.notion.com/p/407bbf2bc2c581bea2c9f76058c492e0" />

### Execution note

Audit/spec may begin now. Implementation waits for Master-approved sales and procurement events/cost data. Payroll posting must expose an agreed integration point. No merge/deploy.

## Mandatory Completion Handoff — T40 (2026-10-29)

<b>Outcome:</b> PARTIALLY COMPLETE

<b>Task / Work order:</b> T40 — EPIC: Expenses, Cash Flow & Financial Reports

<b>Summary:</b> Reviewed the existing T40 work order and current repository evidence. Confirmed the repo already documents expense APIs, purchasing/returns, currency-separated reports, and a date-filtered dashboard that separates invoiced sales, recorded payments, expenses, and outstanding balances. No code files were changed in this session. No merge or deployment was performed.

<b>Acceptance criteria:</b>

- Expense lifecycle distinguishes recorded/approved/due/paid/cancelled/reversed states: NOT RUN — lifecycle behavior not exhaustively inspected or tested in this session.
- Receipts, payables, expenses, payroll, and cash movements remain distinct and reconcile by currency/date: PARTIALLY VERIFIED — README documents separate invoice/payment/expense/outstanding metrics and currency-separated reports; full source-to-metric reconciliation NOT RUN.
- Metrics document source records, formulas, date basis, inclusion/exclusion rules: NOT RUN — complete mapping not yet produced.
- Totals reconcile to seeded source events per currency: NOT RUN — no tests executed.
- Refunds/returns and payroll posting are included once without double counting: NOT RUN — cross-module integration tests not executed; depends on T37/T38/T39 contracts and payroll integration.
- Missing cost data is disclosed and profit remains an estimate: PARTIALLY VERIFIED — README states profit is an estimate when cost data is incomplete; endpoint-level behavior NOT RUN.
- Security, cross-tenant, date, currency, and failure tests pass: NOT RUN in this session. Existing repository test evidence elsewhere does not establish T40 exact-head acceptance.
- Focused PR and exact-head CI ready: NOT RUN — no PR created or updated.

<b>Changes:</b> No files changed. Inspected [README.md](http://README.md) (main SHA recorded by fetch: eca89565cde0324c8171cf1e7255e217d772954d), [TASKS.md](http://TASKS.md) (fetched content SHA: 49a24dc4a80d90861362cf11e7cd9fc4310b7337), and backend/app/extended\_[api.py](http://api.py) (main SHA: 0c2f7a7d67e34996272d2baee0302b0d51f150ba). The T40 UI branch feat/expense-management-ui exists; no PR status or head SHA was verified.

<b>GitHub:</b> Repository [https://github.com/AbdullahOmaar/ai-business-assistant](https://github.com/AbdullahOmaar/ai-business-assistant). Branch found: feat/expense-management-ui (exact head SHA NOT VERIFIED). Main file evidence: [https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/app/extended\_api.py](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/app/extended_api.py). PR URL: NOT VERIFIED / none created by this session. Merge SHA: N/A.

<b>Quality:</b> Tests: NOT RUN. Build: NOT RUN. Security scan: NOT RUN. Exact-head CI: NOT RUN. No test results are claimed.

<b>Security / data integrity:</b> No source modifications or business data mutations performed. Preserve server-side authorization and tenant isolation. Do not infer cash from issued invoices; keep currencies separate; avoid double-counting supplier payments, stock cost/COGS, expenses, refunds, and payroll.

<b>Deployment:</b> NOT DEPLOYED. No deployment was requested or performed.

<b>Blockers / risks:</b> T40 explicitly depends on T37 shared contracts, T38 sales/refund/return semantics, T39 supplier payable/payment and approved costing/COGS contract, and Master sign-off on metric definitions. Notion Query Data Source was unavailable due to workspace usage allowance, so database-row querying could not be used. No implementation or exact-head tests have been performed.

<b>Next action:</b> Master Agent to confirm the shared financial metric/event contract and dependencies; Chat 3 then maps every report metric to source records and implements/tests the highest-priority verified gap on one existing feature branch.

<b>Task counts:</b> T40: completed 0 / in progress 1 / blocked dependency gates 1 / remaining acceptance criteria unknown pending source audit. Repository-wide totals not re-inventoried.

## Execution follow-up — FIN-REPORT-003 (2026-10-29)

<b>Status:</b> PARTIALLY COMPLETE

<b>Implemented:</b> Added two regression cases to [backend/tests/test\_business\_timezone\_reporting.py](https://github.com/AbdullahOmaar/ai-business-assistant/blob/task/production-safety-consolidated/backend/tests/test_business_timezone_reporting.py): <code>test_financial_dashboard_reconciles_partial_full_payments_and_mixed_currencies</code> covers partial/full allocations, approved returns, expenses, and separate EGP/USD totals; <code>test_invoice_only_reporting_does_not_infer_cash_collected</code> proves issued invoice revenue is not counted as cash and draft invoices are excluded.

<b>Changed files:</b> <code>backend/tests/test_business_timezone_reporting.py</code> (test commits [8a16494056682362d300fd9a189d4588492c4c4a](https://github.com/AbdullahOmaar/ai-business-assistant/commit/8a16494056682362d300fd9a189d4588492c4c4a) and [1c8878b4598e50334f24e389f78f79ea0de07547](https://github.com/AbdullahOmaar/ai-business-assistant/commit/1c8878b4598e50334f24e389f78f79ea0de07547)); <code>TASKS.md</code> (latest progress checkpoint [4418c9b3790052963c5fbba0029da8ad3f57e455](https://github.com/AbdullahOmaar/ai-business-assistant/commit/4418c9b3790052963c5fbba0029da8ad3f57e455)).

<b>Branch / PR:</b> <code>task/production-safety-consolidated</code>; canonical Draft PR [#161](https://github.com/AbdullahOmaar/ai-business-assistant/pull/161). Latest commit made by this follow-up: <code>4418c9b3790052963c5fbba0029da8ad3f57e455</code> ([TASKS.md](http://TASKS.md) checkpoint); latest test commit: <code>1c8878b4598e50334f24e389f78f79ea0de07547</code>. No merge or deployment.

<b>Tests / build / security:</b> The first test commit's combined status reports CircleCI Pipeline = <b>error</b> ([pipeline 978](https://app.circleci.com/pipelines/gh/AbdullahOmaar/ai-business-assistant/978)). The latest test commit has no combined status and no associated GitHub Actions run; the latest branch checkpoint commit <code>4418c9b3790052963c5fbba0029da8ad3f57e455</code> reports CircleCI Pipeline = <b>error</b> ([pipeline 985](https://app.circleci.com/pipelines/gh/AbdullahOmaar/ai-business-assistant/985)). Local pytest, PostgreSQL integration, frontend build, container build, and security scan: <b>NOT RUN</b>. The new regressions are committed but <b>not verified as passing</b>.

<b>Risks / dependencies:</b> The test intentionally asserts current semantics: approved returns are reported separately, not netted; result is before COGS and not net profit. T37 must approve the shared financial contract; T38 return/refund/tax semantics and T39 supplier payable/valuation/COGS semantics remain dependencies. Existing timezone/DST tests are present but still need executable exact-head validation.

<b>Next action:</b> Diagnose why CircleCI fails before test evidence is produced; run the focused reporting tests and full required backend/PostgreSQL/security gates on the exact current PR head, then add report authorization coverage without inventing accounting policy.
</content>
</page>

<parent-data-source-schema url="collection://6d386e1d-2db9-49e7-82c1-abe0029d033d">
The SQLite table definition for this page's parent data source. Use these column names and option values to set this page's properties, create sibling pages, or query the data source.
<sqlite-table>
CREATE TABLE IF NOT EXISTS "collection://6d386e1d-2db9-49e7-82c1-abe0029d033d" (
	url TEXT UNIQUE,
	createdTime TEXT, -- ISO-8601 datetime string, automatically set. This is the canonical time for when the page was created.
	"Execution Order" FLOAT,
	"Priority" TEXT, -- one of ["P0 - Release blocker", "P1 - MVP required", "P2 - Operational hardening", "P3 - Future enhancement"]
	"Dependencies" TEXT,
	"Workstream" TEXT, -- one of ["Security & tenancy", "CI & release", "Invoices & payments", "AI assistant", "Mobile UX", "Operations", "Product expansion", "Inventory & purchasing", "Expenses & reports", "Employees & payroll"]
	"User Action Required" TEXT, -- "__YES__" = true, "__NO__" = false, NULL defaults to false
	"Phase" TEXT, -- one of ["Phase 0 - Verify baseline", "Phase 1 - Security & release safety", "Phase 2 - Core workflows", "Phase 3 - Mobile & AI", "Phase 4 - Production readiness", "Phase 5 - Future roadmap"]
	"Acceptance Criteria" TEXT,
	"Feature Owner / Chat" TEXT, -- one of ["Master — Product & Release", "Chat 1 — Sales & Payments", "Chat 2 — Inventory & Purchasing", "Chat 3 — Expenses & Reports", "Chat 4 — Employees & Payroll"]
	"GitHub / Evidence" TEXT,
	"Task name" TEXT,
	"Assignee" TEXT, -- JSON array of zero or more user IDs
	"Status" TEXT, -- one of ["Not started", "Blocked", "In progress", "Ready for verification", "Done", "Archived"] Default: "Not started".
	"date:Due:start" TEXT, -- ISO-8601 date or datetime string. Use the expanded property (date:<column_name>:start) to set this value.
	"date:Due:end" TEXT, -- ISO-8601 date or datetime string, can be empty. Must be NULL if the date is a single date, and must be present if the date is a range. Use the expanded property (date:<column_name>:end) to set this value.
	"date:Due:is_datetime" INTEGER -- 1 if the date is a datetime, 0 if it is a date, NULL defaults to 0. Use the expanded property (date:<column_name>:is_datetime) to set this value.
)
</sqlite-table>
</parent-data-source-schema>
