# Release candidate v1.2.1 — NOT RELEASED

**Status: IN_PROGRESS / BLOCKED.** This document is a release-candidate checklist, not proof of a completed release.

## Scope

- Align the backend API version, backend package version, and frontend package version at 1.2.1.
- Expand automated regression coverage for payment currency matching, allocation bounds, cross-business allocations, idempotency payload reuse, and cumulative approved sales returns.
- Preserve the existing production-safe accounting policy: Decimal calculations, explicit ROUND_HALF_UP rounding, per-business scoping, and no automatic rewriting of historical issued invoices.

## Release gates — all required

- [ ] GitHub Actions run on the exact candidate head completes actual backend/frontend tests, dependency audits, and container verification.
- [ ] Run the backend suite and frontend npm test / npm run build in a working environment; record command output and totals.
- [ ] Verify real PostgreSQL migration/integration tests and tenant-boundary tests.
- [ ] Confirm both production Vercel deployments can run within the account's deployment allowance; do not upgrade a paid plan without explicit approval.
- [ ] Merge the release PR only after checks pass, then confirm the exact main SHA.
- [ ] Confirm frontend production bundle/version badge, API /version, /health, and /readyz match the release SHA/version.
- [ ] Complete authenticated read-only workspace/payment/browser/PWA smoke tests.

## Known blockers at candidate preparation

GitHub Actions runs on recent main and rebased PR heads terminate before executing the test steps because no usable runner is allocated. Production currently still reports API version 1.2.0. Therefore v1.2.1 must not be reported as deployed or production-ready until the gates above are evidenced.

No production database rows, migrations, credentials, or secrets are changed by this candidate.
