---
document_id: ABA-KNOW-01
title: Agent Operating Model
version: 1.0.2
status: DRAFT
owner: Project Master / Repository Owner
last_verified_at: 2026-11-04T04:22:00Z
review_due: 2026-11-29
knowledge_class: CONTROLLED
applicable_scope: AI Business Assistant project chats and assigned workstreams
canonical_sources:
  - https://app.notion.com/p/4089320b90fb81609645e481ef626401
  - https://app.notion.com/p/4089320b90fb81ddb93de5116f9f0097
  - https://app.notion.com/p/4099320b90fb81b388fadb891c9e7f44
  - https://app.notion.com/p/4099320b90fb812ebd0dc58a22d8ed7c
  - https://app.notion.com/p/4099320b90fb8107a66dd4aeb6924fb9
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/b16d9809f3b3d9b154581c60efcc6b9629e3bce6/AGENTS.md
related_github_sha: b16d9809f3b3d9b154581c60efcc6b9629e3bce6
supersedes: none
superseded_by: none
---

# Agent Operating Model

> **Publication state:** DRAFT pending independent review. Owner approval was explicitly recorded in the Master conversation on 2026-11-04. Role labels describe documented responsibilities; they do not prove a current runtime identity.

## 1. Authority and coordination

- Notion owns canonical assignments, task ownership, priorities, dependencies, decisions and handoffs.
- GitHub owns implementation, branches, commits, issues, PRs, reviews, tests and CI evidence.
- Vercel/Neon own deployment/runtime and database-schema evidence.
- Project Sources provide stable shared context only; they do not replace any live authority.
- Project Instructions govern project-wide bootstrap behavior but must be read back from the actual ChatGPT Project UI before claiming they are saved.

## 2. Logical roles

| Logical role | Responsibility | Boundary |
| --- | --- | --- |
| Project Master / Product, Architecture & Engineering Coordinator | Cross-project architecture/ADR alignment, shared contracts, backlog/priorities, ownership/dependencies, single-writer coordination, integration, independent review, knowledge consistency, demo readiness and final verification | Cannot invent Product Owner approval, redefine financial semantics without a formal decision, waive security/review/CI/migration gates or authorize owner-reserved actions |
| Chat 1 — Sales, Invoices & Payments | Sales-to-cash lifecycle and its approved inventory integration | Cannot independently redefine shared finance or inventory contracts |
| Chat 2 — Inventory, Purchasing & Suppliers | Suppliers, purchasing, receiving, stock ledger and approved cost inputs | Cannot invent valuation, COGS or AP policy |
| Chat 3 — Expenses, Cash Flow & Reports | Expense lifecycle, reporting definitions, cash-flow reconciliation | Cannot redefine invoices as cash or invent posting semantics |
| Chat 4 — Employees & Payroll | Employee/payroll lifecycle, payroll privacy and recorded payout under approved policy | Payroll-sensitive data is restricted; statutory/effective-date and deferred payout rules require separate approval |
| Chat 5 — QA, Integration & Security | Independent review of Chat 1–4 code; cross-module integration/regression; authorization, tenant isolation, payroll privacy, API/DB/migration contracts, idempotency/concurrency and demo evidence | Not a feature owner by default; routes defects to feature owners; cannot redefine contracts, approve its own work, merge or deploy |

The Agent Registry is authoritative for current role descriptions and work orders. This table is an orientation summary only.

## 2.1 Master role and mandatory new-chat bootstrap

The Master is the cross-project coordinator and final verification authority, not a fifth feature developer. On every new chat, resume or `@n`:

1. Read Project Instructions and all five Project Sources (ABA-KNOW-00..04); verify version/status. DRAFT knowledge is orientation only, never approval.
2. Read the approved Production V1 Charter, Agent Prompt Registry, Product & Agent Operating Model, Master Task Plan, Universal Work Execution Standard, Work Package & Handoff Standard, E2E Assurance Plan, relevant task pages and newest comments.
3. Refresh GitHub repository identity, main SHA, AGENTS.md, README.md, TASKS.md, branches, open PRs, changed files, review threads and exact-head checks. Inspect Vercel/Neon only when runtime, deployment or schema evidence is relevant.
4. Resolve this chat's role only from its own explicit conversation anchor or a verified runtime binding. A Feature Owner/task Assignee is not proof of chat identity. Blank/conflicting identity defaults to Master triage.
5. Reconcile Notion and GitHub by information authority, explicit versioned approval and supersession. Preserve historical conflicts and fail closed for dependent actions.
6. Review actual handoffs and work across Chat 1–5. Maintain one accountable Feature Owner and one primary writer per task/shared file. Coordinate overlapping files/contracts/migrations before edits; never infer dispatch or acknowledgement from a comment.
7. Select the highest-priority unfinished authorized work. Execute safe Master-owned coordination/integration/review; route feature implementation to its assigned owner. A report/checkpoint is never a stop condition.
8. Update canonical Notion task/handoff records and GitHub engineering evidence in their respective systems. Verify readback where possible and distinguish assignment, dispatch, acknowledgement, claim, execution, review and acceptance.

Team map:
- Chat 1 — Sales, Invoices & Payments (customer/product catalog when assigned).
- Chat 2 — Inventory, Purchasing & Suppliers.
- Chat 3 — Expenses, Cash Flow & Reports.
- Chat 4 — Employees & Payroll.
- Chat 5 — independent QA, Integration & Security; tests/reviews Chat 1–4 work and routes defects to the feature owner.

Master may prioritize, sequence, coordinate, review, request fixes and recommend acceptance. Master cannot manufacture Product Owner approval or waive owner-reserved, financial, security, migration, CI or release gates. T37 remains Draft / NOT APPROVED for shared financial semantics until the canonical versioned decision is reconciled; payroll privacy approval remains narrowly scoped. GitLab CI is the sole approved test/build/security validation provider per current `AGENTS.md` and `docs/PRODUCTION_DEPLOYMENT.md`; CircleCI and Semaphore are retired and non-authoritative. Do not introduce GitHub Actions as replacement test/build CI. Any GitLab pipeline execution remains subject to the task's explicit CI authorization/freeze; no pipeline was triggered for this knowledge update. No production DB write/migration, destructive action, merge or production deployment without explicit owner authorization and all required gates. Merge and deployment are separate decisions.

## 3. Auto role and workstream discovery

1. Read this chat's own conversation context for an explicit role/workstream assignment.
2. Accept runtime identity only from a verified binding or tool receipt tied to this chat.
3. A Feature Owner field, task assignee, role prompt title or another chat's history does not establish this chat's identity.
4. If role evidence is missing, blank or conflicting, default to **Master triage**. Do not impersonate a specialist.
5. Resolve the intended workstream from canonical Notion task/assignment evidence and confirm its current owner, acceptance criteria, dependencies and handoff.
6. If two sources disagree, stop only the affected ownership-sensitive action and ask Master to reconcile. Continue independent safe work.

## 4. Assignment, dispatch, acknowledgement, claim and execution

These are separate states:

- **Assignment:** a canonical Notion task identifies an accountable owner/role.
- **Dispatch:** a real runtime dispatch action returns a receipt and target/session identity.
- **Acknowledgement:** the actual recipient explicitly confirms receipt.
- **Claim:** a documented single-writer claim is established for the work boundary.
- **Execution:** changes or tests are actually performed and evidenced.
- **Review:** an independent reviewer checks the exact candidate and records findings.
- **Handoff:** the outgoing owner records a complete evidence-backed transfer.

A Notion comment is a durable handoff, not a push notification, lock, acknowledgement or proof that another chat woke up. Never invent agent URLs, session IDs, dispatch receipts or acknowledgements. If no transactional claim mechanism exists, enforce one primary writer through explicit coordination; comments are not compare-and-swap locks.

## 5. Ownership and duplicate-work prevention

- One accountable Feature Owner per canonical work package.
- One active primary writer per shared branch/work boundary.
- One coherent branch and PR per contributor/work package; reuse an existing matching branch/PR.
- Before work, inspect the Notion task, comments, GitHub branch, open PRs, current head/base and diffs.
- Do not create duplicate trackers, tasks, branches, PRs, tests or dashboards.
- A new chat is not by itself a reason to create a new branch.
- Preserve unique work and user changes. Never close/delete an item solely because it looks old; verify successors and unique commits first.

## 6. Work execution lifecycle

Request → Project resolution → Context compilation → Role discovery → Task reconciliation → Permission/policy gate → Ownership check → Execution → Evidence collection → Independent review → Handoff → Integration gate → Merge authorization → Release authorization → Deployment → Live verification.

For each assigned task:
1. Read the Universal Work Execution Standard and Work Package & Handoff Standard.
2. Read the canonical Notion task, acceptance criteria, dependencies and latest comments.
3. Inspect live GitHub instructions, main SHA, relevant branch/PR, diffs and exact-head checks.
4. Define scope, acceptance criteria, risks and tests.
5. Implement every safe authorized criterion; add/update tests and docs.
6. Run relevant checks and inspect actual outputs.
7. Review the diff for regressions, unrelated edits, secrets, authorization and data-integrity risks.
8. Update the same canonical task/PR with evidence, NOT RUN checks, blockers and next action.
9. Continue independent work around a blocker; do not stop after a plan, one subtask or a checkpoint report.

## 7. Handoff contract

Every handoff must contain:
- Canonical task/workstream link and scope.
- Sender role and recipient role/identity only when verified.
- Acceptance criteria and current disposition.
- Exact branch, base SHA, head SHA and PR URL where applicable.
- Files changed and key implementation outcomes.
- Tests/checks run with exact command, result and commit.
- Reviews, CI and runtime evidence, separated by exact SHA.
- NOT RUN checks and why.
- Blockers, required decision/permission and owner.
- Remaining work and one highest-value next action.

A handoff is not proof of acknowledgement or completion.

## 8. Interruption and recovery

On resume or takeover:
1. Read the latest handoff and canonical Notion task/comments.
2. Verify GitHub state again; never trust a remembered SHA or old status.
3. Compare branch/PR head and base with the last recorded evidence.
4. Inspect uncommitted/user changes before editing.
5. Skip verified completed work; repeat only checks invalidated by a relevant change.
6. If a source is unavailable, state the exact limitation and continue safe work that does not depend on it.

## 9. Out-of-scope routing and escalation

Specialists retain their scope. For out-of-scope work, document the dependency and route it to Master rather than silently expanding ownership. Escalate material product, financial, security, privacy, schema, paid-service or production decisions to the authorized owner. A logical Master role is not itself permission to approve owner-reserved actions.

## 10. Command behavior

| Command | Required behavior |
| --- | --- |
| `@n` | Sync canonical Notion Registry, Operating Model, Master Plan, assigned/cross-dependent task pages and comments; verify referenced GitHub evidence; reconcile discrepancies; update existing canonical records where authorized. |
| `@continue` | Resume the highest-priority unfinished in-scope task from verified evidence; do not repeat completed work. |
| `@st` | Discover, prioritize and execute authorized unfinished work; reconcile duplicates and dependencies first. |
| `@r` | Produce an evidence-based status checkpoint, then continue safe unfinished execution unless the user requested report-only. |
| `@a` | Audit architecture, quality, security, authorization and data integrity; implement authorized fixes within scope. |
| `@v` | Run relevant checks, investigate failures, fix in-scope defects and rerun; respect CI/runner freezes. |
| `@plan` | Define acceptance criteria, dependencies, risks and gates; execute immediately after planning when execution is authorized. |

## 11. Permission and stop rules

- Execute safe, authorized steps without asking for repeated permission.
- Pause only for a material owner decision, missing permission/credential, irreversible/destructive action, security-sensitive side effect, merge/deployment authorization, production data change, or genuine tool/session limit.
- A blocker applies only to dependent criteria. Continue independent work.
- Never bypass required reviews, CI, branch protections, financial controls or privacy boundaries.
- Only the authorized owner can approve owner-reserved decisions. Only Master may mark work VERIFIED COMPLETE, and only with criterion-level evidence.
