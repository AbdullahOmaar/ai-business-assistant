# Contributing and Project Roles

This guide applies to every person and AI agent contributing to AI Business Assistant. It complements the repository-wide engineering requirements in [AGENTS.md](AGENTS.md); the accepted [ADR-001](docs/adr/ADR-001-v0-architecture.md) is authoritative for V0 architecture. The current task queue and evidence ledger is [TASKS.md](TASKS.md).

## 1. Roles and accountability

One person may cover multiple roles on a small team, but ownership and review responsibilities must remain explicit. High-risk changes should have an independent reviewer whenever one is available.

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
2. **Choose the right work item.** Reuse an existing branch/PR when its goal and review boundary match. Avoid a branch per tiny change and avoid bundling unrelated features.
3. **Record the contract.** Mark the task `IN_PROGRESS`; state scope, owner, verifier, acceptance criteria, risks, and tests.
4. **Implement end to end.** Include validation, authorization, failure/empty states, persistence/API behavior, tests, and docs where applicable.
5. **Verify and review.** Run relevant tests, type checks/lint, build, migration checks, and security audits. Inspect for regressions, leaked secrets, unrelated edits, and compatibility breaks. Re-run affected checks after fixes.
6. **Open/update the PR.** Include acceptance criteria, role assignments, commands/results, exact SHA, CI URLs, not-run checks, and remaining blockers. Keep it Draft until required gates are met.
7. **Integrate safely.** Reconcile with current `main`; preserve mainline changes and unique work from other PRs. Never bypass repository protection or merge stale/conflicting branches blindly.
8. **Close the loop.** Update `TASKS.md` with exact evidence, status, blockers, and next action. The coordinator independently reconciles claims with source, GitHub, CI, and deployment state.

## 4. Additional gates for sensitive work

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
- If a runner/quota is unavailable, record the evidence and use an already-authorized alternative; do not repeatedly retry exhausted CI capacity or bypass the gate.

## 5. Required handoff report

Every substantive handoff must state:
- **Status:** VERIFIED / PARTIALLY COMPLETE / NOT RUN / BLOCKED.
- **Changed files and commit/PR SHA.**
- **Checks actually run and results**, with pipeline links.
- **Checks not run and the concrete reason.**
- **Security/data/release review performed and remaining risks.**
- **Next exact action and accountable role.**
