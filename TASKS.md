# Project Task Ledger

> Initial handoff ledger created 2026-10-26. Statuses below reflect only evidence recorded in this repository and linked services; they are not a claim that all release checks have passed.

## Rules
- Keep one canonical entry per task; link existing GitHub Issues/PRs instead of duplicating them.
- Use statuses: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `NEEDS_VERIFICATION`.
- A task is `DONE` only with implementation evidence and applicable passing checks.
- Record exact commands/results and commit or workflow links where available.
- At each run, choose the highest-priority actionable task, execute it, verify it, update this ledger, and continue.

## Initial tasks to reconcile

### P0 — Re-verify current CI and release readiness
- Status: `BLOCKED`
- Source: README.md, docs/PRODUCTION_DEPLOYMENT.md, GitHub Actions, Vercel deployments.
- Evidence as of 2026-10-27:
  - Current main SHA observed: `1b58df8a6695e02b845bc84a9ee7094286f32e83`.
  - GitHub Actions jobs fail before any step with `runner_id=0`, blank runner name, and no steps/logs. Minimal diagnostic evidence and escalation notes are in Draft PR [#164](https://github.com/AbdullahOmaar/ai-business-assistant/pull/164); it is not merged.
  - The connected Vercel frontend deployment for main SHA `1b58df8a6695e02b845bc84a9ee7094286f32e83` reached READY and completed Angular compilation, but its recorded build logs did not run `npm test`.
  - The latest main-branch API Vercel deployment was intentionally canceled by its configured Ignored Build Step because the commit message lacked `[release-api]`; that is not a backend test result.
- Acceptance: full backend/frontend test suite, container build, dependency/security audit, authorization and production smoke checks against exact final SHA.
- Next action: retain the Vercel frontend test gate below as a working partial fallback, but keep overall release readiness blocked until all independent gates have evidence. Continue GitHub Support escalation for the Actions runner failure.

### P0 — Verify production configuration and authenticated smoke tests
- Status: `NEEDS_VERIFICATION`
- Source: README.md and docs/PRODUCTION_DEPLOYMENT.md
- Acceptance: verify configured Firebase web app, backend Firebase Admin credentials, PostgreSQL connectivity, exact CORS origins, frontend runtime config, sign-in, workspace isolation, invoice/payment/return flows, deployed frontend/API versions, and health/readiness endpoints without exposing secrets or mutating production data unsafely.
- Safety: follow the production runbook; do not perform production migrations or destructive operations without explicit approval.

### P1 — Verify invoice and payment edge cases and authorization
- Status: `NEEDS_VERIFICATION`
- Source: docs/PRODUCTION_DEPLOYMENT.md release gates and existing regression-test requirements
- Acceptance: verify role-specific positive/negative tests, cross-tenant isolation, invoice state transitions, payment allocations, discounts/returns rounding, and regression coverage against current code.
- Next action: inspect existing tests and open issues/PRs; add only missing coverage or fixes.

### P1 — Verify mobile/PWA production behavior
- Status: `NEEDS_VERIFICATION`
- Source: README.md and docs/MOBILE_RELEASE_CHECKLIST.md
- Acceptance: confirm the exact deployed commit, real sign-in/navigation/install/update behavior, viewport/keyboard behavior, and installed-PWA cache/version behavior on a supported browser/device when access is available.
- Blocker policy: if a physical device or deployment access is unavailable, document the unverified cases and continue independent work.

### P1 — Use existing Vercel Git integration as a frontend build/test fallback
- Status: `DONE` (frontend fallback verified; does not close the full-CI blocker)
- Source: `frontend/package.json`, Vercel project `ai-business-assistant-web`, GitHub Actions runner-allocation incident.
- Change: Draft PR [#165](https://github.com/AbdullahOmaar/ai-business-assistant/pull/165), branch `ci/vercel-frontend-test-gate-2026-10-27`, commit tested: `1734997f4ad89f68bdf5f82134a7c8cd88cf1a6b`.
- Implementation: frontend build now runs `npm test && ng build`. The existing `npm test` runs Node's test runner against `src/app/workspace-load-guard.spec.ts`.
- Verification: Vercel Preview deployment [dpl_DUaMQxGAQrcipAQjp3KSRDa5wUHY](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-web/DUaMQxGAQrcipAQjp3KSRDa5wUHY) reached `READY` from the tested commit. Logs show `# tests 4`, `# pass 4`, `# fail 0`; Angular compilation completed; npm reported `found 0 vulnerabilities`.
- Limitation: Node emitted a non-fatal `MODULE_TYPELESS_PACKAGE_JSON` performance warning. This fallback validates only the current frontend test script and Angular compilation. It does not replace backend/PostgreSQL tests, container build, security checks, or release gates.
- Safety: PR #165 remains Draft and unmerged. The preview is not production.

### P2 — Verify recurring invoice and notification background execution
- Status: `NEEDS_VERIFICATION`
- Source: README.md known limitations
- Acceptance: determine whether reliable workers/scheduling exist in current source; if missing, design and implement an appropriate safe, zero-cost-compatible path with tests and operational docs.
- Constraint: confirm actual platform limits and costs before enabling recurring jobs; never assume a scheduler is running.

## Active work checkpoint
- GitHub Actions hosted-runner allocation is blocked and under diagnosis in Draft PR #164.
- The Vercel frontend test fallback is verified for commit `1734997f4ad89f68bdf5f82134a7c8cd88cf1a6b`; no production merge/deployment is authorized.
- No full-suite pass or overall production-ready claim is supported by the evidence currently available.
