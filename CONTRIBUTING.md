# Contributing to AI Business Assistant

This guide applies to human contributors, Master, specialist chats, Codex/Gemini sessions and any future engineering worker.

## Required reading and sources of truth

Before starting or resuming work, read:
1. [Repository engineering rules](AGENTS.md).
2. [Production deployment runbook](docs/PRODUCTION_DEPLOYMENT.md).
3. [Current task and handoff in Notion](https://app.notion.com/p/4089320b90fb81019388ce0caa28d086), plus the [Universal Work Execution Standard](https://app.notion.com/p/4099320b90fb81b388fadb891c9e7f44) and [Work Package & Handoff Standard](https://app.notion.com/p/4099320b90fb812ebd0dc58a22d8ed7c).
4. Existing branch, PR, latest base/head SHA, changed paths and exact-head check results.

Authority boundaries:
- Notion: ownership, assignments, dependencies, decisions and handoffs.
- GitHub: source, branches, commits, PRs, formal reviews and CI evidence.
- CircleCI: sole approved repository CI evidence.
- Vercel: deployments, aliases and runtime evidence.
- Neon: database/schema evidence.

If sources conflict, mark the fact CONFLICTED/UNKNOWN, identify the controlling source and fail closed for consequential actions. Do not trust stale task snapshots as live GitHub/runtime state.

## Work planning and ownership

- Work outcome-first: one coherent parent task/work package with explicit acceptance criteria, risks, dependencies, owner, primary writer, path ownership and evidence requirements.
- Reuse the existing task, branch and PR for the same coherent scope. One active writing branch per contributor.
- Create a separate branch only for a genuinely independent outcome, authorization/security/release boundary or material conflict boundary. Document the reason and freeze writes on the contributor's previous branch during the independent task.
- Every handoff names one primary writer and exact owned paths. Only one writer edits a shared/coordination-sensitive file at a time.
- Coordination-sensitive examples: `app.component.ts`, `TASKS.md`, global design tokens, shared API contracts, authorization boundaries, database/schema files. Other workers may continue on non-overlapping files.
- Manual claims are coordination records, not locks or atomic leases. If claims overlap, stop only conflicting writes and reconcile with Master.
- Do not create microtasks, branches or PRs for each small edit. Batch related implementation, tests and documentation into one coherent reviewable unit.

## PR scope and review budget

Default review-planning target: **15 changed paths OR 800 non-generated changed lines or fewer**.

These are review targets, not absolute limits:
- If either target is exceeded, split only at a genuinely independent boundary, or add a staged-review plan before requesting review.
- A staged-review plan states why safe splitting is not possible, names path/behavior batches, dependencies and checks/evidence for each batch.
- Do not create micro-PRs, arbitrary commit-per-file PRs, or cherry-pick only to satisfy a numeric threshold.
- Explain generated files and lockfiles. Keep the complete cumulative diff visible.
- Request review at meaningful milestones instead of allowing a large unreviewed delta to build up.

Use the repository [PR template](.github/pull_request_template.md). Keep a single current evidence packet in the PR/task.

## Validation and CI

- CircleCI with `.circleci/config.yml` is the sole approved provider for test/build/browser/security/dependency validation.
- Require all substantive CircleCI jobs and the aggregate workflow to pass on the exact final PR head SHA.
- GitHub Actions, GitLab and Semaphore are not approved replacements. Semaphore is retired/non-authoritative.
- Empty check contexts, GitGuardian-only evidence, authored-but-not-run tests or checks from another SHA are NOT PASS.
- Do not manually trigger/retry CircleCI while an active Owner/session freeze is in force. A manual rerun requires documented diagnosis, a changed condition/justification and explicit Owner authorization. If freeze authority is unknown or conflicted, mark NOT RUN/BLOCKED; do not substitute another provider.
- Record command, runner, exact SHA, timestamp, workflow URL, each substantive result and checks not run.
- Do not weaken tests or treat source inspection as runtime execution.

## Review and merge

- A full documented maintainer review of the current cumulative diff is mandatory, including security, authorization, tenant isolation, data integrity, secrets and scope.
- A second independent reviewer is not a default project requirement under the Owner Policy effective 2026-11-06. Add one only if GitHub/provider protection enforces it or a separate explicit Owner-approved security policy requires it.
- Before merge, confirm the PR is non-Draft/READY; exact-head checks pass; maintainer review is current; blocking threads are resolved; base/divergence is reconciled; provider-enforced rules are satisfied; Owner explicitly authorized merge.
- `mergeable=true`, comments, assignments, requested reviews and green CI are not merge approval.
- Never bypass protections or merge when effective protection requirements are UNKNOWN.

## Release and data safety

- Discover Web/API/Vercel auto-deployment, release markers, Ignore Build Step behavior, migrations, production data effects and external side effects before merge readiness.
- State affected and explicitly unaffected projects in the PR.
- Merge approval does not authorize production deployment. Keep separate explicit Owner approvals for merge and deployment.
- No production database writes, migrations, schema changes, consequential financial/payroll semantic changes or production data mutation without the relevant explicit approval, backup/rollback evidence and required gates.
- T37 remains DRAFT / NOT APPROVED for shared financial semantics. Payroll privacy approval remains narrow and does not grant permission for other payroll/financial rules.
- After deployment, verify deployment ID, production alias, deployed SHA/version, health/readiness, safe authenticated journeys, runtime errors and rollback evidence. HTTP 200 or Vercel READY alone is not release verification.

## Handoff and status

Every handoff records:
- canonical task + owner, writer, reviewer and exact owned paths;
- repo, branch, PR, exact base/head SHA and changed paths;
- acceptance checklist, dependencies, decision/policy version;
- commands/checks with runner, exact SHA, timestamp, URL and PASS/FAIL/NOT RUN;
- full maintainer review state and provider-enforced reviewer requirement (otherwise N/A);
- merge/deployment approvals separately;
- blockers, safe alternatives and one executable next action.

Use status labels precisely: VERIFIED COMPLETE, PARTIALLY COMPLETE, IN PROGRESS, BLOCKED, NOT STARTED, NOT RUN, UNKNOWN, STALE or CONFLICTED. Only Master may declare VERIFIED COMPLETE after all applicable acceptance/release gates have evidence.

For the full workflow, follow [AGENTS.md](AGENTS.md) and the [production runbook](docs/PRODUCTION_DEPLOYMENT.md).
