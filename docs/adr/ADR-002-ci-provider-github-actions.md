# ADR-002 — GitHub Actions as the sole CI provider

- **Status:** Accepted — Owner decision effective 2026-11-10.
- **Decision owner:** Project Owner.
- **Implementation owner:** Project Master.
- **Scope:** Repository CI execution and exact-SHA merge validation. Production deployment remains a separate authorization and Vercel-owned runtime process.
- **Supersedes:** Earlier CircleCI-only and GitLab Free CI-provider selections.

## Context

The repository had multiple historical CI-provider directions and overlapping workflow definitions. This created ambiguity about which provider's result was authoritative for a candidate commit. The Owner selected GitHub Actions as the sole active CI provider on 2026-11-10. The decision is recorded in the canonical Notion Master Task Plan and reflected in the current repository operating instructions.

## Decision

Use GitHub Actions with standard GitHub-hosted runners as the sole approved repository CI provider.

- `.github/workflows/ci.yml` is the single authoritative validation workflow.
- The workflow runs on pull requests and pushes, with scheduled/manual execution where configured.
- The fail-closed `all-checks-passed` aggregate is the authoritative required status for merge eligibility.
- CircleCI, GitLab CI and Semaphore are not validation authorities. Do not reactivate or substitute them without a new explicit Owner decision.

## Required coverage

The authoritative workflow must retain relevant coverage for:

- Backend pytest and financial regression tests.
- Disposable PostgreSQL migration upgrade/current-revision/schema-drift checks and offline SQL generation.
- Project knowledge validator and its regression tests.
- Frontend unit/source regression tests and production build.
- Frontend dependency audit.
- Playwright Chromium browser smoke and retained test artifacts.
- Backend container build/import smoke and backup/restore safety guards.
- A fail-closed aggregate that does not pass when a substantive job fails or is skipped.

The exact job set is defined by the current workflow. This ADR does not freeze job names or prevent later approved improvements to coverage.

## Consequences and safeguards

- GitHub Actions logs, artifacts and check-runs are the authoritative CI evidence.
- A result is valid only for the exact candidate SHA it tested. Evidence from an earlier SHA is stale after the branch advances.
- The active default-branch ruleset requires the GitHub Actions `all-checks-passed` check with strict up-to-date enforcement. Repository protections must not be bypassed.
- CI jobs use disposable test infrastructure and least-privilege permissions. They must not access production databases or expose production credentials to untrusted pull-request code.
- CI-provider selection does not authorize production deployment, production database writes/migrations, paid provisioning, financial-policy changes or weakening of security controls.
- Merge and production-deployment authorization remain separate.

## Rollback

If GitHub Actions cannot execute or required coverage cannot be maintained, stop merge/release activity and request a new explicit Owner decision. Do not silently reactivate CircleCI, GitLab CI or Semaphore, weaken required checks, or treat a local partial run as equivalent evidence.

## Decision evidence

- Owner decision: AI Business Assistant — Master Task Plan, CI-provider decision effective 2026-11-10.
- Implementation: `.github/workflows/ci.yml`.
- Repository operating rules: `AGENTS.md`.
