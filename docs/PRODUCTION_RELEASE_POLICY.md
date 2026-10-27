# Production Release Policy

The project uses CircleCI as the intended independent hosted CI gate (after repository authorization and successful exact-SHA validation), keeps GitHub Actions as a secondary/fallback check where it can run, and uses Vercel only for intentional production releases. Until CircleCI has actually run and its required checks are enforced on `main`, CI activation remains BLOCKED and no demo/production release may rely on the unexecuted configuration. See [CI and accounting automation](CI_AND_ACCOUNTING_AUTOMATION.md).

## Why releases are batched

The Vercel free tier has hit the daily deployment-creation limit. Skipping a build after a deployment is created may save build work, but it does not reliably avoid creating the deployment record itself. Therefore, do not merge several small PRs to `main` one by one. Keep related, CI-passing changes in PRs and consolidate them into one release PR.

## Release markers

The Vercel projects use an Ignore Build Step marker:

- Frontend project: `[release-web]`
- Backend project: `[release-api]`

Include a marker in the final merge/PR title only when that production project is intended to build. For a coordinated full-stack release, include both markers. A PR without its project marker should not build that project.

Vercel preview deployments are disabled for these projects. Use CircleCI's backend/PostgreSQL, frontend, and container checks for PR validation only after the CircleCI project is authorized and those checks have actually passed. GitHub Actions remains available as a secondary path when runner allocation works.

## Required release checklist

1. All required CI checks pass on the exact release candidate SHA: CircleCI `backend-accounting`, `frontend-quality`, and `backend-container` once activated, plus applicable GitHub Actions checks when runners are available. This includes complete backend tests, real disposable PostgreSQL migrations/schema-drift validation, frontend tests/build, Python and npm dependency audits, and backend image build/import verification. A missing provider, unavailable runner, queued/canceled/stale check, or absent status is BLOCKED—not a pass.
2. Review the PR diff and confirm no unrelated features or production-data changes are included.
3. Confirm the Vercel daily deployment limit has reset before merging. Do not upgrade the plan without explicit approval.
4. Merge one consolidated release PR rather than multiple small PRs.
5. Verify each production deployment's Git commit SHA in Vercel.
6. Verify the frontend version badge and the public API `/version` endpoint report the expected release and commit.
7. Run authenticated read-only smoke checks and confirm `/readyz` is healthy. Complete the Android Chrome smoke checklist separately.

## Safety notes

- The API `/version` endpoint must expose only the semantic version, short commit SHA, and environment; never expose environment-variable values.
- Do not run database migrations, restore backups, or mutate production financial records as part of release verification.
- A successful CI run does not prove a production deployment occurred. Do not merge this CI alternative or claim validation complete until CircleCI has an inspectable successful run on its current branch head and the exact status contexts are required for `main`.
- Do not enable paid credits, paid overages, or a plan upgrade without explicit owner authorization. Free-tier limits are finite; a quota stop must block release rather than bypass a check.
