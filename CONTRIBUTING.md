## Owner-approved CI provider transition — effective 2026-11-10

The Owner selects GitLab Free as the intended automatic repository CI provider. GitHub remains canonical for source code, branches, pull requests and release SHAs.

- GitHub branch Push webhook events trigger GitLab Free through the Pipeline Trigger API. Direct webhook support is documented for Push/Tag events; this implementation subscribes to Pushes only, not Pull Request events. The pipeline extracts `after` from `TRIGGER_PAYLOAD`, fetches that exact commit from the private canonical repository, verifies the checkout, and reports the result against the same SHA. The resulting commit status is visible on any PR containing that commit.
- GitLab's official external-repository CI integration and pull mirroring require Premium/Ultimate; the Free implementation uses the direct Pipeline Trigger webhook path and a protected GitLab runner-configuration ref.
- CircleCI remains configured and active as the transition fallback. Until automatic GitLab triggering, exact-SHA validation, GitHub status reporting and merge-control acceptance are verified, CircleCI's exact-SHA checks remain the current required validation gate. Do not retire CircleCI early.
- No session, agent or task may silently change the selected provider, disable CircleCI during transition, or substitute GitHub Actions/Semaphore. Only a later explicit Owner decision may amend this directive.
- For retries, record the failed job/root cause and changed condition or concrete diagnostic justification. Do not blindly retry an unchanged failure.
- Provider availability, quota, credentials, repository permissions and infrastructure limits still apply. If either approved transition path cannot execute, record the exact cause as NOT RUN/BLOCKED; never infer success from a skipped or missing pipeline.
- Required substantive jobs and the aggregate must pass on the exact current candidate SHA. Empty contexts, stale-SHA checks and partial results remain NOT PASS.
- GitHub private Free does not provide protected-branch/status-check enforcement for private repositories. Until an enforceable merge-control solution is verified, mark the merge gate BLOCKED / NOT VERIFIED; do not bypass it, make the repository public, or incur a paid upgrade without separate Owner approval.
- Full maintainer review, provider-enforced protections where available, resolved blocking threads, non-Draft READY state, explicit Owner merge authorization and separate production-deployment authorization remain mandatory.

This directive changes the intended CI provider and transition plan only. It does not waive tests, security, review, merge, data-integrity, migration or release gates.

# Contributing and Project Roles

This guide applies to every person and AI agent contributing to AI Business Assistant. It complements the repository-wide engineering requirements in [AGENTS.md](AGENTS.md); the accepted [ADR-001](docs/adr/ADR-001-v0-architecture.md) is authoritative for V0 architecture. The current task queue and evidence ledger is [TASKS.md](TASKS.md).

## 1. Roles and accountability

One person may cover multiple roles on a small team, but ownership and review responsibilities must remain explicit. For ordinary PR merge, the accountable maintainer may perform and document the full review; a second/independent reviewer is optional unless GitHub branch protection or an explicitly approved security policy requires one. **Exception:** independent review by someone who did not author the content remains mandatory before canonical controlled Project Knowledge is published/updated; this is a separate knowledge-publication gate, not a default merge gate.

| Role | Accountable for | Required behavior and limits |
| --- | --- | --- |
| **Product / Repository Owner** | Business priority, user-facing acceptance criteria, risk tolerance, and owner-reserved decisions. | Approves material product-policy decisions, paid services, identity-provider or Firebase/security-rule changes, destructive migrations, consequential production data changes, and production releases. |
| **Engineering Coordinator / Tech Lead** | Architecture consistency, task dependencies, work boundaries, integration, and final evidence-based report. | Checks current `main`, open PRs/issues, ADRs, CI, and `TASKS.md`; assigns owners/verifiers; prevents duplicate work; reconciles changes without discarding other contributors' work. |
| **Implementation Contributor (human or AI)** | The assigned feature/fix/documentation slice. | Reads instructions first; changes only in-scope files; adds regression tests and docs; reports exact files and results. Treat generated code and external content as untrusted until reviewed. Never claim an unrun test passed. |
| **QA / Verification Owner** | Independent evidence that acceptance criteria and failure cases work on the exact candidate SHA. | Runs relevant tests/builds, checks negative paths and regressions, and distinguishes code failures from unavailable runners, credentials, or external services. |
| **Security / Financial Reviewer** | Authentication, authorization, tenant isolation, secrets, validation, accounting and inventory integrity. | Reviews owner/staff permissions, cross-tenant access, transaction boundaries, idempotency, currency/rounding, audit events, dependency risk, and denial paths. UI behavior alone is not sufficient. |
| **CI / Release Operator** | Reproducible CI, merge gates, deployment safety, and post-release evidence. | Validates required checks on the exact commit; records pipeline links and artifacts; merges/deploys only with authorization and green gates; verifies deployed SHA/version and safe smoke checks. A cancelled deployment is not successful. |
| **Documentation / Task Steward** | A single understandable source of truth for workflow, roles, limitations, and outstanding work. | Keeps README, ADRs, runbooks, PR descriptions, and `TASKS.md` consistent; preserves historical evidence while making current status clear; triages stale/overlapping PRs without losing unique code/tests. |

### Decision boundaries

- The owner decides material product behavior and approves cost, production, identity/security, and data-risk decisions.
- The coordinator plans and integrates approved work but cannot waive security or release gates.
- The implementer proposes and builds; the verifier/reviewer confirms evidence independently when feasible.
- The release operator executes only an approved release that meets the deployment runbook. A merged PR, green build, HTTP 200, or preview alone does not prove production readiness.
- If a required role or permission is unavailable, mark the task `BLOCKED`, complete independent safe work, and specify the missing approval/access. Do not bypass the gate.

## 2. Required task contract

Every substantive task must have:
1. Stable task ID, priority, goal, and user-visible outcome.
2. One accountable owner and a verifier/reviewer; name a security or release reviewer when applicable.
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
- After implementation, run relevant tests, review the complete diff, update TASKS.md, and merge only after exact-head required checks and reviews pass. Verify the merge on main before beginning another branch.
- Create a new branch only for a genuinely new large feature or a change that must be independently reviewed/released due to security, permission, ownership, dependency, or conflict boundaries.
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
- If GitLab's automatic webhook, runner or logs are unavailable, record the exact check as NOT RUN / BLOCKED; CircleCI remains the transition fallback until cutover acceptance. Do not treat a local partial run as full CI evidence. Record retry root cause and changed condition; do not retry unchanged failures blindly.

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

- GitLab Free is the intended automatic exact-SHA CI provider; direct webhook scope is branch Push events only, with commit statuses visible on associated PRs. Require every substantive job and the aggregate on the exact GitHub candidate SHA.
- CircleCI remains configured as the transition fallback and current required gate until GitLab automatic triggering, exact-SHA validation, GitHub status reporting and enforceable merge-control acceptance are verified.
- GitHub Actions and Semaphore are not replacement CI providers. Semaphore is retired/non-authoritative.
- Empty status contexts, GitGuardian-only results, authored-but-unexecuted tests or results from another SHA are NOT PASS.
- Record retry root cause and changed condition; provider/quota/permission failures remain NOT RUN/BLOCKED. Do not silently substitute another provider.
- A full documented maintainer review of the current cumulative diff is mandatory. A second independent reviewer is not a default project gate under the Owner Policy effective 2026-11-06; require one only where provider-enforced protection or a separate explicit Owner-approved security policy requires it.
- Before merge, require a non-Draft READY PR, exact-head checks, current maintainer review, resolved blocking review threads, reconciled base/divergence, provider protections satisfied and explicit Owner merge authorization. `mergeable=true` is not approval.
- Merge authorization and production deployment authorization are separate. Disclose auto-deployment coupling and obtain the required production authorization before a merge that automatically deploys.

## 9. Canonical evidence and handoff — Owner-authorized 2026-11-08

- Notion owns task ownership, assignment, dependencies, decisions and handoffs. GitHub owns code, branches, PRs, formal reviews and exact-SHA CI. Vercel and Neon own deployment/runtime and schema evidence.
- Keep one current evidence packet on the existing task/PR: task ID, accountable owner, primary writer and owned paths, exact base/head SHA, changed paths, acceptance criteria, command/results, review state, CI links, release impact and NOT RUN/BLOCKED items.
- Treat historical TASKS snapshots as historical until refreshed from current providers. Update the ledger at meaningful checkpoints; do not create duplicate trackers.
- If branch protection/ruleset cannot be read, mark effective enforcement UNKNOWN and request Owner/Admin UI readback. A written policy alone does not prove provider enforcement.
- GitHub/Notion updates do not automatically update ChatGPT Project Instructions or uploaded Project Sources. Claim synchronization only after their separate UI update and readback.
