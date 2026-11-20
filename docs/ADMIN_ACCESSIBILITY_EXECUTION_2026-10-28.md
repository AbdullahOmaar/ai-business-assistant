# Admin mobile accessibility execution — 2026-10-28

## Scope
- Extend the existing Playwright Platform Admin journey to run at a 390×844 mobile viewport.
- Exercise the Users & Access navigation by keyboard (focus + Enter).
- Assert the directory search field remains visible and the document has no page-level horizontal overflow.
- Keep all Firebase/API calls mocked; the E2E must not reach production services.

## Validation
- Existing baseline: `frontend/e2e/platform-admin.spec.ts` was part of the CircleCI `frontend-browser-smoke` job.
- New mobile/keyboard assertions are implemented but NOT YET VERIFIED.
- Required gate: exact-head CircleCI Browser Smoke passes. If the overflow assertion fails, inspect the actual layout and fix the responsible component before weakening the assertion.
- Accessibility scope remains partial: this is not a substitute for a full screen-reader/WCAG audit.

## Safety
- Draft PR only; no merge or deployment.
- No production data, auth policy, or secrets changed.
