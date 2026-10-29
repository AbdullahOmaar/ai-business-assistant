# Operating Model — AI Business Assistant

## Source of truth

1. **GitHub:** code, git history, branches, issues, PRs, reviews, commits, CI, and deployment evidence.
2. **Notion:** project coordination, Master Plan, Agent Registry, task ownership, decisions, dependencies, handoffs, and comments.
3. **Production platform:** actual deployment SHA/version, health checks, and safe end-to-end smoke evidence. A green CI run does not prove production readiness.

## Execution loop

For each assigned task:
1. Read the canonical Notion task, latest status/comments, acceptance criteria, and dependencies.
2. Verify live GitHub state before acting; historical notes are not live evidence.
3. Inspect the relevant implementation, tests, docs, PRs, and CI.
4. Implement the smallest coherent change with appropriate regression tests.
5. Run relevant checks; distinguish application failures from infrastructure/access failures.
6. Review the diff for regressions, unrelated changes, secrets, authorization gaps, and data-integrity risks.
7. Update the same canonical task with evidence, files, branch/SHA/PR, tests, checks not run, blockers, and next action.
8. Continue independent work around genuine blockers.

## Required status labels

- **VERIFIED COMPLETE** — acceptance criteria met and evidence observed.
- **PARTIALLY COMPLETE** — meaningful work exists but one or more criteria remain.
- **NOT RUN** — check/action has not been executed.
- **BLOCKED** — a real access, decision, infrastructure, or approval blocker prevents progress.

Never convert a historical note or a successful source edit into a verified feature claim.

## Release and safety rules

- Do not merge without explicit owner authorization and satisfied required checks/reviews.
- Do not deploy production without explicit authorization and verified release gates.
- Never bypass branch protections, weaken valid failing tests, or delete unique work to make a queue appear clean.
- Preserve user changes and shared history.
- For tenant, identity, invoices, payments, inventory, payroll, or audit data, require server-side authorization, least privilege, transaction safety, idempotency where relevant, append-only auditability, and negative/no-side-effect tests.
- Never place credentials, tokens, production data, or secrets in this package or source control.

## Agent coordination

- One canonical task tracker; do not recreate duplicate task databases.
- Agent/session search and wake-up capabilities must be verified. A comment alone is not proof an agent acknowledged or started work.
- If Notion agent-session access returns an entitlement/access error, record the exact blocker and continue independent work where safe.
- Each handoff must state current evidence, completed work, checks run/not run, blocker, and one next action.
