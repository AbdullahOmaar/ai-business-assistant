# ADR-002 — GitHub Actions as the sole CI provider

- **Status:** Proposed for merge; Owner decision recorded 2026-11-10.
- **Decision owner:** Project Owner.
- **Implementation owner:** Project Master.
- **Scope:** Repository CI execution and exact-SHA merge validation only. Production deployment remains a separate authorization and Vercel-owned runtime process.

## Context

The repository previously used CircleCI as its required validation provider. On 2026-11-09, CircleCI's current-main pipeline was unable to start because the free plan reported free-plan-no-credits-available for all substantive jobs (started_at=null). GitHub Actions workflows were already present and did execute on PR #363 at exact head 32fc06e94907eacadcad12d1f6bcc84646b10237: backend/PostgreSQL migration checks and dependency audits passed, while frontend unit tests executed and reported 6 failures out of 380. This proves runner execution works; it does not prove the failing candidate is green.

## Decision

Use GitHub Actions as the sole approved CI provider. Retire CircleCI, GitLab CI and Semaphore as validation authorities. The required core workflow is .github/workflows/ci.yml; the aggregate CI / all-checks-passed must fail unless every substantive job succeeds on the exact candidate SHA. Keep scheduled/manual dependency audits in .github/workflows/dependency-security.yml.

## Required coverage

- Backend pytest and financial regression suite.
- Disposable PostgreSQL migration upgrade, current revision, Alembic drift check and offline SQL generation.
- Shared Project Knowledge validator and its regression tests.
- Frontend unit/source regression tests and optimized production build with build metadata.
- Frontend npm dependency audit.
- Playwright Chromium browser smoke with retained test artifacts.
- Backend container build and FastAPI import smoke.
- Backup/restore safety shell tests.
- Scheduled/manual Python and npm dependency audits.

## Consequences and safeguards

- GitHub Actions job execution, logs and artifacts become the authoritative CI evidence.
- Configure the repository's required status check as CI / all-checks-passed; verify the effective branch-protection setting via Owner/Admin UI readback. The connected integration cannot currently verify branch protection.
- No paid runner, Actions billing change, secret exposure, production database write/migration or deployment is authorized by this ADR.
- CircleCI config is removed from the migration candidate; do not merge until GitHub Actions passes on its exact head and required-check configuration is reconciled.
- Historical CircleCI results remain valid historical evidence for the SHA they tested, but are not current CI authority after cutover.
- Merge authorization and production-deployment authorization remain separate.

## Rollback

If GitHub Actions cannot execute or required coverage cannot be maintained, stop the cutover and request a new Owner decision. Do not silently reactivate CircleCI, GitLab or Semaphore, weaken required checks, or use a local partial run as equivalent evidence.
