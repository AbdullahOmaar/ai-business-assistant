# Production Release Policy

The project uses GitHub Actions for routine validation and Vercel only for intentional production releases.

## Why releases are batched

The Vercel free tier has hit the daily deployment-creation limit. Skipping a build after a deployment is created may save build work, but it does not reliably avoid creating the deployment record itself. Therefore, do not merge several small PRs to `main` one by one. Keep related, CI-passing changes in PRs and consolidate them into one release PR.

## Release markers

The Vercel projects use an Ignore Build Step marker:

- Frontend project: `[release-web]`
- Backend project: `[release-api]`

Include a marker in the final merge/PR title only when that production project is intended to build. For a coordinated full-stack release, include both markers. A PR without its project marker should not build that project.

Vercel preview deployments are disabled for these projects; use GitHub Actions for PR validation.

## Required release checklist

1. All GitHub Actions checks pass, including frontend build/npm audit, backend tests, container verification, and PostgreSQL migration checks.
2. Review the PR diff and confirm no unrelated features or production-data changes are included.
3. Confirm the Vercel daily deployment limit has reset before merging. Do not upgrade the plan without explicit approval.
4. Merge one consolidated release PR rather than multiple small PRs.
5. Verify each production deployment's Git commit SHA in Vercel.
6. Verify the frontend version badge and the public API `/version` endpoint report the expected release and commit.
7. Run authenticated read-only smoke checks and confirm `/readyz` is healthy. Complete the Android Chrome smoke checklist separately.

## Safety notes

- The API `/version` endpoint must expose only the semantic version, short commit SHA, and environment; never expose environment-variable values.
- Do not run database migrations, restore backups, or mutate production financial records as part of release verification.
- A successful GitHub Actions run does not prove a production deployment occurred.
