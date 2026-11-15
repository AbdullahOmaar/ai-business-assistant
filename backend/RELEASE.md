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


## Runtime translation diagnostic — 2026-11-15

The browser smoke still observes empty purchasing confirmation interpolation although the exact served locale JSON contains the required keys. Added a focused E2E diagnostic to inspect the component's LocalizationService/TranslateService values at the exact interaction point. This is test-only instrumentation and must be removed after root-cause correction.


[release-api] Rebuild API Preview for purchasing confirmation localization fix.

[release-api] Rebuild API Preview for authenticated release smoke workflow coverage.


## Purchasing history contract fix — 2026-11-15

Browser trace from exact run 43713544354 identified a test-fixture mismatch: the API returns paginated receipt/activity payloads ({ items, limit, offset }), while the Playwright mock's generic GET fallback returned an array. Corrected the E2E mock and added assertions that both history endpoints are requested. The UI now fails into its recoverable history error state for malformed payloads instead of throwing during template rendering.

[release-api] Refresh API Preview for guarded purchasing history contract fix.

[release-api] Rebuild API Preview for established purchasing confirmation translations.

[release-api] Rebuild API Preview for confirmation translation fallback.
