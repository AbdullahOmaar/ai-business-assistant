# Notion source snapshot: 🚨 T03 — EPIC: Security, Tenant Isolation & Data Integrity

- Source: https://app.notion.com/p/401bbf2bc2c5811aaba8fe84d5b0f645?pvs=204
- Page ID: 401bbf2b-c2c5-811a-aba8-fe84d5b0f645
- Last edited reported by Notion: 2026-10-28T23:26:42.100Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/401bbf2bc2c5811aaba8fe84d5b0f645 as of 2026-10-28T23:26:42.100Z:
<page url="https://app.notion.com/p/401bbf2bc2c5811aaba8fe84d5b0f645" icon="🚨">
<page-discussions discussion-count="1" url="pageDiscussions://401bbf2b-c2c5-811a-aba8-fe84d5b0f645">

</page-discussions>

<ancestor-path>
<parent-data-source url="collection://6d386e1d-2db9-49e7-82c1-abe0029d033d" name="AI Business Assistant — Master Task Plan"/>
<ancestor-2-database url="https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f" title="AI Business Assistant — Master Task Plan"/>
<ancestor-3-page url="https://app.notion.com/p/407bbf2bc2c581aeae3cdd3282cd3366" title="06 — Delivery / QA / Release"/>
<ancestor-4-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-5-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"Acceptance Criteria":"A route-by-route inventory identifies authentication, membership authorization, business scoping, read/write operations, and tests for every protected endpoint.","Dependencies":"T01.","Execution Order":3,"GitHub / Evidence":"https://github.com/AbdullahOmaar/ai-business-assistant/commit/034faffce9c2851d394b2080db3d17ffd7e3c74e\nhttps://github.com/AbdullahOmaar/ai-business-assistant/pull/302\nhttps://circleci.com/workflow-run/fd45a35d-bfa8-4f34-bb3d-a05ced901e1f\nhttps://github.com/AbdullahOmaar/ai-business-assistant/blob/main/AGENTS.md\nhttps://github.com/AbdullahOmaar/ai-business-assistant/blob/main/TASKS.md\nhttps://github.com/AbdullahOmaar/ai-business-assistant/blob/main/docs/SECURITY_ROUTE_INVENTORY.md\nhttps://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/app/extended_api.py\nhttps://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/tests/test_business_tenant_boundaries.py","Phase":"Phase 1 - Security & release safety","Priority":"P0 - Release blocker","Status":"In progress","Task name":"T03 — EPIC: Security, Tenant Isolation & Data Integrity","User Action Required":"__NO__","Workstream":"Security & tenancy","date:Due:is_datetime":0,"url":"https://app.notion.com/p/401bbf2bc2c5811aaba8fe84d5b0f645"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"🚨"}</iconMetadata>
<content>
## Work started — 22 October 2026

- Added route inventory covering the core workspace/dashboard API, core write workflows, extended business-scoped workflows, and AI chat.
- Documented Firebase Bearer-token verification, membership authorization, route groups, and remaining negative-test gaps.
- Evidence: [https://github.com/AbdullahOmaar/ai-business-assistant/blob/feat/assistant-resilience-usage-limits/docs/security/business-api-route-inventory.md](https://github.com/AbdullahOmaar/ai-business-assistant/blob/feat/assistant-resilience-usage-limits/docs/security/business-api-route-inventory.md)
- This is a source inventory, not proof that every handler has passed cross-tenant integration tests.

## Goal

Find authorization gaps systematically rather than patching routes one at a time.

## Steps

- Review FastAPI routers and dependencies.
- List all endpoints involving businesses, customers, products, invoices, payments, allocations, dashboard, and assistant context.
- For each route, document who can call it, how business membership is checked, and how queries are scoped.

## Acceptance criteria

The inventory covers every relevant route and identifies gaps with file/route references. No production-changing work is done as part of the inventory itself.

## Mandatory QA Completion Handoff — 29 October 2026

<b>Outcome:</b> PARTIALLY COMPLETE

<b>Task / Work order:</b> T03 — Inventory every authenticated/business-scoped API route

<b>Summary:</b> Re-inspected the current repository evidence and CI results. No code files were changed in this handoff. The existing route inventory and targeted security regressions provide useful coverage, but the full route × role × tenant matrix is not complete; do not mark this task Done.

<b>Acceptance criteria:</b>

- Route-by-route inventory identifies authentication, membership authorization, business scoping, read/write operations: PARTIALLY VERIFIED from the existing inventory at [business-api-route-inventory.md](https://github.com/AbdullahOmaar/ai-business-assistant/blob/feat/assistant-resilience-usage-limits/docs/security/business-api-route-inventory.md); exhaustive coverage of every current protected endpoint was not independently re-counted in this session.
- Cross-tenant and denied-operation no-side-effect tests: PARTIALLY COMPLETE; current [TASKS.md](http://TASKS.md) records targeted CSV and invoice denial regressions, while the full route × role × tenant matrix remains incomplete.
- Exact SHA CI evidence: PASS for the inspected SHA <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>; 7/7 CircleCI contexts reported success, including frontend unit tests, dependency audit, production build, browser smoke, backend container, backend accounting, and aggregate. [CircleCI aggregate](https://circleci.com/workflow-run/fb28f642-ed8b-4735-99e2-2d144638b009).
- Local test/build rerun: NOT RUN in this session.
- Authenticated production smoke, physical Android/accessibility QA: NOT RUN. PostgreSQL restore drill: BLOCKED pending an approved isolated non-production target.

<b>Changes:</b> No files changed. No PR created. No merge or deployment performed.

<b>GitHub:</b> <code>main</code>, inspected SHA <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>; [commit](https://github.com/AbdullahOmaar/ai-business-assistant/commit/c464398e0a6ace77eba32aabfbdbd09091f53999). Related existing tracking: [Issue #276](https://github.com/AbdullahOmaar/ai-business-assistant/issues/276). No new PR.

<b>Quality:</b> CircleCI 7/7 PASS on the inspected SHA. Local pytest/build NOT RUN. Authenticated production E2E NOT RUN. Full current PR/branch pagination NOT VERIFIED; repository records and current PR query disagree about whether PR #301 remains open, so reconcile before any PR-state decision.

<b>Security / data integrity:</b> Existing targeted denial tests check no business-state/audit side effects for covered cases. Remaining risk is uncovered protected routes, role combinations, foreign-business IDs, and incomplete concurrency/idempotency/reconciliation scenarios.

<b>Blockers:</b> No approved isolated PostgreSQL restore target. Production smoke and physical mobile/accessibility test environment not available in this handoff. Notion Query Data Source allowance was exhausted during further backlog discovery; the query was not executed and was not retried.

<b>Next:</b> QA Agent — continue issue #276's route × role × tenant no-write/no-audit coverage on one dedicated branch; run exact-head CircleCI and update this same task with the resulting evidence. Master Agent — reconcile the current PR #301 state against GitHub before release planning.

## QA implementation checkpoint — foreign resource IDs — 29 October 2026

<b>Status: PARTIALLY COMPLETE</b> — implementation committed and PR opened; exact-head tests are not yet verified.

<b>Task:</b> T03 — Inventory every authenticated/business-scoped API route. This is an incremental security regression under the existing task; no new Notion task was created.

<b>Changes actually made</b>

- <code>backend/tests/test_business_tenant_boundaries.py</code>: added <code>test_owner_cannot_read_or_mutate_foreign_resource_ids_without_side_effects</code>. An OWNER for tenant A attempts GET/PATCH/DELETE using tenant B customer/product IDs and GET using a tenant B invoice ID through tenant A's routes. Expected result is HTTP 404 for each attempt. The test verifies unchanged audit-event totals for both tenants, and verifies tenant B's owner can still read the unchanged customer/product and draft invoice.
- <code>docs/SECURITY_ROUTE_INVENTORY.md</code>: recorded the specific test scope and remaining gaps.
- Review correction: tenant A and tenant B audit baselines are captured under the corresponding owner's identity; explicit success responses are asserted for tenant B's follow-up reads.

<b>GitHub delivery</b>

- Branch: <code>qa/foreign-resource-read-no-side-effects-20261029</code>
- Latest candidate commit: [<code>bfda274696dc20305d5a770bb4c994770ffad6e8</code>](https://github.com/AbdullahOmaar/ai-business-assistant/commit/bfda274696dc20305d5a770bb4c994770ffad6e8)
- Draft PR: [#302 — foreign resource reads/mutations no-side-effects](https://github.com/AbdullahOmaar/ai-business-assistant/pull/302)
- Diff review: exactly 2 files changed (test + security inventory); no application authorization policy, production data, or deployment configuration changed.
- Base main SHA: <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>.

<b>Quality evidence</b>

- Exact-head CircleCI status for <code>bfda274696dc20305d5a770bb4c994770ffad6e8</code>: <b>7/7 PASS</b> — frontend-unit-tests, frontend-dependency-audit, frontend-production-build, frontend-browser-smoke, backend-container, backend-accounting, and aggregate <code>verify-all-changes/all-checks-passed</code>. [Exact-head aggregate](https://circleci.com/workflow-run/e1dce9f3-74d3-47d3-949e-ca71ab9cb935). Local pytest/build remain NOT RUN. The draft PR is not merged; no deployment.
- Local pytest: NOT RUN (repository checkout/test runtime unavailable in this connector-only session).
- Local build: NOT RUN.
- Security regression execution: NOT RUN locally; test assertions are implemented but not yet verified by CI.
- Production authenticated smoke: NOT RUN. PostgreSQL restore drill remains BLOCKED pending an approved isolated non-production target.

<b>Blockers / risks</b>

- Need exact-head CircleCI checks on <code>bfda274696dc20305d5a770bb4c994770ffad6e8</code>, including backend-accounting and aggregate; current PR is draft and must not be merged until verified.
- This closes only the direct foreign-ID GET/PATCH/DELETE gap for customers/products and GET for invoices. The complete route × role × tenant matrix, other sensitive workflow edges, and authenticated production smoke remain incomplete.
- Main branch protection was reported disabled (<code>main.protected=false</code>); therefore do not assume GitHub enforces required checks.

<b>Next action</b>

- QA Agent: poll/re-run CI for PR #302's exact latest head, fix any failing tests, review the final diff, and append evidence to this same Task.
- Master Agent: review the scope and coordinate this incremental matrix with the existing security backlog; no merge/deploy was performed or requested.

## Additional security stage — foreign invoice lifecycle — 29 October 2026

<b>Status: PARTIALLY COMPLETE</b> — extended the same PR with high-impact invoice lifecycle coverage; current-head CI is pending.

- Extended <code>test_owner_cannot_read_or_mutate_foreign_resource_ids_without_side_effects</code> to create and issue a tenant-B invoice, then attempt foreign invoice PATCH and VOID through tenant-A routes. The test expects scoped workflow rejection (HTTP 422), and checks tenant-B audit totals, invoice status, and invoice number remain unchanged.
- Existing foreign customer/product GET/PATCH/DELETE and invoice GET checks remain in the same regression.
- Changed files remain exactly two: <code>backend/tests/test_business_tenant_boundaries.py</code> and <code>docs/SECURITY_ROUTE_INVENTORY.md</code>.
- Current branch: <code>qa/foreign-resource-read-no-side-effects-20261029</code>; current candidate head: [<code>034faffce9c2851d394b2080db3d17ffd7e3c74e</code>](https://github.com/AbdullahOmaar/ai-business-assistant/commit/034faffce9c2851d394b2080db3d17ffd7e3c74e); same draft [PR #302](https://github.com/AbdullahOmaar/ai-business-assistant/pull/302).
- Prior head <code>bfda274696dc20305d5a770bb4c994770ffad6e8</code> passed CircleCI 7/7, but that does not validate these new invoice lifecycle assertions. Exact-head CircleCI on <code>034faffce9c2851d394b2080db3d17ffd7e3c74e</code>: <b>4/6 substantive jobs SUCCESS</b> (frontend-unit-tests, frontend-dependency-audit, frontend-production-build, backend-container); <b>2/6 PENDING</b> (backend-accounting, frontend-browser-smoke). Aggregate has not reported. No green gate claimed yet.
- Local pytest/build: NOT RUN. Production authenticated smoke: NOT RUN. No merge/deploy.
- Next: wait for exact-head backend-accounting, browser smoke, all remaining jobs, and aggregate; fix any failures and update this same Task.

## @n synchronization checkpoint — 29 October 2026

<b>\[AGENT → MASTER\] Protocol acknowledged.</b> Read the Agent Prompt Registry, Product & Agent Operating Model, Delivery/QA/Release page, Master Task Plan schema, T03 task and all five comments in its current discussion. GitHub <code>AGENTS.md</code>, <code>README.md</code>, <code>TASKS.md</code>, current main, PR #302 and exact-head CI were checked.

- <b>Main:</b> <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>.
- <b>Current QA branch:</b> <code>qa/foreign-resource-read-no-side-effects-20261029</code>.
- <b>PR #302:</b> OPEN / DRAFT / unmerged at <code>034faffce9c2851d394b2080db3d17ffd7e3c74e</code>.
- <b>Exact-head CircleCI:</b> 7/7 PASS; [aggregate workflow](https://circleci.com/workflow-run/fd45a35d-bfa8-4f34-bb3d-a05ced901e1f). This covers CI only, not production.
- <b>Local pytest/build:</b> NOT RUN. <b>Authenticated production smoke:</b> NOT RUN. <b>PostgreSQL restore drill:</b> BLOCKED pending an approved isolated non-production target.
- <b>Remaining:</b> full route × role × tenant matrix and authenticated production smoke remain incomplete.
- <b>Coordination:</b> Master assigned the next coverage increment on a separate branch, but repository <code>AGENTS.md</code> requires one active work branch per contributor and says not to start another branch while a matching PR remains open. PR #302 is still draft and merge is not authorized. This conflict was reported in the same T03 discussion; no second branch or edits to PR #302 were made during @n sync.
- <b>Next:</b> complete read-only route/test gap analysis and ask Master to reconcile branch sequencing before code changes. No merge/deploy.

## @n route-gap audit — current main comparison — 29 October 2026

<b>Status: PARTIALLY COMPLETE.</b> Read-only comparison of route decorators in <code>backend/app/extended_api.py</code> against <code>docs/SECURITY_ROUTE_INVENTORY.md</code> on main <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code> found at least eight protected route suffixes not represented in the inventory table:

- <code>GET /operations/health</code> — owner-only operational data.
- <code>GET /reports/tax-summary</code>.
- <code>POST /purchase-orders/{order_id}/approve</code>.
- <code>POST /imports/{entity_type}.csv/preview</code>.
- <code>GET /reports/receivables-aging</code>.
- <code>GET /customers/{customer_id}/statement</code>.
- <code>GET /audit-events</code>.
- <code>GET /reports/data-integrity</code>.

These are source-inventory gaps, not proof that each endpoint is vulnerable. The next QA increment should map each route to existing auth/role/tenant tests and add no-read/no-write/no-audit assertions where missing. The inventory's reviewed date is 2026-10-23 and needs reconciliation with the current decorators. Route/test counts should be recomputed before calling the inventory exhaustive.

<b>Existing PR #302 verification refresh:</b> current head <code>034faffce9c2851d394b2080db3d17ffd7e3c74e</code> is still OPEN / DRAFT / unmerged and its exact-head CircleCI is now <b>7/7 PASS</b>, including aggregate [workflow](https://circleci.com/workflow-run/fd45a35d-bfa8-4f34-bb3d-a05ced901e1f). This validates the checks run at that SHA, not the full route matrix or production behavior. Local pytest/build and authenticated production smoke remain NOT RUN; PostgreSQL restore drill remains BLOCKED.

<b>Master coordination:</b> the current assignment says to use a separate branch for the remaining matrix, but repository <code>AGENTS.md</code> says one active branch per contributor and says not to start a new branch while the matching PR remains open. PR #302 is still draft; no merge is authorized. This branch sequencing conflict is explicitly raised for Master to reconcile. No branch was created and PR #302 was not modified during @n synchronization.

## Consolidated work package — Security, tenancy & data integrity

This parent absorbs the execution checklist from legacy T04–T06 and T08–T11 where their concerns are security/data-integrity prerequisites: cross-tenant negative tests, token/auth failure handling, database tenant constraints/migrations, payment idempotency/transactions, invoice state transitions, monetary math/stock side effects, and customer/product API boundaries. Preserve all existing PR/commit evidence; do not duplicate implementation. Acceptance: route × role × tenant matrix; denied operations have no side effects; migration and rollback checks; idempotency/concurrency; exact-head tests and CI.
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
