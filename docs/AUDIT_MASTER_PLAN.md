# AI Business Assistant — Master Audit & Improvement Plan

- **Plan ID:** AAP-2026-10-28
- **Status:** PARTIALLY COMPLETE — evidence-based audit baseline recorded; full visual/live and operational verification remain open.
- **Scope:** Business/product, architecture, security/privacy, database integrity, UI/UX/accessibility, QA/automation, CI/CD, operations, and production readiness.
- **Mode for this audit:** Read-only inspection and planning. No application code fixes, merges, or deployments are authorized by this plan.
- **Repository:** https://github.com/AbdullahOmaar/ai-business-assistant
- **Primary branch:** `main`
- **Baseline observed:** `8772438405764734bda6f475e31bd50c22341c86` (GitHub main ref at plan publication; always re-check current main before acting).
- **Evidence rule:** this file is a dated checkpoint, not a substitute for rechecking current source, issues, PRs, CI, and deployments at the start of every new session.

## 1. Executive summary

The project has an existing Angular + FastAPI + PostgreSQL architecture, repository-local engineering rules, a substantial task ledger, automated backend/frontend/E2E tests, and CircleCI quality gates. Prefer targeted fixes and evidence-driven refactoring; do not propose a wholesale rewrite without new evidence.

Current high-value follow-ups:
1. Verify and close the suspected STAFF authorization gap around product creation with a positive opening stock quantity.
2. Obtain evidence of a successful isolated backup/restore drill.
3. Verify the exact deployed SHA/version and run safe authenticated smoke tests in an approved environment.
4. Reconcile duplicate/stale PRs and issues against current main without losing unique work.
5. Complete visual UX review and role/tenant test matrix.
6. Reconcile historical accounting-rounding issues against current code and tests.

**Important:** green CI and Vercel READY records do not prove every production user journey or disaster-recovery procedure works. No production-readiness declaration should be made until release gates have evidence.

## 2. Verified baseline (snapshot)

- GitHub repository: `AbdullahOmaar/ai-business-assistant`.
- Default branch: `main`.
- Main SHA observed when publishing this checkpoint: `8772438405764734bda6f475e31bd50c22341c86`.
- Stack confirmed in repository documentation/manifests: Angular 20 / TypeScript, Python 3.12 / FastAPI, SQLAlchemy / Alembic, PostgreSQL, Firebase Authentication.
- Test files observed in repository tree: 22 backend test files, 13 frontend unit/spec files, and 2 Playwright E2E specs. Re-count against the current tree before relying on these counts.
- CircleCI configuration exists at `.circleci/config.yml`; the audit observed four successful CircleCI contexts on the previously inspected main SHA: backend-container, backend-accounting, frontend-quality, frontend-browser-smoke. These results are SHA-specific and must be rechecked against the candidate SHA.
- Vercel production deployment records observed as READY and reporting the previously inspected main SHA. Recheck deployment identity, alias, version, health/readiness, and smoke behavior at release time.
- `AGENTS.md` and `TASKS.md` are the repository-local engineering rules and handoff ledger. Read them before acting.
- GitHub branch-protection inspection returned HTTP 403 through the available integration; protection settings are **not verified**.
- Local working-tree state cannot be inferred from GitHub remote APIs and was **not verified**.
- Live authenticated production E2E, interactive visual UI review, and an actual isolated restore drill were **not performed** in this audit.

## 3. Findings register

Severity and priority are distinct. Severity describes potential impact; priority describes recommended order and can change after reproduction and business-owner decisions.

| ID | Finding / risk | Severity | Initial priority | Evidence / confidence | Next validation |
|---|---|---:|---:|---|---|
| SEC-01 | Positive `opening_quantity` on product creation bypassed the standalone OWNER-only stock-movement guard for STAFF. A candidate service-level guard and API regression test are now committed on the audit branch. | High | P1 | Confirmed by current-main source inspection at `52ea765da234c1a7421febd232d40676cff42587`: `create_product` and `record_stock_movement` enforced membership only, while the direct stock-movement route required OWNER. Fix candidate: `docs/audit-master-plan-2026-10-28`, pending exact-head CI. | Verify STAFF denial/no DB side effects and OWNER positive path on the exact candidate SHA; only then close this slice. |
| OPS-01 | No observed evidence that a production backup has been restored successfully into an isolated target. | High operational risk | P1 release gate | `docs/BACKUP_RESTORE_DRILL.md` describes the drill; successful execution evidence was not located in this audit. | Run an approved isolated restore; verify schema revision, relationships, representative counts/invariants, and record results. Never restore over production. |
| OPS-02 | Production deployment record parity was observed, but full authenticated behavior was not verified. | High release risk | P1 release gate | Vercel deployment records reported READY and matching the inspected main SHA; authenticated browser/API journey not run in this audit. | Verify deployed SHA/version, health/readiness, login, tenant isolation, and safe core workflow smoke tests. |
| SEC-02 | Authorization matrix should be checked route-by-route across roles and tenants. | Medium pending review | P1/P2 | Existing `backend/tests/test_api.py` and `backend/tests/test_business_tenant_boundaries.py` cover multiple sensitive paths; opening-quantity edge is not explicitly named in the reviewed tests. | Build route × role × tenant test matrix; distinguish existing coverage from missing coverage. |
| PR-01 | Potential duplicate work around API/workflow PRs. | Medium process risk | P2 | PR #204 and #205 had similar scope/title; their checks differed. | Compare complete diffs against current main; retain unique changes; do not merge or close based on titles alone. |
| PR-02 | Open PR list includes old/draft work that may be stale or overlapping. | Medium process risk | P2 | 19 open PRs were returned in the snapshot, including 15 Draft. Counts can change. | Re-query PRs and exact heads; inspect ahead/behind, merge base, changed files, checks, reviews, and unique commits. |
| FIN-01 | Historical rounding issues may be stale relative to current code. | Low cleanup unless regression found | P2/P3 | `backend/app/domain_rules.py` uses `ROUND_HALF_UP`; service code uses money rounding; tests include half-cent boundaries. Issues #109/#111 appear overlapping. | Reconcile current behavior and tests; update/close issues only after evidence and avoid rewriting historical financial data. |
| PROD-01 | Scheduled recurring invoices/notifications may be configuration-only until workers are deployed and observed. | Medium product/reliability risk | P2 | README/product docs describe worker dependency. | Confirm actual deployed workers, scheduling, retries, monitoring, and UI wording; otherwise clearly label as configured/not yet executing. |
| UX-01 | Visual interaction/accessibility review remains incomplete. | Unknown until inspected | P2 | Source-level review only; live screen inspection not completed here. | Inspect core journeys at narrow mobile widths and desktop, Arabic RTL and English LTR, keyboard/focus, contrast, and loading/error/empty states. |
| DOC-01 | `TASKS.md` contains extensive historical checkpoints, so current status can be difficult to identify quickly. | Low process risk | P2/P3 | Large task ledger with many dated sections. | Preserve historical evidence; add concise current checkpoint sections and link this plan rather than rewriting history. |

## 4. Business and product review

Validate the following workflows against documented behavior and existing tests before inventing requirements:
- Workspace creation, membership, role changes, and tenant isolation.
- Customers, suppliers, products, stock movements, purchase orders, and sales returns.
- Invoice draft → issue → payment allocation → void/return/correction lifecycle.
- Currency separation, rounding, totals, tax/discount calculations, and idempotency.
- Imports/exports, recurring schedules, notifications, and external integrations.
- AI-generated recommendations/actions and any human-approval boundaries.

For each gap, record: user/process affected, reproducible scenario, business impact, source evidence, alternatives, decision owner if a business rule is unclear, acceptance criteria, and regression tests. Do not assume tax law, FX conversion, or advanced accounting requirements without an explicit product decision.

## 5. Architecture and data integrity review

- Map UI → API → service/domain rules → ORM/database for core business workflows.
- Review schema constraints, foreign keys, indexes, tenant ownership, migrations, and rollback compatibility.
- Verify that server-side calculations do not trust client-supplied totals, prices, roles, or tenant identifiers.
- Check transaction boundaries, concurrency, idempotency, duplicate submissions, retries, timeouts, and external-service failure paths.
- Prefer targeted changes. Consider splitting large API modules only when dependency analysis demonstrates a maintainability or testability benefit.
- Continue running PostgreSQL-backed integration/migration checks in the existing CircleCI configuration; do not add a new CI system or paid service without authorization.

## 6. Security and privacy review

Use OWASP Top 10 / ASVS as appropriate, confirming the exact reference version before citing it in a formal finding. Review:
- Authentication and token/session verification.
- Server-side authorization, role escalation, IDOR/BOLA, and cross-tenant access.
- Validation, injection/XSS/CSRF/CORS/headers as applicable to actual routes.
- File import/export validation and path handling.
- Secrets and runtime configuration, sensitive logs, rate limiting, abuse controls.
- Webhook verification/replay protections if such routes exist.
- Financial/admin audit trails, database permissions, backup access, and recovery.
- Dependency/supply-chain scan evidence on the exact candidate SHA.

No production exploitation, credential disclosure, unauthorized role changes, or destructive tests. Active testing requires an authorized scope and suitable environment.

## 7. UI/UX and accessibility plan

Inspect every core journey, not only the landing page:
- Sign-in/session-expiry/recovery and workspace selection.
- Dashboard, customers, products/stock, invoices, payments, expenses, reports, membership/admin.
- Loading, empty, error, success, offline, duplicate-submit, and expired-session states.
- Responsive mobile layouts, overflow, touch targets, keyboard navigation, focus management, screen-reader semantics, contrast, RTL Arabic and LTR English.
- Confirm labels communicate whether a scheduled operation is merely configured or actually running.
- Use Product Design/Figma only when connected and permitted; record screenshots and reproducible steps. Do not claim visual interactions were tested without actually testing them.

## 8. QA and automation strategy

Maintain a traceability matrix:
`Business requirement → UI/API/service → authorization/tenant rule → existing test → missing test → acceptance criteria`.

Prioritize negative and regression cases:
- Anonymous/invalid token; non-member; wrong role; cross-tenant IDs.
- Invalid and boundary values; duplicate and concurrent requests.
- Payment replay/idempotency; currency mismatch; rounding and return limits.
- External service timeout/failure; network interruption; retries.
- Migration failure/rollback and restored-database invariants.
- Mobile/RTL keyboard and screen-reader scenarios.
- Build, type/lint, dependency/security scans, E2E/browser smoke, and container build.

Coverage percentage alone is not proof of behavior. Do not delete or hide failing tests. Record exact SHA, command/workflow URL, result, and any unrun check.

## 9. Initial prioritized backlog

All tasks below are proposed backlog items; none is marked implemented or verified by this planning checkpoint.

| Task ID | Title | Priority | Dependencies | Acceptance criteria | Status |
|---|---|---:|---|---|---|
| AUD-01 | Close opening-stock authorization gap | P1 | Existing standalone movement route is OWNER-only | Service guard and STAFF denial/OWNER success regression test committed to candidate; exact-head CircleCI must pass and no unintended DB side effects must be proved. | IMPLEMENTED ON CANDIDATE; validation pending |
| AUD-02 | Execute isolated backup/restore drill | P1 | Approved isolated DB target and secure access | Restore succeeds; revision/invariants verified; duration and failures recorded; no production mutation. | BLOCKED on target/access |
| AUD-03 | Verify deployed SHA and authenticated release smoke | P1 | Browser/API access and approved test identity | Version/SHA, health/readiness, login, tenant boundary, and safe core workflow evidence recorded. | BLOCKED on live test capability |
| AUD-04 | Complete route × role × tenant authorization matrix | P1/P2 | Route inventory | Every sensitive route has allow/deny and cross-tenant tests or a documented justified exception. | BACKLOG |
| AUD-05 | Reconcile duplicate/stale PRs against current main | P2 | Current PR metadata and exact diffs | Unique commits preserved; one canonical PR per coherent change; checks/reviews recorded before closure/merge decisions. | BACKLOG |
| AUD-06 | Reconcile accounting-rounding issues #109/#111 | P2/P3 | Re-run relevant current tests | Issue status matches current code and evidence; no unsupported claim or historical data mutation. | BACKLOG |
| AUD-07 | Perform visual UX/accessibility review | P2 | Interactive browser/screenshots | Core screens audited desktop/mobile, RTL/LTR, keyboard and error states with reproducible evidence. | BLOCKED on visual inspection |
| AUD-08 | Verify recurring-work execution and UI claims | P2 | Runtime worker/deployment evidence | UI/docs distinguish configured schedules from executed jobs; retries and failures observable. | BACKLOG |
| AUD-09 | Add concise active audit checkpoint to task ledger | P2/P3 | This plan | Current next action/status is easy to find; historical TASKS entries preserved. | IN_PROGRESS (documentation only) |

For each implementation task, create or reconcile an existing GitHub Issue before opening a duplicate. Include root cause or hypothesis, expected files, alternatives, risk, estimate, acceptance criteria, tests, rollback, reviewer, and definition of done.

## 10. Production readiness gates

Do not declare production-ready until applicable evidence is attached for:
- Exact candidate SHA and required reviews/branch protections.
- CI tests/build/security/dependency checks on that exact SHA.
- Database migration compatibility and recovery strategy.
- Verified backup/restore and recovery procedure.
- Server-side authorization and cross-tenant regression tests.
- Deployment alias and actual deployed version/SHA.
- Health/readiness and safe authenticated smoke tests.
- Error monitoring/logging/alerting and rollback readiness.
- Mobile/RTL core user journey and accessibility checks.
- Explicit release authorization; no production deployment is authorized by this planning document.

## 11. Open questions and limitations

- Branch-protection API returned HTTP 403 through the available integration; inspect with sufficient read permission.
- Local Git worktree state is not available from remote GitHub APIs; verify in a local checkout before editing.
- No actual isolated restore drill or authenticated production E2E was run for this audit.
- No complete interactive visual UX audit was performed.
- Re-check all SHA, PR/Issue counts, CI, and deployment status at the start of the next session; this is a snapshot, not live state.
- Clarify business rules only where evidence is insufficient; do not block independent audit items.

## 12. Session handoff protocol (mandatory)

At the start of every new ChatGPT/agent session:
1. Open this file: [Master Audit Plan](./AUDIT_MASTER_PLAN.md).
2. Read `AGENTS.md` and the newest relevant checkpoint in `TASKS.md`.
3. Re-query current `main` SHA, working tree if local, open Issues/PRs, exact-head CI checks, and deployment state.
4. Reconcile stale plan entries with live evidence; never assume snapshot values remain current.
5. Continue from the highest-priority unblocked task, honoring the current authorization scope.
6. Before implementation, confirm whether the user has approved moving from audit/planning to implementation. The current audit authorization does not permit application fixes, merges, or deployments.
7. Update `TASKS.md` with evidence, tests actually run, blockers, changed files/commit/PR, and one next action.
8. Keep this plan as the stable index; update its findings/backlog when evidence or decisions change.

### Copy/paste prompt for a new chat

> Continue AI Business Assistant from the repository's source of truth. First read `AGENTS.md`, `TASKS.md`, and `docs/AUDIT_MASTER_PLAN.md`. Re-check current main SHA, open PRs/Issues, exact-head CircleCI status, and deployment state; reconcile stale notes before acting. Resume the highest-priority unblocked task with evidence-first engineering, security and tenant isolation checks, tests, and task-ledger updates. Do not claim unrun checks passed. Do not merge or deploy without authorization and release gates. The audit/planning phase itself is read-only until the user explicitly authorizes implementation.

## 13. Status definitions

- **VERIFIED:** acceptance criteria and required checks have observable evidence on the relevant SHA/environment.
- **PARTIALLY COMPLETE:** some evidence exists, but required acceptance or scope remains unverified.
- **NOT RUN:** check/action has not been executed.
- **BLOCKED:** a specific missing permission, resource, decision, or infrastructure issue prevents the check.
- **BACKLOG / READY:** proposed work not started; READY means scope and acceptance criteria are sufficiently clear to begin once implementation is authorized.


## Execution checkpoint — 2026-10-28

### SEC-01 — source finding reproduced and candidate fixed

- Baseline reviewed: `main` SHA `52ea765da234c1a7421febd232d40676cff42587`.
- The gap is no longer only hypothetical: `create_product` called membership-only authorization, then created an opening `StockMovement` when `opening_quantity > 0`; the separate stock-movement API already enforced OWNER-only access. This allowed a STAFF member with ordinary membership to reach an inventory-posting path indirectly.
- The candidate adds a service-level OWNER check for positive opening quantities before any product, audit, or stock row is created. Regression coverage includes STAFF rejection with no side effects and OWNER success; creating a product with zero opening stock remains unchanged.
- Status: **IMPLEMENTED ON CANDIDATE; NOT YET VERIFIED** until CircleCI passes on the final candidate SHA. Local tests were NOT RUN because this execution environment does not contain a checkout of the repository.
- Broader role behavior remains in scope for audit, not speculative modification: OWNER/STAFF permissions for general CRUD, expenses, supplier workflows, and reporting need a documented business matrix before code changes. The route inventory records those unresolved decisions.

### Additional finding for follow-up

Source review also found repeated GET route handler declarations in `backend/app/extended_api.py` for recurring-invoice listing, operational health, and tax summary. No behavior cleanup is included in SEC-01; create a separate scoped follow-up only after comparing every duplicate body and adding route-table coverage.


## Latest execution checkpoint — 2026-10-28

- Latest observed `main` at reconciliation: `cacc889679a7994dd2e54a51c58c1df827963580` (PR #218 task-ledger update). The earlier baseline above is historical; always re-check current refs.
- The security candidate fixes the positive-opening-stock authorization gap by requiring OWNER before any product, audit, or stock row is written. Regression coverage targets STAFF denial/no side effects and OWNER success.
- A malformed multiline import in the regression test was found and corrected; it is not enough to establish the full CI failure's root cause. GitHub Actions failure logs/steps were unavailable through the connected API, and the current security branch has no CircleCI contexts yet.
- Current main CircleCI snapshot: backend-accounting, frontend-quality, and browser-smoke pending; Vercel web/API fail with `build-rate-limit`. Production parity/authenticated smoke and backup restore remain NOT RUN.
- Status: **IMPLEMENTED ON CANDIDATE, NOT VERIFIED**. Keep PR #212 Draft until exact-head CircleCI and focused/full backend tests pass. No merge or deployment performed.
