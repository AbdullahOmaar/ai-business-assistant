# Notion source snapshot: 🧭 AI Business Assistant — Product & Agent Operating Model

- Source: https://app.notion.com/p/407bbf2bc2c581eda73cc3b91a43fc52?pvs=204
- Page ID: 407bbf2b-c2c5-81ed-a73c-c3b91a43fc52
- Last edited reported by Notion: 2026-10-29T00:48:28.246Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/407bbf2bc2c581eda73cc3b91a43fc52 as of 2026-10-29T00:48:28.246Z:
<page url="https://app.notion.com/p/407bbf2bc2c581eda73cc3b91a43fc52" icon="🧭">
<page-discussions discussion-count="1" url="pageDiscussions://407bbf2b-c2c5-81ed-a73c-c3b91a43fc52">
<example-discussions>
<discussion id="discussion://407bbf2b-c2c5-81ed-a73c-c3b91a43fc52/407bbf2b-c2c5-81ed-a73c-c3b91a43fc52/407bbf2b-c2c5-81e8-a9bb-001c82c110ee" comment-count="1" resolved="false" type="comment" context="page">
<comment id="407bbf2b-c2c5-8107-bdc9-001dd0f9230a" url="https://app.notion.com/p/407bbf2bc2c581eda73cc3b91a43fc52?d=407bbf2bc2c581e8a9bb001c82c110ee&amp;pvs=42" user-url="user://3bdd872b-594c-819a-855f-0002bc3a4a6b" datetime="2026-10-28T22:51:39.897Z">T40 handoff update: [T40 — EPIC: Expenses, Cash Flow & Financial Reports](https://app.notion.com/p/407bbf2bc2c581cfbb0fd5ddc67b4a30) is <b>PARTIALLY COMPLETE</b>. Existing APIs/report separation documented; no code changed; tests/build/security/exact-head CI NOT RUN. T40 depends on T37/T38/T39 shared contracts. Main evidence: https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/backend/app/extended\_api.py. No merge/deploy. Next: Master confirms metric/event contracts; Chat 3 completes source-to-metric mapping and tests.</comment>
</discussion>
</example-discussions>

</page-discussions>

<ancestor-path>
<parent-page url="https://app.notion.com/p/407bbf2bc2c581aeae3cdd3282cd3366" title="06 — Delivery / QA / Release"/>
<ancestor-2-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-3-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"title":"AI Business Assistant — Product & Agent Operating Model"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"🧭"}</iconMetadata>
<content>
## Mandatory Master Readiness & No-Stall Protocol

The Master must keep every worker unblocked and ready to continue. These rules are mandatory:

1. <b>Maintain a ready queue:</b> Always keep the next actionable task, acceptance criteria, dependencies, relevant files/paths, test commands, and evidence requirements prepared for every active worker. Never leave a worker waiting for a vague instruction.
2. <b>Preflight before handoff:</b> Before assigning work, inspect the current task page, comments, GitHub branch/PR, latest commit, CI, and dependent contracts. Provide the worker with the exact current state and one concrete next action.
3. <b>Blocker protocol:</b> A worker must report the exact error, attempted steps, evidence, impact, and the smallest required decision. Master must promptly decide, provide a safe workaround, or explicitly mark BLOCKED with an owner and next check. Continue independent work; do not let one blocked stream stop others.
4. <b>No silent waiting:</b> If a worker is waiting on Master, request a concise <code>@r</code> status and keep preparing independent next steps. Workers should not repeatedly ask what to do next when the backlog and dependencies already define the next action.
5. <b>Status cadence:</b> At each meaningful checkpoint, report <code>VERIFIED COMPLETE</code>, <code>PARTIALLY COMPLETE</code>, <code>NOT RUN</code>, or <code>BLOCKED</code>, with changed files, exact commit/PR, tests and CI results, checks not run, and next action. Never describe pending checks as passing.
6. <b>Shared-contract readiness:</b> Resolve cross-feature API/schema/financial contracts before parallel implementation depends on them. If a contract is unresolved, define the decision needed, propose a safe default with impact, and escalate only decisions that require Product Owner approval.
7. <b>Branch/PR discipline:</b> One active feature branch and one PR per specialist work package; reuse existing branches/PRs, avoid duplicate work, inspect diffs and exact-head CI, and never merge or deploy without the required explicit authorization and gates.
8. <b>Continuity packet:</b> Keep a concise handoff in the canonical task page with current branch/head SHA, completed work, remaining acceptance criteria, blockers, test status, and the exact next command/action so another session can resume without rediscovery.
9. <b>Master readiness check:</b> At the start of each work session, review Agent Registry, Operating Model, Master Task Plan, active worker pages/comments, GitHub <code>TASKS.md</code>, open PRs/branches, and CI. Reconcile conflicting statuses before assigning or redirecting work.
10. <b>No fabricated coordination:</b> Do not claim that a worker was messaged, acknowledged, assigned, or unblocked unless there is evidence in the relevant channel/page. Record actual handoffs in Notion and link supporting GitHub evidence.

<b>Immediate operating rule:</b> When the owner asks whether to ping workers, do not wait passively. Request status from active workers, but never treat a Notion comment as a wake-up signal or proof that a chat is running. If direct chat messaging is unavailable, record the handoff on the canonical worker task page and state that limitation honestly.

## Mandatory command semantics — <code>@r</code> means Resume & Execute

- <code>@r</code> is an execution command, not a report-only command. The first response must briefly state the highest-priority unfinished task and then continue implementation immediately, without asking the owner to repeat the instruction.
- Start by reading the canonical task page/comments and verifying the live GitHub branch, HEAD SHA, PR, diff, and exact-head CI. Reuse the existing feature branch/PR; do not create duplicates.
- Select one concrete acceptance criterion that can be advanced safely now. Inspect the implementation, edit code/tests/docs as needed, run the relevant checks, inspect the diff, and commit/push only when the connected GitHub capability and repository rules allow it. Never claim a code change or test unless tool evidence confirms it.
- If a dependency blocks feature coding, continue independent work (route inventory, test matrix, validation, docs, reproduction, or safe tests) instead of returning only a blocker report. Do not alter shared financial contracts before Master approval.
- A status-only response is insufficient unless no safe execution is possible. In that case, state <code>BLOCKED</code> or <code>NOT RUN</code>, show the exact error/evidence, what was attempted, the smallest decision needed, and the next action. Do not invent a workaround or wait silently.
- Every <code>@r</code> checkpoint must include: status; files/diff or explicit <code>no code changed</code>; branch + exact HEAD SHA + PR; commands/checks with observed results; checks not run; blocker and owner if any; next concrete execution step. A previous green CI result does not prove the current HEAD is green.
- <code>@r</code> must not merge or deploy. Those actions still require explicit authorization and release gates.

## Separate status-only command — <code>@status</code>

- <code>@status</code> requests a concise evidence-based status report only. It must not be confused with <code>@r</code>.
- <code>@r</code> = resume and execute; <code>@status</code> = report current state. Neither command wakes another dormant chat or starts background work by itself. Actual worker execution requires the relevant chat/agent to be active or a configured orchestration mechanism.

---

## Mandatory task sizing, ownership, and consolidation rules

- Create <b>large, outcome-based work packages</b>, not a pile of tiny tasks. One task should cover a coherent end-to-end capability with acceptance criteria, dependencies, security, tests, docs, and evidence. Split only when ownership/dependencies/release gates genuinely require it; use checklist items inside the parent task for small steps.
- Before creating anything, inventory and reconcile existing Notion tasks, GitHub <code>TASKS.md</code>, issues, branches, and PRs. Enlarge/update existing work packages and close/archive only proven duplicates or obsolete records under authorized rules; never create a second tracker or delete useful history.
- <b>One active feature branch and one PR per specialist/feature work package.</b> Reuse the existing matching branch/PR; no branch-per-subtask or parallel branches for the same owner. Keep adding related commits to that branch until the complete package is implemented and tested.
- When the package is complete, the owner updates its single PR with full evidence and requests Master review. Master reviews the exact head and release gates; merge only with explicit authorization and passing required checks. After authorized merge, verify main SHA/CI and then move to the next package. Deployment remains separately authorized.
- Master owns the consolidated backlog: few clear parent work packages, dependencies, priority, and one next action. Specialists report substeps/checklists in their existing task/PR, not as new standalone tasks unless a real independent owner/release gate requires it.

<callout icon="🧭" color="blue_bg">
<b>Canonical location:</b> <mention url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955">AI Business Assistant — Product Home</mention> → <mention url="https://app.notion.com/p/407bbf2bc2c581aeae3cdd3282cd3366">06 — Delivery / QA / Release</mention>. This page governs role boundaries, feature ownership, cross-feature contracts and handoffs; it does not replace the BRD/PRD or GitHub’s live engineering state.
</callout>

## Purpose

This is the operating contract for the Master Product/Engineering chat and the four feature-owner chats. It prevents duplicate work, conflicting financial rules, uncontrolled branches, premature merges, and unsupported production claims.

<b>Management decision:</b> Keep the existing AI Business Assistant Control Center and Master Task Plan. Do not create a second dashboard or a second detailed technical backlog.

## Source of truth

| Information | Canonical place | Rule |
| --- | --- | --- |
| Product scope, feature owners, major milestones, decisions | This Notion space | Master maintains the overview; each feature page defines its boundary and acceptance criteria. |
| Live engineering queue, implementation checkpoint, current main SHA, verified CI/release evidence | [GitHub ](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/TASKS.md)[<code>TASKS.md</code>](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/TASKS.md) | Repository instructions call this the canonical live engineering queue. Update it with actual evidence, not assumptions. |
| Code, tests, migrations, review, branch and PR state | [GitHub repository](https://github.com/AbdullahOmaar/ai-business-assistant) | A claim is not verified until the relevant GitHub evidence exists. |
| Production version and runtime behavior | [Frontend](https://ai-business-assistant-web.vercel.app) · [API readiness](https://ai-business-assistant-api.vercel.app/readyz) · Vercel deployments | Main/CI green does not prove production is updated or that authenticated workflows work. |
| Decisions that affect multiple features | Decision log in the Control Center and a linked GitHub ADR when technical | Master records the decision, reason, owner, and impact. |

<b>No duplicate task trackers:</b> Notion holds feature-level work packages, ownership, dependencies, and product acceptance. GitHub <code>TASKS.md</code>, issues, PRs, commits, and CI hold implementation detail and evidence. When status differs, live GitHub is authoritative for code/CI/merge state; Master reconciles the Notion summary.

## Ownership and decision rights

| Role | Owns | Must not do |
| --- | --- | --- |
| Product Owner (you) | Product priorities, intended business behavior, major scope and production authorization | Need not review every code edit. |
| Master Product/Engineering chat | Product architecture, cross-feature contracts, prioritization, dependency management, review, integration, merge decision, release gates, documentation consistency | Must not mark work complete without evidence or claim a deployment without checking it. |
| Chat 1 — Sales & Payments | Sales-to-cash feature end to end | Must not independently redefine inventory valuation, global cash/report rules, or shared financial contracts. |
| Chat 2 — Inventory & Purchasing | Stock-to-supplier-payment feature end to end | Must not invent supplier-payables or COGS semantics independently of the agreed shared contract. |
| Chat 3 — Expenses & Reports | Expense lifecycle and consistent cross-feature financial visibility | Must not infer cash from invoices or show authoritative profit if cost data is incomplete. |
| Chat 4 — Employees & Payroll | Employee records, salary calculations, payroll approval/payment and posting | Must not store sensitive payroll data in logs or bypass the agreed expense/payment/audit contract. |

The four feature chats are independent specialists, not four product masters. They may recommend changes to shared contracts, but only Master makes and records cross-feature decisions.

## The four feature work orders

See the child pages below:

1. Chat 1 — Sales, Invoices & Payments
2. Chat 2 — Inventory, Purchasing & Suppliers
3. Chat 3 — Expenses, Cash Flow & Reports
4. Chat 4 — Employees & Payroll

The shared task board is <mention url="https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f" />.

## Delivery sequence

Planning and codebase discovery may happen in parallel. <b>Gate 0:</b> Master completes and approves T37 shared financial contracts before any feature locks shared models, APIs, or migrations. Feature implementation and merge order is intentionally sequenced because all four features touch shared monetary rules, database migrations, audit history, expenses, or reporting.

1. <b>Sales-to-cash:</b> invoice and payment correctness, allocations, returns/refunds/credit notes, and the shared monetary/state contract.
2. <b>Inventory/procure-to-pay:</b> stock movements, purchase receiving, supplier liabilities/payments, and cost inputs. Integrate sales stock effects.
3. <b>Expenses and financial reports:</b> use verified source transactions and agreed accounting definitions; reconcile amounts by currency.
4. <b>Employees/payroll:</b> approve and pay payroll, then post its financial effect once into the agreed expense/financial model.
5. <b>Master integration:</b> run cross-feature regressions and release verification after each merge candidate; release only when all agreed four feature gates are satisfied.

A downstream chat may inspect the repo, write its proposed state machine, design tests, and prepare a dependency list while waiting. It must not make competing changes to shared models/migrations before Master approves the shared contract and its place in the queue. Master may authorize overlap after contracts are stable and branch conflicts are assessed.

## Mandatory group command: <code>@n</code> — Notion-first coordination

- <code>@n</code> means <b>synchronize the group through Notion now</b>; it is not just a status question or a request for a plan.
- Master reads the Agent Prompt Registry, this Operating Model, Master Task Plan, relevant canonical task pages, and their latest comments; verifies any referenced GitHub branch/SHA/PR/CI; resolves conflicts/dependencies; and writes decisions, assignments, questions, and handoffs directly to the existing Notion pages.
- Each specialist must read its canonical task page and new comments when its chat starts/resumes or receives <code>@n</code>, then acknowledge/respond/report on that same Notion page using the required comment envelope. Do not create duplicate tasks or ask the user to relay messages.
- Notion is the shared coordination mailbox, but comments are <b>not guaranteed to wake a dormant ChatGPT chat</b>. Never claim a specialist saw or acted on an instruction until its acknowledgement/evidence appears in Notion. Track missing acknowledgements and follow up when that chat becomes active.
- After synchronization, Master replies to the user with a concise summary and links to the updated Notion pages. If Notion access/write fails, report <code>BLOCKED — Notion communication not synchronized</code> with the exact error. No merge/deploy authority is implied by <code>@n</code>.

## Standard execution protocol for every chat

1. <b>Inspect first:</b> read <code>AGENTS.md</code>, <code>TASKS.md</code>, <code>README.md</code>, product scope, the work order, main SHA, open PRs, relevant branches, migrations, existing routes/models, and CI evidence. Reuse existing work; do not restart an audit or create duplicates.
2. <b>Report a bounded plan before code:</b> baseline SHA; what exists; specific gaps; lifecycle/state machine; affected UI/API/schema/integrations; authorization and tenant boundaries; tests; dependencies; branch/PR reuse. Do not just propose generic improvements.
3. <b>Use one active feature branch per chat:</b> inspect for an existing matching branch/PR first. Reuse it when appropriate. Create a branch only for this substantial feature if no suitable branch exists. Do not make branch-per-task or branch-per-commit.
4. <b>Own end-to-end quality:</b> UI, API, database/migration, validation, authorization, error/loading/empty states, audit history, tests, documentation, and mobile/Arabic RTL behavior where applicable.
5. <b>Keep work isolated:</b> no direct push to <code>main</code>; no unrelated feature edits; do not rewrite shared financial schemas or shared migrations without Master review.
6. <b>Prove results:</b> run applicable unit/integration tests, accounting/authorization regressions, migration validation, frontend quality/build, security/dependency checks, and required CI. Report the exact command/check, commit SHA, and observed outcome. Anything not executed is <b>NOT RUN</b>.
7. <b>Open or update one focused PR:</b> link the feature work package, explain state transitions and data implications, summarize tests, migration/rollback concerns, security review, and remaining limitations.
8. <b>Do not merge or deploy:</b> feature chats prepare and maintain the PR. Master reviews it, checks exact-head gates and ordering, then decides whether to merge. Production deployment requires a separate authorized release gate.
9. <b>Update handoff:</b> update the matching work package status/evidence and the canonical GitHub queue. Report changed files, branch/PR/commit, test outcomes, risks, blockers, and next action.
10. <b>Never declare complete by appearance:</b> a visible screen, code existing, old green CI, preview deployment, or HTTP 200 alone is not proof of a complete business lifecycle.

## Financial and security invariants across all four features

- Business/tenant scoping and server-side authorization apply to every read and write; UI hiding is not security.
- Every monetary record has an explicit currency. Never silently add or convert different currencies.
- Monetary calculations use decimal-safe types, documented rounding and server-side validation. The client is never trusted for totals, permissions, payment status, or payroll net pay.
- An invoice issued is not cash collected; a supplier bill is not a supplier payment; an approved payroll run is not a paid payroll run; an expense record must distinguish payable/approved from actually settled when the product supports that distinction.
- Financial writes must be transactional and idempotent where retries are possible. Duplicate requests must not double-charge, double-pay, double-post expenses, or double-move inventory.
- Avoid silent deletion/overwriting of financial history. Use guarded status transitions, auditable reversals/corrections, actor, timestamp, reason, and linked source references.
- Reports derive from source transactions and state which totals are actual, outstanding, estimated, or incomplete. Profit is not presented as authoritative without sufficient COGS/direct-cost coverage.
- AI remains advisory/read-only for consequential financial changes unless a separately approved, tested, auditable human-confirmation workflow exists.
- Never place API keys, tokens, service-account JSON, database URLs, or private payroll/customer financial data in docs, commits, PR comments, or logs.

## Definition of Ready

Before coding, the work order must have:

- confirmed baseline and existing-work inventory;
- user-visible outcome and in/out-of-scope boundaries;
- lifecycle and allowed/rejected state transitions;
- data model, monetary semantics, and integration contract;
- authorization/tenant matrix;
- dependencies and migration/rollback implications;
- measurable acceptance criteria and a test matrix.

## Definition of Done

A feature is not <b>VERIFIED COMPLETE</b> until:

- its entire lifecycle works across UI, API, persistence, and integrations;
- financial totals reconcile against source records with no duplicates or silent gaps;
- allowed and denied roles, foreign-tenant IDs, invalid transitions, retries, and partial failures are tested;
- relevant tests, migrations, build, security checks, and exact-PR-head CI pass;
- documentation, task state, and evidence links are updated;
- Master has reviewed the diff and merged it under repository rules.

A production release is a separate status. It can be called <b>VERIFIED COMPLETE</b> only after the intended frontend/backend SHA is confirmed live, required environment and migration gates are satisfied, and authenticated smoke tests plus safe financial reconciliation pass. If production checks were not executed, say <b>NOT RUN</b>.

## Status vocabulary

- <b>Not started:</b> baseline/implementation has not begun.
- <b>In progress:</b> work is active; list the next concrete step.
- <b>Ready for verification:</b> implementation is ready for independent tests/review, with evidence attached.
- <b>Blocked:</b> a specific dependency, failing check, permission, or decision prevents progress. State the exact blocker and continue independent safe work.
- <b>Done:</b> all task acceptance criteria have evidence and the required merge gate passed. Does not by itself mean deployed to production.
- <b>Production verified:</b> recorded in the release evidence only after deployment/version and smoke checks are confirmed.

## Handoff format required from every feature chat

```txt
FEATURE / OWNER:
OVERALL: total tasks / verified / in progress / blocked / remaining (count only real records)
BASELINE: main SHA and date checked
PLAN: work packages and dependency order
BRANCH / PR: exact links and current state
CHANGED: files and behavior
QUALITY: commands/checks run + PASS/FAIL/NOT RUN
FINANCIAL RECONCILIATION: cases and observed totals
SECURITY: roles, tenant isolation, idempotency, audit coverage
BLOCKERS: exact evidence and attempted safe alternatives
NEXT: one next action
```

## Master operating cadence

- At kickoff: reconcile Notion feature packages with GitHub live state and choose the next execution slot.
- At each meaningful milestone: review the worker’s exact branch/PR and request evidence-based status, not a narrative-only report.
- Before merge: inspect diff and history, verify no duplicate/stale work, exact-head CI, reviews/rules, migration safety and cross-feature regressions.
- After merge: verify the merge SHA and main CI before the next feature branch advances.
- Before release: review all four feature gates and security/restore/environment/mobile checks; deployment stays separate and requires authorization.
- At close: update <code>TASKS.md</code>, feature page evidence, release notes/limitations, merge SHA and live SHA if deployed.

## Existing project links

- <mention url="https://app.notion.com/p/401bbf2bc2c581348ff3ed65b2367c1a" />
- <mention url="https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f" />
- [GitHub repository](https://github.com/AbdullahOmaar/ai-business-assistant)
- [Live frontend](https://ai-business-assistant-web.vercel.app)
- [Live API readiness](https://ai-business-assistant-api.vercel.app/readyz)
- [Production deployment runbook](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/docs/PRODUCTION_DEPLOYMENT.md)

<page url="https://app.notion.com/p/407bbf2bc2c581eab572cf190f349936">
Chat 1 — Sales, Invoices & Payments
</page>

<page url="https://app.notion.com/p/407bbf2bc2c58121be71c4ceb8dfb254">
Chat 2 — Inventory, Purchasing & Suppliers
</page>

<page url="https://app.notion.com/p/407bbf2bc2c581bea2c9f76058c492e0">
Chat 3 — Expenses, Cash Flow & Financial Reports
</page>

<page url="https://app.notion.com/p/407bbf2bc2c5819a99bfc3eb61a2570b">
Chat 4 — Employees & Payroll
</page>

## Four feature-owner work orders

[Chat 1 — Sales, Invoices & Payments](https://app.notion.com/p/407bbf2bc2c581eab572cf190f349936)

[Chat 2 — Inventory, Purchasing & Suppliers](https://app.notion.com/p/407bbf2bc2c58121be71c4ceb8dfb254)

[Chat 3 — Expenses, Cash Flow & Financial Reports](https://app.notion.com/p/407bbf2bc2c581bea2c9f76058c492e0)

[Chat 4 — Employees & Payroll](https://app.notion.com/p/407bbf2bc2c5819a99bfc3eb61a2570b)

## Master feature epics

Use the existing [Master Task Plan](https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f); T37 is the Master-owned contract gate and T38–T41 are the four feature epics. GitHub <code>TASKS.md</code> remains the canonical detailed engineering queue.

## Master-owned prerequisite

[T37 — Shared financial contracts & integration boundaries](https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd) must be reviewed before any downstream chat locks shared models, transaction interfaces, financial semantics, or migrations. Feature epics are T38 (Sales), T39 (Inventory/Purchasing), T40 (Expenses/Reports), and T41 (Employees/Payroll).

<page url="https://app.notion.com/p/407bbf2bc2c58160be0cefe4f6374d05">
AI Business Assistant — Agent Prompt Registry & Work Protocol
</page>

## Canonical agent prompts and work protocol

All project chats must use the role instructions in the [AI Business Assistant — Agent Prompt Registry & Work Protocol](https://app.notion.com/p/407bbf2bc2c58160be0cefe4f6374d05). Keep the role prompt and shared rules in Notion; do not maintain competing copies in chat messages. Before each task, read the relevant prompt and work order, then inspect GitHub for live implementation and CI evidence. Update Notion for product-level ownership/decisions and GitHub for code-level task evidence. If the prompt and repository evidence conflict, stop and reconcile with the Master rather than guessing.

## Execution-depth contract — complete the task, not just the report

This is mandatory for every specialist and every <code>@r</code> / execute request.

### Stop conditions: when may a worker return?

A worker may return a final report only when one of these is true:

1. <b>VERIFIED COMPLETE:</b> all acceptance criteria of the assigned work package have implementation and evidence; relevant tests/checks were run; the diff and exact commit/PR head were reviewed; canonical Notion and GitHub task records were updated.
2. <b>PARTIALLY COMPLETE:</b> a meaningful end-to-end slice is implemented and tested, and the remaining acceptance criteria are explicitly mapped to the next executable steps. If any safe independent work remains, continue it before reporting.
3. <b>BLOCKED:</b> a specific permission, missing product decision, unavailable dependency, or reproducible environment failure prevents further safe progress. Include exact evidence and attempted safe alternatives. Continue any independent parts of the same work package that remain possible.
4. <b>NOT RUN:</b> only for a named check/action that was not executed; this is not a substitute for the task's overall status.

<b>Not valid reasons to stop:</b> finishing the plan, reading the task, finding one issue, making one tiny change, one passing test, or writing a progress report. Do not return a plan-only answer when implementation can proceed.

### Required execution loop

1. Re-read the canonical task, latest comments, acceptance criteria, and previous handoff. Inspect current GitHub main SHA, assigned branch/PR, latest diff, and exact-head CI. Reuse existing work; do not recreate finished work.
2. Convert the acceptance criteria into a checklist inside the existing task/PR. Identify dependencies and safe work that can run in parallel. Do not create a new Task for each substep.
3. Execute a complete vertical slice: change the relevant code/config/docs, add tests for successful and rejected paths, run those tests, inspect the diff, and fix any issue caused by the change.
4. Keep going in the same work session. After each slice, compare remaining criteria against evidence and immediately take the next safe step. Do not yield for a report after each tiny change.
5. Run the full relevant verification set for the work package: unit/integration/API/database tests as applicable, build/lint/type/security checks, migration validation, and CI for the exact current head. Explicitly distinguish passed, failed, and NOT RUN.
6. Review for regressions, authorization/tenant leaks, data integrity, retries/idempotency, migrations/rollback, accessibility/mobile/RTL, and documentation where applicable.
7. Update the same canonical Notion task and the existing GitHub task/PR with concrete artifacts and evidence. Keep one active feature branch and one focused PR per package; no branch-per-subtask.
8. Reassess the queue and start the next independent acceptance criterion or ready package only when doing so does not violate dependencies, shared-contract approval, ownership, or release gates.
9. Return one consolidated report at the end of the work session, not a report after each tool call. Intermediate messages should be brief and used only for material decisions, genuine blockers, or meaningful checkpoints.

### What counts as meaningful progress?

- Code, tests, migration, or a user-visible workflow changed and the diff is inspectable; OR
- A non-code deliverable with a completed, accepted artifact (for example a full route/role/tenant matrix), backed by source evidence; OR
- A verified blocker with reproduction, exact error, safe alternatives attempted, and the independent work completed around it.

A plan, narrative, commit count, test count without outcome, or "reviewed" statement alone is not progress credit.

### Expected single-session outcome

For each invocation, target the <b>largest coherent, safe, verifiable unit of work</b> already assigned. Do not impose an arbitrary time quota; use acceptance criteria as the finish line. If the whole epic is too large for one run, finish at least one vertical slice end-to-end and continue additional independent slices until the task is complete or a real blocker stops the remaining work. On resume, continue from the canonical handoff rather than restarting discovery.

### Final evidence envelope

Every final checkpoint must include:

- Task ID and owner; acceptance criteria completed / total (evidence-backed)
- Overall status: VERIFIED COMPLETE / PARTIALLY COMPLETE / NOT RUN / BLOCKED
- Changed files/artifacts and substantive behavior delivered; explicitly say "no code changed" when true
- Branch, exact HEAD SHA, PR state/link, and merge/deployment state only when verified
- Exact commands/checks with PASS/FAIL/NOT RUN and test counts
- Remaining criteria and blockers with exact dependency/owner
- Evidence links and the next concrete action
- Updated canonical Notion task + GitHub <code>TASKS.md</code> when access permits

### Anti-gaming rules

- Never inflate work by counting commits, messages, test cases, or one task multiple times.
- Never claim a PR was executed, a check passed, a task was completed, or a worker acknowledged without direct evidence.
- A status message does not replace the deliverable. If the task is still active, keep executing after the checkpoint.
- Shared financial contracts, branch protections, merge, production deployment, and other owner-controlled decisions remain behind their existing approval gates.

## Progress measurement and weekly trend

Use the <b>existing Master Task Plan</b> as the only active task backlog. Do not create a second task tracker or duplicate dashboard. Keep a dated progress snapshot in this Operating Model's comments or the existing control-center progress log, then compare snapshots using the same definitions.

Report, per unique Task ID and per owner: assigned/open, VERIFIED COMPLETE, PARTIALLY COMPLETE, BLOCKED, Ready for Verification, NOT STARTED, reopened/regressed, and acceptance criteria completed/total. Also track: PRs opened/merged, exact-head CI pass/fail/NOT RUN, tasks with stale evidence, age of each blocker, and last verified activity.

Progress rate is based on newly verified unique Task IDs / newly completed acceptance criteria, not messages or commits. A task remains partial until the stated acceptance criteria are evidenced; a merged PR and production verification are separate milestones.

Initial baseline (2026-10-29): 43 Master Task Plan records — 29 Archived, 7 In progress, 2 Blocked, 2 Ready for verification, 3 Not started. These are record counts only, not a feature completion percentage. Verified per-agent completion counts remain Unknown until each record is matched to concrete owner and delivery evidence. Recalculate from the live view at each checkpoint; do not carry this snapshot forward as if current.

## Dated execution checkpoint — 2026-10-29 (live Master Task Plan view)

<b>Observed status totals:</b> 43 records = 29 Archived, 7 In progress, 2 Blocked, 2 Ready for verification, 3 Not started. These totals describe the database records, not current agent activity or accepted feature completion.

<b>Owned active work packages:</b>

- Master — Product & Release: T37 In progress; T43 Not started.
- Chat 1 — Sales & Payments: T38 Blocked; T42 Not started.
- Chat 2 — Inventory & Purchasing: T39 Blocked.
- Chat 3 — Expenses & Reports: T40 In progress.
- Chat 4 — Employees & Payroll: T41 In progress.
- Owner/Chat not set in the database: T03, T15, T18, T22 In progress; T01 and T07 Ready for verification; T29 Not started. These ownership gaps must be reconciled, not assigned by guess.

<b>Execution-depth rollout:</b> the new policy was appended to this Operating Model and the Agent Prompt Registry. Comments with scoped directions were successfully posted to the canonical T37, T03, T38, T39, T40, T41 and four specialist chat pages. The T22 comment failed its first write and requires retry. This records dispatch attempts only; it is not evidence that the chats received, acknowledged, or began work.

<b>Worker activity verification:</b> no acknowledgement of this newest directive has been observed after dispatch as of this checkpoint. Notion's agent/session discovery tool is unavailable under the current workspace entitlement (Business plan required), so active session status and direct wake-up cannot be verified. Do not describe workers as active until a fresh acknowledgement or code/test artifact appears.

<b>Next review gate:</b> at the next active chat/resume, require the specialist to respond on its existing task page with an acknowledged checkpoint and then produce changed code/tests or a full evidence-backed independent artifact. Compare exact SHA, diff, commands/results and remaining criteria; if only a report appears with safe work remaining, mark the work PARTIALLY COMPLETE and direct the next concrete step.

## Fresh evidence snapshot — 2026-10-29 00:45 UTC

<b>Live GitHub baseline:</b> <code>main</code> remains <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>; its combined status is <b>9/9 SUCCESS</b> (includes CircleCI plus Vercel status contexts). This is not authenticated production workflow verification. Main is currently unprotected and required status-check enforcement is off; no branch settings were changed.

<b>Observed current work (all open Drafts, none merged):</b>

| Workstream | Evidence-backed activity | Exact head | Exact-head checks | Interpretation / remaining |
| --- | --- | --- | --- | --- |
| T03 Security / QA cross-tenant route matrix — [PR #302](https://github.com/AbdullahOmaar/ai-business-assistant/pull/302) | 16 commits, 2 files, last updated 00:44:13 UTC | <code>5d563855866e7eaa7411437a9172bd30015ef7e6</code> | CircleCI <b>7/7 SUCCESS</b> — [workflow](https://circleci.com/workflow-run/3c3500ea-0fbc-4f74-a5e0-be148f957b35) | Active engineering/verification evidence; still Draft, full route × role × tenant matrix and authenticated production smoke remain incomplete/NOT RUN. |
| T38 Sales — [PR #305](https://github.com/AbdullahOmaar/ai-business-assistant/pull/305) | 2 commits, 2 files; test + TASKS checkpoint | <code>2e07a4f2757edf0cade826fd131dcb3c5cd723b0</code> | CircleCI <b>7/7 SUCCESS</b> — [workflow](https://circleci.com/workflow-run/ea763e4a-8bcc-48cd-9905-70ba8b502099) | Only a narrow regression test. Review found it duplicates existing main coverage in <code>test_foreign_business_workflows.py</code>; Master placed a review comment requiring a unique gap or removal/replacement. Do <b>not</b> count the PR as net-new security coverage until corrected. |
| T39 Inventory — [PR #306](https://github.com/AbdullahOmaar/ai-business-assistant/pull/306) | 2 commits, 2 files; 18-scenario acceptance matrix + TASKS checkpoint, last updated 00:41:38 UTC | <code>dffcb7656121eacaa875671ffa1c3f34bc7a6376</code> | CircleCI <b>7/7 SUCCESS</b> — [workflow](https://circleci.com/workflow-run/6a06c123-2ca5-483a-925d-ff9bffbd67f8) | PARTIALLY COMPLETE: docs-only; backend tests/build/security scan NOT RUN. Work order now asks for an actual missing over-receipt/no-side-effect regression after proving existing tests do not cover it. |
| T40 Expenses / reports — [PR #304](https://github.com/AbdullahOmaar/ai-business-assistant/pull/304) | 3 commits, 2 files; reporting regression tests | <code>f1a3738aa85f018afb1681815ed77d4de082c5e4</code> | CircleCI <b>7/7 SUCCESS</b> — [workflow](https://circleci.com/workflow-run/33b91e9c-d947-4bf5-ac5d-5fd1f715dbd2) | Partial test-focused increment: invoice-only vs cash, currency separation, non-member P&L denial, UTC half-open date boundary. Local test/build/security NOT RUN; continue to next uncovered safe report criterion. |
| T41 Employees / payroll | Existing branch has a 76-line gap-audit document only; no PR found | <code>558dc119f5fd7e8f88126818fe9d171c5926a073</code> | CircleCI <b>7/7 SUCCESS</b> — [workflow](https://circleci.com/workflow-run/af70933d-0523-49aa-b8d1-560e1a251d33) | Docs-only candidate; payroll lifecycle/schema acceptance not implemented. Shared payroll/expense behavior remains gated on T37/T40 approval; local tests and migration upgrade/downgrade NOT RUN. |

<b>Dispatch and actual acknowledgement:</b> The execution-depth contract has been added to this Operating Model and the Agent Prompt Registry. Scoped comments were posted to T37, T03, T22, T38–T41 and each of the four specialist work-order pages. These comments are handoffs, not proof the target chat read them. PR/task evidence proves activity for security/QA, sales, inventory, and reporting in the observed window; it does <b>not</b> prove each chat acknowledged the latest new directive or will remain active.

<b>Communication blocker:</b> Notion's custom-agent/session search tools require a Business-plan entitlement and returned <code>entitlement_required</code>. Directly discovering or waking the separate ChatGPT/custom-agent sessions therefore remains <b>BLOCKED</b> from this connection; no wake-up or acknowledgement is claimed. Recovery/upgrade route provided by Notion: [https://app.notion.com/notion-mcp-chatgpt?source=mcp\_tool\_upsell&tool=search\_sessions&product=business&mcpRequestId=ea892c18-fcfb-4c01-abcd-5dab5dda9e02&mcpUpsellOpportunityId=dff68b59-313b-4e23-8f67-1526d8adf62d](https://app.notion.com/notion-mcp-chatgpt?source=mcp_tool_upsell&tool=search_sessions&product=business&mcpRequestId=ea892c18-fcfb-4c01-abcd-5dab5dda9e02&mcpUpsellOpportunityId=dff68b59-313b-4e23-8f67-1526d8adf62d)

<b>Master next actions:</b> (1) Require T38 to remove/replace its duplicate test on the existing branch/PR; (2) require T39 to add a real uncovered regression, not another documentation-only checkpoint; (3) keep T40 moving to another uncovered safe report criterion; (4) resolve the T37 owner-decision matrix so T38–T41 can implement blocked financial lifecycles; (5) verify T41's next code-backed action when the chat next runs. No PR was merged and no production deployment was performed.

## Evidence refresh — 2026-10-29 00:50 UTC

Rechecked PR heads and combined statuses after the preceding checkpoint; update the 00:45 snapshot with these current exact-head results:

| Workstream | Current exact head | Latest CI observation | Current interpretation |
| --- | --- | --- | --- |
| T03 / security route matrix — [PR #302](https://github.com/AbdullahOmaar/ai-business-assistant/pull/302) | <code>5d563855866e7eaa7411437a9172bd30015ef7e6</code> | 7/7 SUCCESS; [workflow](https://circleci.com/workflow-run/3c3500ea-0fbc-4f74-a5e0-be148f957b35) | Still Draft/open/unmerged; meaningful test + route-inventory work evidenced. |
| T38 / sales — [PR #305](https://github.com/AbdullahOmaar/ai-business-assistant/pull/305) | <code>3def4724103b16c83f28309f5a5e459296350e6a</code> | 7/7 SUCCESS after refresh; [workflow](https://circleci.com/workflow-run/9e8e0aa5-8789-42bf-a304-36cfafff9b87) | Still Draft/open/unmerged. Newest commit is documentation-only; test still duplicates existing main cross-tenant payment-allocation coverage. Master has requested a unique, evidence-backed gap or removal/replacement. CI green does not resolve duplication. |
| T39 / inventory — [PR #306](https://github.com/AbdullahOmaar/ai-business-assistant/pull/306) | <code>45f605d15328fc4b64667a0bb8ee20e9b9ffd41d</code> | 7/7 SUCCESS after refresh; [workflow](https://circleci.com/workflow-run/63ecaafb-f715-4d9b-a7fa-393d9b8bdbc8) | Still Draft/open/unmerged and documentation-only. Current matrix is useful, but the next required slice is executable over-receipt atomicity coverage, after confirming absence from the suite. |
| T40 / reporting — [PR #304](https://github.com/AbdullahOmaar/ai-business-assistant/pull/304) | <code>f1a3738aa85f018afb1681815ed77d4de082c5e4</code> | 7/7 SUCCESS; [workflow](https://circleci.com/workflow-run/33b91e9c-d947-4bf5-ac5d-5fd1f715dbd2) | Still Draft/open/unmerged. New source-to-metric audit identifies that outstanding balances subtract current allocations from period-issued invoices; this is not historical period-end balance. Owner/Master must decide semantics before code changes. |
| T41 / payroll | <code>558dc119f5fd7e8f88126818fe9d171c5926a073</code> | 7/7 SUCCESS on documentation-only branch; [workflow](https://circleci.com/workflow-run/af70933d-0523-49aa-b8d1-560e1a251d33) | No new code-backed activity or PR found after the execution directive; still only the 76-line gap audit. Next resume must either produce independent test evidence or surface precise decision blocker. |

<b>Current progress signal:</b> Security/QA has the strongest verified execution signal (new route/role tests, current exact-head 7/7); reporting has meaningful test coverage and a new source-to-metric audit; T38/T39 have current green CI on partial candidates but need substantive follow-through (T38 duplicate coverage, T39 docs-only); T41 remains the least advanced in implementation terms. The 7/7 on documentation/test branches means configured CI jobs succeeded on those exact heads; it does not prove the feature epic is complete, nor that every business workflow or live production behavior was tested.

<b>Next checkpoint rule:</b> when T38/T39 respond to the 00:47:58–00:47:59 UTC Master follow-ups, compare new file diffs and current exact-head CI—not just the text of their report. Do not count another [TASKS.md](http://TASKS.md)-only commit as substantive completion.
</content>
</page>
