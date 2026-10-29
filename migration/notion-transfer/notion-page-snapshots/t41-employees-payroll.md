# Notion source snapshot: T41 — EPIC: Employees & Payroll lifecycle

- Source: https://app.notion.com/p/407bbf2bc2c58132b7e5e934d0998642?pvs=204
- Page ID: 407bbf2b-c2c5-8132-b7e5-e934d0998642
- Last edited reported by Notion: 2026-10-28T23:02:04.587Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/407bbf2bc2c58132b7e5e934d0998642 as of 2026-10-28T23:02:04.587Z:
<page url="https://app.notion.com/p/407bbf2bc2c58132b7e5e934d0998642">
<page-discussions discussion-count="1" url="pageDiscussions://407bbf2b-c2c5-8132-b7e5-e934d0998642">

</page-discussions>

<ancestor-path>
<parent-data-source url="collection://6d386e1d-2db9-49e7-82c1-abe0029d033d" name="AI Business Assistant — Master Task Plan"/>
<ancestor-2-database url="https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f" title="AI Business Assistant — Master Task Plan"/>
<ancestor-3-page url="https://app.notion.com/p/407bbf2bc2c581aeae3cdd3282cd3366" title="06 — Delivery / QA / Release"/>
<ancestor-4-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-5-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"Acceptance Criteria":"Employee/salary effective-dated records; documented gross-to-net policy; draft/calculated/approved/paid/failed/reversed payroll states; payslips; role/tenant-protected sensitive data; idempotent payout and single expense posting; synthetic-data financial reconciliation; exact-head CI and evidence. No unsupported legal/tax compliance claims.","Dependencies":"T37 shared money/audit/idempotency contract; T40 expense-posting and reporting contract approved; shared permission rules approved by Master.","Execution Order":41,"Feature Owner / Chat":"Chat 4 — Employees & Payroll","GitHub / Evidence":"https://github.com/AbdullahOmaar/ai-business-assistant/blob/feat/t41-salary-history-effective-dates/docs/T41_EMPLOYEE_PAYROLL_GAP_AUDIT_2026-10-29.md","Phase":"Phase 2 - Core workflows","Priority":"P0 - Release blocker","Status":"In progress","Task name":"T41 — EPIC: Employees & Payroll lifecycle","User Action Required":"__NO__","Workstream":"Employees & payroll","date:Due:is_datetime":0,"url":"https://app.notion.com/p/407bbf2bc2c58132b7e5e934d0998642"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
## Epic objective

Deliver secure employee and payroll operations end to end, including one-time financial posting.

### Scope

- Employee lifecycle and effective-dated salary/contract components.
- Base salary, allowances, bonuses, advances, deductions and adjustments under explicit policies.
- Attendance/proration only when inputs and policy are defined.
- Payroll run calculation, review/approval, payment status, payslip, correction/reversal and audit history.
- Idempotent payroll expense posting and reconciliation into Chat 3's financial reporting model.

### Exit gate

Gross-to-net is reproducible from documented rules and synthetic test data. Approved is distinct from paid; retries cannot double-pay or double-post; salary/payslip visibility is protected server-side; audit trail is complete; payroll and report balances reconcile; exact-head checks pass. Legal/tax compliance is not claimed without verified scope and review.

### Work order

<mention url="https://app.notion.com/p/407bbf2bc2c5819a99bfc3eb61a2570b" />

### Execution note

Audit/spec may begin in parallel. Implementation waits for Master-approved expense posting and permissions. Do not merge or deploy.

## Mandatory Completion Handoff — 2026-10-29

<b>Outcome: PARTIALLY COMPLETE</b>

<b>Task ID / name:</b> T41 — EPIC: Employees & Payroll lifecycle<br /><b>Overall task counts:</b> Full T41 subtask totals are unknown; no verified completion count is claimed.<br /><b>Baseline inspected:</b> main SHA <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>.<br /><b>Current feature branch:</b> <code>feat/t41-salary-history-effective-dates</code><br /><b>Head commit (audit documentation):</b> <code>3d43fab9e0a1b45d1d7d331387156056966a0978</code><br /><b>PR:</b> None opened.<br /><b>Merge / deployment:</b> NOT RUN; no merge or deployment authorized or performed.

### What was done

- Inspected the existing employee/payroll API, model, migration and payroll API tests.
- Confirmed current employee CRUD, duplicate employee code/email protection, audit events, Decimal-based payroll calculations, draft/approved/paid states, owner-gated payroll routes, and expense creation when payroll is marked paid.
- Created branch <code>feat/t41-salary-history-effective-dates</code>.
- Added the gap audit and implementation plan: [T41 gap audit](https://github.com/AbdullahOmaar/ai-business-assistant/blob/feat/t41-salary-history-effective-dates/docs/T41_EMPLOYEE_PAYROLL_GAP_AUDIT_2026-10-29.md).
- Updated this existing T41 row's Status to In progress and GitHub / Evidence to the audit artifact. No duplicate task or report page was created.

### Acceptance criteria and evidence

| Acceptance criterion | Result | Evidence |
| --- | --- | --- |
| Business-scoped employee records and duplicate protection | PARTIALLY VERIFIED by source/test inspection | [Payroll API tests](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/tests/test_employee_payroll_api.py) |
| Effective-dated salary/contract history | NOT COMPLETE | [Current migration 0005](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/migrations/versions/0005_employee_payroll.py) stores mutable <code>employees.monthly_salary</code>; no salary history table was found in inspected migration. |
| Reproducible gross-to-net using approved, versioned rules | PARTIALLY COMPLETE; effective-dated salary snapshot not implemented | [Payroll API](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/app/employee_payroll_api.py) |
| Draft/approved/paid distinct | IMPLEMENTED by inspected schema/API; runtime tests not executed in this handoff | [Migration 0005](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/migrations/versions/0005_employee_payroll.py) |
| Failed/partial/reversed/corrected lifecycle | NOT COMPLETE / NOT VERIFIED | Current migration status check only allows draft, approved, paid. |
| Payroll-to-expense exactly once, retry/reversal/concurrency safety | PARTIALLY IMPLEMENTED; full failure/retry/concurrency proof NOT RUN | [Migration 0005](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/migrations/versions/0005_employee_payroll.py) and [API tests](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/tests/test_employee_payroll_api.py) |
| Payslip snapshot/history | NOT VERIFIED; no separate versioned snapshot confirmed | Gap audit above |
| Role/tenant isolation and no-side-effect denial | Tests are present in source; execution NOT RUN in this environment | [Payroll API tests](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/tests/test_employee_payroll_api.py) |
| Synthetic-data payroll-to-report reconciliation | NOT RUN | No test execution evidence available |
| Exact-head CI and build | NOT RUN / no checks returned | [Branch](https://github.com/AbdullahOmaar/ai-business-assistant/tree/feat/t41-salary-history-effective-dates); commit status query returned an empty status list. |

### Changed files

- <code>docs/T41_EMPLOYEE_PAYROLL_GAP_AUDIT_2026-10-29.md</code> — added audit, verified existing behavior, identified gaps, and recorded safe implementation sequence.
- No application runtime code, schema, migration, or test files changed.

### Quality / security

- Backend tests: NOT RUN.
- Frontend tests/build: NOT RUN.
- Migration upgrade/downgrade checks: NOT RUN.
- Security scan: NOT RUN.
- CircleCI exact-head checks: NOT RUN / no status checks returned.
- No production data, authorization policy, or deployment configuration changed.

### Risks / blockers

- Salary history needs effective-date and overlap semantics plus a safe backfill that preserves historical payroll values.
- T41 must not change shared expense posting before Master approves T40's posting/reporting contract and permission model.
- Failure/retry/reversal semantics require explicit payment-state and idempotency design before widening schema constraints.
- Do not assume attendance, proration, Egyptian tax or labor-law policy without approved inputs and review.

### Next action and owner

<b>Next:</b> Chat 4 — Employees & Payroll to verify the complete migration chain and T40/Master-approved expense contract, then implement effective-dated salary history and payroll calculation snapshots with focused tests on this branch. Master owns approval of shared expense/permission semantics. Do not merge or deploy until explicitly authorized and all release gates pass.

### Follow-up after handoff — dependency gate re-check (2026-10-29)

- <b>Updated branch head:</b> <code>024b89efcee9b47ddf734e9d650bae6f81429c2f</code> (documentation-only dependency-gate update).
- <b>T37 status:</b> Not started in the fetched Master Task Plan row: [T37 shared contracts](https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd).
- <b>T40 status:</b> In progress in the fetched Master Task Plan row; its execution note says implementation waits for Master-approved sales/procurement contracts and payroll must use an agreed integration point: [T40 Expenses & Reports](https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30).
- <b>Decision:</b> Shared financial-model, payroll posting, and schema changes remain gated. No code changes made. Chat 4 can continue discovery/spec/test design; Master — Product & Release must approve T37 and the T40 expense-posting contract before implementation changes to shared semantics.
- <b>Notion query limitation:</b> Query Data Source SQL/rows allowance was exhausted; direct fetch of the known T37/T40 pages succeeded. The tool's recovery guidance is to try again later or use its offered Business trial.
- <b>Next owner/action:</b> Master — Product & Release: approve the shared financial/permission contract; then Chat 4 implements effective-dated salary history and calculation snapshots with tests.

## Execution checkpoint — 2026-10-29 (T41)

<b>Status: PARTIALLY COMPLETE</b> — completed a safe test-design checkpoint and reviewed the latest commit diff; implementation remains gated on Master-approved T37/T40 financial contracts.

- <b>Changed file:</b> <code>docs/T41_EMPLOYEE_PAYROLL_GAP_AUDIT_2026-10-29.md</code> only. Added salary effective-date boundary/overlap tests, safe legacy-backfill requirements, immutable calculation snapshot checks, payment retry/reversal/idempotency cases, role/tenant no-side-effect checks, reconciliation cases, and the decisions required from Master. No runtime/API/model/migration/test source changed.
- <b>Branch:</b> <code>feat/t41-salary-history-effective-dates</code> — [branch](https://github.com/AbdullahOmaar/ai-business-assistant/tree/feat/t41-salary-history-effective-dates)
- <b>Head:</b> <code>558dc119f5fd7e8f88126818fe9d171c5926a073</code> — [commit/diff](https://github.com/AbdullahOmaar/ai-business-assistant/commit/558dc119f5fd7e8f88126818fe9d171c5926a073)
- <b>Diff review:</b> <code>main...branch</code> reports 3 commits ahead, 0 behind, one added audit document (76 lines total). No PR exists for this branch; no merge/deploy performed.
- <b>CI:</b> exact-head CircleCI currently pending: frontend-unit-tests [5138](https://circleci.com/gh/AbdullahOmaar/ai-business-assistant/5138), frontend-dependency-audit [5139](https://circleci.com/gh/AbdullahOmaar/ai-business-assistant/5139), frontend-production-build [5137](https://circleci.com/gh/AbdullahOmaar/ai-business-assistant/5137), frontend-browser-smoke [5140](https://circleci.com/gh/AbdullahOmaar/ai-business-assistant/5140), backend-accounting [5141](https://circleci.com/gh/AbdullahOmaar/ai-business-assistant/5141). Aggregate check has not yet appeared. Earlier SHA <code>024b89efcee9b47ddf734e9d650bae6f81429c2f</code> had 7/7 CircleCI statuses successful, but that is not evidence for the current head.
- <b>Tests/build/security:</b> local pytest, migration upgrade/downgrade, frontend tests/build and local security scan NOT RUN in this connector-only session. Current exact-head CI is pending, not passed.
- <b>Dependencies:</b> T37 is now <code>In progress</code> (not <code>Not started</code> as the previous note incorrectly recorded); required contract outputs are still unchecked. T40 remains <code>In progress</code> and says payroll posting needs an agreed integration point. See [T37 Master contract](https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd) and [T40 expense/reporting](https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30).
- <b>Next:</b> Master to approve salary-date/backfill semantics, shared money/idempotency/audit/permissions contract and T40 payroll-expense lifecycle. Once approved, T41 implements salary history and reproducible calculation snapshots with migrations and focused tests on this same branch. No merge/deploy without explicit user authorization.
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
