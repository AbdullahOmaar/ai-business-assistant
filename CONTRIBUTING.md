## Owner-approved CI provider change — effective 2026-11-10

The Owner explicitly supersedes the earlier CircleCI-only provider directive and the 2026-11-10 GitLab Free selection. GitHub remains canonical for source code, branches, pull requests and exact release SHAs. GitHub Actions is now the primary test/build/security CI provider.

- Use standard GitHub-hosted `ubuntu-latest` runners. The repository is Public; standard hosted runner usage for public repositories is free. No self-hosted runner, paid larger runner, or separate server is required.
- `.github/workflows/ci.yml` is the single authoritative validation workflow. It runs backend pytest + disposable PostgreSQL migration/schema checks + knowledge validator, frontend unit tests, production build, frontend dependency audit, Playwright browser smoke, backend container/backup-restore safety checks, and a fail-closed `all-checks-passed` aggregate.
- Every substantive job verifies that its checkout equals the workflow event SHA. Workflow permissions are read-only; no production secrets are needed or exposed to fork PR code. PostgreSQL is disposable and local to the CI job; no production database is accessed.
- Pin third-party actions to verified full commit SHAs with release-version comments; inspect upstream release notes before changing pins.
- GitHub Actions is the Owner-selected primary CI provider. The full six-job suite and aggregate have passed on an exact candidate SHA (see the dated checkpoint in `TASKS.md`). The active default-branch ruleset strictly requires GitHub Actions check `all-checks-passed` from the GitHub Actions App (integration ID 15368). No separate PR-approval count is currently enforced. The CircleCI GitHub webhook is disabled and no CircleCI project schedules exist.
- GitLab CI is inactive and no longer an approved target. Do not create GitLab runners, triggers, webhooks or CI variables for this migration.
- Main is marked protected, but the classic branch-protection endpoint returns 403 to this integration. Ruleset readback shows the Copilot code-review rule active and the former `main-protection-and-gitlab-sync` ruleset disabled. Required status checks and PR/approval enforcement remain UNKNOWN until Owner/Admin readback; do not treat merge control as enforced.
- No paid upgrade, production deployment, production DB write/migration, merge, CI retirement, or gate bypass is authorized by this provider decision. Those actions retain their separate approval and release gates.

This directive changes the CI provider and validation implementation only. It does not waive tests, security, maintainer review, merge, data-integrity, migration or production-release gates.

# Contributing and Project Roles

This guide applies to every person and AI agent contributing to AI Business Assistant. It complements the repository-wide engineering requirements in [AGENTS.md](AGENTS.md); the accepted [ADR-001](docs/adr/ADR-001-v0-architecture.md) is authoritative for V0 architecture. The current task queue and evidence ledger is [TASKS.md](TASKS.md).

## 1. Roles and accountability

One person may cover multiple roles on a small team, but ownership and review responsibilities must remain explicit. No separate independent reviewer is required by project policy for any change, including routine PRs, Security/Architecture and canonical controlled Project Knowledge publication/update. The accountable maintainer/Project Master performs and records full self-review on the exact candidate SHA. Any formal approval actually enforced by GitHub branch protection remains mandatory and must never be bypassed.

| Role | Accountable for | Required behavior and limits |
| --- | --- | --- |
| **Product / Repository Owner** | Business priority, user-facing acceptance criteria, risk tolerance, and owner-reserved decisions. | Approves material product-policy decisions, paid services, identity-provider or Firebase/security-rule changes, destructive migrations, consequential production data changes, and production releases. |
| **Engineering Coordinator / Tech Lead** | Architecture consistency, task dependencies, work boundaries, integration, and final evidence-based report. | Checks current `main`, open PRs/issues, ADRs, CI, and `TASKS.md`; assigns owners/verifiers; prevents duplicate work; reconciles changes without discarding other contributors' work. |
| **Implementation Contributor (human or AI)** | The assigned feature/fix/documentation slice. | Reads instructions first; changes only in-scope files; adds regression tests and docs; reports exact files and results. Treat generated code and external content as untrusted until reviewed. Never claim an unrun test passed. |
| **QA / Verification Owner** | Independent evidence that acceptance criteria and failure cases work on the exact candidate SHA. | Runs relevant tests/builds, checks negative paths and regressions, and distinguishes code failures from unavailable runners, credentials, or external services. |
| **Security / Financial Verification** | Authentication, authorization, tenant isolation, secrets, validation, accounting and inventory integrity. | The accountable maintainer's self-review and test evidence cover owner/staff permissions, cross-tenant access, transaction boundaries, idempotency, currency/rounding, audit events, dependency risk, and denial paths. UI behavior alone is not sufficient. |
| **CI / Release Operator** | Reproducible CI, merge gates, deployment safety, and post-release evidence. | Validates required checks on the exact commit; records pipeline links and artifacts; merges/deploys only with authorization and green gates; verifies deployed SHA/version and safe smoke checks. A cancelled deployment is not successful. |
| **Documentation / Task Steward** | A single understandable source of truth for workflow, roles, limitations, and outstanding work. | Keeps README, ADRs, runbooks, PR descriptions, and `TASKS.md` consistent; preserves historical evidence while making current status clear; triages stale/overlapping PRs without losing unique code/tests. |

### Decision boundaries

- The owner decides material product behavior and approves cost, production, identity/security, and data-risk decisions.
- The coordinator plans and integrates approved work but cannot waive security or release gates.
- The implementer proposes and builds; the accountable maintainer/Project Master verifies the evidence and records findings. No separate independent reviewer is required by project policy for Security/Architecture or controlled-knowledge changes. The accountable maintainer/Project Master performs and records full self-review on the exact candidate SHA; formal GitHub branch-protection approvals, if enforced, remain mandatory and must never be bypassed.
- The release operator executes only an approved release that meets the deployment runbook. A merged PR, green build, HTTP 200, or preview alone does not prove production readiness.
- If a required role or permission is unavailable, mark the task `BLOCKED`, complete independent safe work, and specify the missing approval/access. Do not bypass the gate.

## 2. Required task contract

Every substantive task must have:
1. Stable task ID, priority, goal, and user-visible outcome.
2. One accountable owner. Name a QA/test evidence owner when useful; a separate reviewer assignment is not required by project policy.
3. Scope, explicit exclusions, base SHA, dependencies, assumptions, and risks.
4. Measurable acceptance criteria and required tests/checks.
5. Allowed tools/permissions, expected artifacts, and handoff conditions.
6. Observed results, commit/PR/pipeline links, unresolved blockers, and next action.

Keep task state in `TASKS.md` unless another tracker is explicitly authoritative. Link existing issues/PRs instead of duplicating records. Use only these current statuses:

- **TODO** — not started or waiting in the queue.
- **IN_PROGRESS** — implementation or verification is underway.
- **BLOCKED** — a concrete external dependency, permission, approval, or infrastructure failure prevents the next gate.
- **VERIFIED** — acceptance criteria and applicable checks passed with inspectable evidence on the exact candidate SHA.

If a check was not run, say **NOT RUN**. If infrastructure prevented execution, say **BLOCKED**, not “passed.”

## 3. Standard contribution workflow

1. **Inspect before editing.** Read `AGENTS.md`, this guide, relevant code/tests, ADRs, `TASKS.md`, current `main`, open PRs/issues, and the latest applicable CI state.
2. **Enforce one-branch discipline.** Each contributor/agent may have only one active work branch at a time. Inspect existing branches/PRs first and reuse the matching active branch. Batch related small fixes, tests, and docs on that branch; verify and merge it before starting another. Create a new branch only for a genuinely new, substantial feature or an independently reviewable/security-sensitive change boundary. Do not create a branch merely for a new chat, agent, commit, or tiny task. Never bypass required PR checks or protections.
3. **Record the contract.** Mark the task `IN_PROGRESS`; state scope, owner, verifier, acceptance criteria, risks, and tests.
4. **Implement end to end.** Include validation, authorization, failure/empty states, persistence/API behavior, tests, and docs where applicable.
5. **Verify and review.** Run relevant tests, type checks/lint, build, migration checks, and security audits. Inspect for regressions, leaked secrets, unrelated edits, and compatibility breaks. Re-run affected checks after fixes.
6. **Open/update the PR.** Include acceptance criteria, role assignments, commands/results, exact SHA, CI URLs, not-run checks, and remaining blockers. Keep it Draft until required gates are met.
7. **Integrate safely.** Reconcile with current `main`; preserve mainline changes and unique work from other PRs. Never bypass repository protection or merge stale/conflicting branches blindly.
8. **Close the loop.** Update `TASKS.md` with exact evidence, status, blockers, and next action. The coordinator independently reconciles claims with source, GitHub, CI, and deployment state.

## 4. Branch and PR discipline (mandatory)

- Maintain **one active branch per contributor/agent**. Check open PRs and branches before creating anything; reuse the matching in-progress branch whenever the scope is coherent.
- Do not create a branch for each issue subtask, commit, small bug fix, test, refactor, or documentation change. Group related work into one focused branch/PR.
- After implementation, run relevant tests, complete and record the accountable maintainer's full diff self-review, update TASKS.md, and merge only after exact-head required checks and any formal GitHub branch-protection approval actually enforced pass. Verify the merge on main before beginning another branch.
- Create a new branch only for a genuinely new large feature or an independently releasable change with a distinct security, permission, ownership, dependency, or conflict boundary.
- Do not combine unrelated features to reduce branch count. If work becomes materially independent, finish the current PR safely first, then create the new branch and document the reason.
- This policy never permits direct pushes to protected main, bypassing checks/reviews, or deleting a branch that may contain unique work.

## 5. Additional gates for sensitive work

### Authentication and tenant isolation
- Derive the acting identity from the trusted verification boundary, not user-controlled IDs or headers.
- Enforce business/workspace membership and role checks on the server for every relevant read and write.
- Include denial tests for unauthenticated users, unauthorized roles, cross-business records, mismatched references, and malformed input.

### Money, payments, invoices, and inventory
- Use decimal types and explicit rounding/currency rules. Never silently mix currencies.
- Treat server-calculated prices, balances, roles, tenant IDs, and payment states as authoritative.
- Test retries/idempotency, transaction rollback, over-allocation, concurrent stock/payment operations, lifecycle transitions, and audit history where relevant.
- Never repair accounting state by directly overwriting derived balances or mutating production records.

### Secrets, cost, and production
- Never put secrets, tokens, real customer data, or production financial records in Git, chat, logs, or artifacts.
- Use least privilege and disposable test data. Do not change Firebase/Firestore rules, provision paid services, run destructive migrations, or mutate production data without required explicit approval.
- Production release follows [the deployment runbook](docs/PRODUCTION_DEPLOYMENT.md): exact release SHA, passing required gates, release markers, verified deployment/version, health/readiness, and safe end-to-end smoke tests.
- If GitHub-hosted runner allocation or logs are unavailable, record the exact check as NOT RUN / BLOCKED. Do not silently substitute another CI provider or treat a local partial run as full CI evidence. Record retry root cause and changed condition; do not retry unchanged failures blindly.

## 6. Required handoff report

Every substantive handoff must state:
- **Status:** VERIFIED / PARTIALLY COMPLETE / NOT RUN / BLOCKED.
- **Changed files and commit/PR SHA.**
- **Checks actually run and results**, with pipeline links.
- **Checks not run and the concrete reason.**
- **Security/data/release review performed and remaining risks.**
- **Next exact action and accountable role.**

## 7. Integration, review budget and shared-file ownership — Owner-authorized 2026-11-08

- Use a default review-planning target of **15 changed paths OR 800 non-generated changed lines or fewer**. These are planning thresholds, not hard caps.
- If either threshold is exceeded, either split at a genuinely independent outcome/security/release boundary or attach a staged-review plan before requesting review. The plan names why safe splitting is not possible, path/behavior batches, dependencies and tests/evidence per batch.
- Do not create micro-PRs, arbitrary commit-per-file PRs or cherry-pick merely to hit a number. Explain generated and lockfile changes, and retain the full cumulative diff.
- Review at meaningful milestones instead of accumulating a large unreviewed delta. Any new commit changes the exact head and invalidates review/check evidence tied to the old SHA.
- Every work package names one primary writer and exact owned paths. A shared/coordination-sensitive path has only one active writer at a time. Examples: `app.component.ts`, `TASKS.md`, global design tokens, shared API contracts, authorization boundaries and DB/schema files.
- Manual single-writer claims are coordination records, not locks or atomic leases. On overlap, stop only conflicting writes; independent feature-local work may continue.
- One active writing branch per contributor. A separate branch is allowed only for a genuinely independent outcome or authorization/security/release boundary; document the reason and freeze writes on the contributor's previous branch during that independent work.

## 8. Exact-SHA CI, reviewer and merge rules — Owner-authorized 2026-11-08

- GitHub Actions is the primary exact-SHA CI provider. Require the six substantive jobs and `all-checks-passed` aggregate on the exact workflow SHA.
- GitHub Actions is the sole active CI provider. The active default-branch ruleset requires its `all-checks-passed` aggregate on the exact SHA.
- GitLab CI and Semaphore are not approved CI providers. Semaphore is retired/non-authoritative.
- Empty status contexts, GitGuardian-only results, authored-but-unexecuted tests or results from another SHA are NOT PASS.
- Record retry root cause and changed condition; provider/quota/permission failures remain NOT RUN/BLOCKED. Do not silently substitute another provider.
- A full documented maintainer/Project Master self-review of the current cumulative diff on the exact candidate SHA is mandatory for every change. No separate independent reviewer is required by project policy, including for routine PRs, Security/Architecture and controlled-knowledge publication/update. Any formal GitHub branch-protection approval actually enforced remains mandatory and must never be bypassed.
- Before merge, require a non-Draft READY PR, exact-head checks, current maintainer review, resolved blocking review threads, reconciled base/divergence, provider protections satisfied and explicit Owner merge authorization. `mergeable=true` is not approval.
- Merge authorization and production deployment authorization are separate. Disclose auto-deployment coupling and obtain the required production authorization before a merge that automatically deploys.

## 9. Canonical evidence and handoff — Owner-authorized 2026-11-08

- Notion owns task ownership, assignment, dependencies, decisions and handoffs. GitHub owns code, branches, PRs, formal reviews and exact-SHA CI. Vercel and Neon own deployment/runtime and schema evidence.
- Keep one current evidence packet on the existing task/PR: task ID, accountable owner, primary writer and owned paths, exact base/head SHA, changed paths, acceptance criteria, command/results, review state, CI links, release impact and NOT RUN/BLOCKED items.
- Treat historical TASKS snapshots as historical until refreshed from current providers. Update the ledger at meaningful checkpoints; do not create duplicate trackers.
- If branch protection/ruleset cannot be read, mark effective enforcement UNKNOWN and request Owner/Admin UI readback. A written policy alone does not prove provider enforcement.
- GitHub/Notion updates do not automatically update ChatGPT Project Instructions or uploaded Project Sources. Claim synchronization only after their separate UI update and readback.
