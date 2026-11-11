---
document_id: ABA-KNOW-00
title: Project Charter & Source Map
version: 1.0.12
status: DRAFT
owner: Project Master / Repository Owner
last_verified_at: 2026-11-11T23:40:35Z
review_due: 2027-02-09
knowledge_class: STABLE
applicable_scope: AI Business Assistant — Production V1
canonical_sources:
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/0d28a6680a76800cdec90247cfa735ea87d3c2a9/README.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/0d28a6680a76800cdec90247cfa735ea87d3c2a9/AGENTS.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/0d28a6680a76800cdec90247cfa735ea87d3c2a9/docs/PRODUCTION_DEPLOYMENT.md
  - https://app.notion.com/p/4099320b90fb81259288c92962839b90
  - https://app.notion.com/p/4089320b90fb81b7a65ae9dec567d73b
  - https://app.notion.com/p/4099320b90fb8158bc86d8e105cfc3ea
related_github_sha: 0d28a6680a76800cdec90247cfa735ea87d3c2a9
supersedes: none
superseded_by: none
---

# Project Charter & Source Map

> **Approval state:** DRAFT candidate version 1.0.12; this five-document package is not approved for Project Sources publication. The Owner's underlying development-stage write authorization is effective in canonical Notion from 2026-11-11 and is separate from approval of this package. **Project Sources upload/readback:** NOT VERIFIED; publication requires the separate UI operation and exact readback. This is a curated orientation document, not a live project-status feed or an approval of unresolved product/financial policies.

## 1. Project identity

- **Project:** AI Business Assistant
- **Repository:** [AbdullahOmaar/ai-business-assistant](https://github.com/AbdullahOmaar/ai-business-assistant)
- **Mission:** An AI-powered business assistant for retail shops and service providers.
- **Product baseline:** Production V1 ERP Charter in Notion.
- **Primary product direction:** web-first business operations with AI assistance grounded in the business's authorized records.
- **Current accepted V0 application stack:** Angular frontend, Python/FastAPI backend, PostgreSQL persistence.
- **Current lifecycle classification (Owner decision, 2026-11-11):** development / pre-release; not yet a real customer-production business environment, even when provider targets or aliases use the Production label. Provider technical metadata remains unchanged and must be reported accurately.

## 2. Product mission and intended outcomes

Help a small business operate from a coherent, auditable workspace rather than disconnected spreadsheets and tools. The product direction includes business/customer/supplier records, sales and invoicing, purchasing and inventory, expenses and reporting, employee/payroll workflows, and an accounting foundation subject to separately approved policies.

Expected outcomes:
- Reliable, workspace-scoped operational records.
- Clear separation between invoices, collected payments, allocations, expenses, balances and stock movements.
- AI assistance that uses only authorized, workspace-grounded information.
- Human review for consequential AI-proposed changes.
- Auditable business actions and explainable reports.

The Notion Production V1 Charter owns exact release scope, module acceptance and dependencies. This summary does not replace that charter.

## 3. Product principles

1. Each business/workspace's data is isolated from every other business.
2. Authorization is enforced on the server; hiding a UI control is not authorization.
3. Invoiced sales, collected payments, payment allocations and outstanding balances are distinct concepts.
4. Currencies are not combined without an explicit approved conversion policy.
5. Profit is an estimate when required cost data is incomplete.
6. Stock balances derive from recorded stock movements, not silent quantity overwrites.
7. Consequential actions require appropriate human approval and auditability.
8. AI-generated output and retrieved content are untrusted until checked against authoritative evidence.
9. A configured URL, successful build or HTTP 200 alone does not establish production readiness.

## 4. Scope boundaries

- The Production V1 Charter is the canonical authority for in-scope modules and acceptance outcomes.
- This knowledge package does not add product features or redefine release scope.
- The accepted V0 architecture is web-first. A second client such as Flutter is deferred unless validated demand and an approved decision change that boundary.
- Financial semantics, tax, COGS, AP, FX, GL, payroll statutory/effective-date rules and posting behavior must follow a current, explicit, versioned approval. The current Notion handover records a T37 authority conflict and treats T37 as Draft / NOT APPROVED until reconciled; dependent changes remain fail-closed.
- This package records the Owner's bounded development-stage authorization for account/workspace creation, use of project data needed for assigned work, and invoice create/edit through normal authenticated application/API workflows, including on a deployment technically labelled Production. It does not authorize hard deletion, payment/settlement/void/post operations, destructive migrations, external transactions/messages, paid provisioning, merge or release; those remain separately gated.

## 5. Glossary

| Term | Meaning |
| --- | --- |
| Business / Workspace | Tenant boundary that owns business records and memberships |
| Owner / Staff | Application roles; exact capabilities are enforced by the backend policy |
| Workstream | A bounded outcome with one accountable owner, acceptance criteria and evidence |
| Feature Owner | Documented responsibility for a workstream; not proof of the current chat's identity |
| Runtime identity | A verified agent/session identity, distinct from a logical role label |
| Exact SHA | The full Git commit hash to which a check, review or deployment evidence applies |
| Source of truth | The system authorized to establish a particular information class |
| Published Knowledge Package | Approved, versioned, curated Markdown copies attached to Project Sources |

## 6. Authority map

| Information class | Authoritative source | How Project Sources should be used |
| --- | --- | --- |
| Source code, branches, commits, issues, PRs, reviews | GitHub live repository | Orientation and links only |
| Tests and CI | GitHub Actions (`.github/workflows/ci.yml`) is the sole active and approved repository CI provider; its exact-SHA `all-checks-passed` aggregate is required. CircleCI's webhook is disabled, no project schedules exist, and no CircleCI fallback is active. GitLab is inactive; Semaphore is retired/non-authoritative | Validate required checks on the exact candidate SHA. Batch related work, use targeted checks only when needed, reuse still-valid PASS evidence, and avoid redundant full-suite reruns; never bypass a required gate |
| Deployment and runtime | Vercel deployment/runtime evidence; Neon for schema/revision evidence | Link to runbooks; never claim live state |
| Product scope and release outcomes | Approved Notion Production V1 Charter and versioned product decisions | Stable summary only; defer to canonical page |
| Assignments, ownership, dependencies, workstream status | Notion Master Task Plan and canonical task pages | Explain where to look; do not mirror current rows |
| Agent roles and operating model | Notion Agent Prompt Registry and Product & Agent Operating Model | Curated stable rules with canonical references |
| Architecture | Accepted GitHub ADRs and architecture docs | Summary only; GitHub remains canonical |
| Security and release gates | GitHub AGENTS/runbooks plus approved Notion policy | Curated guardrails; never waive higher-authority gates |
| Shared stable project context | Approved package in this directory | Primary orientation copy for Project Sources |

## 7. Canonical navigation

### GitHub
- [README](../../README.md)
- [AGENTS.md](../../AGENTS.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [TASKS.md](../../TASKS.md) — dynamic handoff ledger; reconcile live before use.
- [Architecture Baseline](../ARCHITECTURE_BASELINE.md)
- [ADR-001](../adr/ADR-001-v0-architecture.md)
- [Production Deployment Runbook](../PRODUCTION_DEPLOYMENT.md)
- [Security Route Inventory](../SECURITY_ROUTE_INVENTORY.md)

### Notion
- [MWOS — Modular Workstream Operating System](https://app.notion.com/p/4099320b90fb8158bc86d8e105cfc3ea)
- [Production V1 ERP Charter](https://app.notion.com/p/4099320b90fb81259288c92962839b90)
- [Product Home](https://app.notion.com/p/4089320b90fb81b7a65ae9dec567d73b)
- [Master Task Plan](https://app.notion.com/p/4089320b90fb81019388ce0caa28d086)
- [Product & Agent Operating Model](https://app.notion.com/p/4089320b90fb81ddb93de5116f9f0097)
- [Agent Prompt Registry](https://app.notion.com/p/4089320b90fb81609645e481ef626401)
- [Universal Work Execution Standard](https://app.notion.com/p/4099320b90fb81b388fadb891c9e7f44)
- [Work Package & Handoff Standard](https://app.notion.com/p/4099320b90fb812ebd0dc58a22d8ed7c)
- [E2E Operating Model & Assurance Plan](https://app.notion.com/p/4099320b90fb8107a66dd4aeb6924fb9)

## 8. New-chat bootstrap

Every new or resumed project chat should:

1. Read the Project Instructions and all five Project Sources documents.
2. Discover its role only from its own conversation context or a verified runtime binding. If blank or conflicting, default to Master triage; do not infer identity from Feature Owner.
3. Read the canonical Notion Registry, Operating Model, Master Task Plan, relevant task page and latest handoff/comments.
4. Inspect live GitHub `AGENTS.md`, `README.md`, `TASKS.md`, current main SHA, relevant branches/PRs/diffs and exact-head checks.
5. Verify deployment/runtime state from the owning provider when release behavior is relevant.
6. Reconcile discrepancies by information authority, explicit approval and supersession—not last-edited time alone.
7. State inaccessible sources and continue only safe, independent work.
8. Never treat this package as a live database or proof of current task/PR/deployment status.

## 9. What this document does not contain

It intentionally excludes current task lists, branch/PR state, CI results, deployment snapshots, runtime errors, active agent/session lists, credentials, customer records and payroll-sensitive data. Retrieve those from the authoritative live system when needed.
