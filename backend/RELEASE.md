# Backend release candidate — 2026-11-15

This release marker identifies the November integration candidate for the Vercel API project's guarded release workflow.

- Source branch: `master/nov-2026-phase-1-ux-foundation`
- Candidate PR: #398
- Scope: workspace customer, product, and purchasing workflows; purchase-receipt idempotency and related API integration.
- Database migrations: validate the target environment's Alembic revision before enabling migration-dependent endpoints.

This file is a release marker and does not itself apply database migrations.


## Preview refresh — 2026-11-15

The purchasing approval confirmation fallback was corrected after exact-head browser smoke exposed empty confirmation copy. Re-run the full exact-SHA workflow and refresh both Preview deployments before release review.


## Confirmation copy localization — 2026-11-15

The purchasing approval E2E trace exposed empty confirmation labels. The UI now uses dedicated localized prompt and action-button keys in both Arabic and English. Re-run exact-head CI and refresh Preview deployments before release.
