# Version history and feature guide

## User-facing guide

- The app's **App guide & versions / دليل التطبيق والإصدارات** page is accessible from the desktop navigation and the mobile **More / المزيد** menu.
- The canonical content for that page is `frontend/src/app/release-guide.ts`. It contains the grouped feature catalogue and a short newest-first change log in Arabic and English.
- Keep the visible catalogue concise. Group related features, use collapsible sections, and note features that need an owner role or backend setup.
- List only behavior available in the version being described. Keep roadmap/demo-only features out of the available-feature list.

## Required steps for each versioned release

1. Pick the next appropriate semantic version. Use a patch bump for compatible fixes and a minor bump for additive user-facing features; a major bump requires a deliberate compatibility change.
2. Align `frontend/package.json`, `backend/pyproject.toml`, and `backend/app/main.py`. The production frontend build regenerates `frontend/src/app/build-info.ts` from the frontend package version; update that file's fallback for local runs when needed.
3. Update `frontend/src/app/release-guide.ts`:
   - Add the new version at the top of `RELEASE_HISTORY`.
   - Write a brief user-facing title and a few concrete changes in Arabic and English.
   - Update `FEATURE_CATALOG` for newly added, renamed, or removed behavior.
   - Do not claim an unmerged or unshipped feature is live.
4. Update `TASKS.md` with the implementation SHA, exact checks and observed results, merge state, and deployment state.
5. Verify applicable checks on the exact candidate SHA and complete the authorized review/merge process. Do not bypass required checks or protections.
6. If production release is authorized, use `docs/PRODUCTION_DEPLOYMENT.md` and its release markers. After deploy, verify the alias, deployed SHA/version, health/readiness and a safe smoke journey before calling the version live.

## History currently represented in the app

The app page lists these release lines based on the repository's versioned release history:

- **1.3.3** — release reliability: frontend release-metadata tests now work from Vercel's configured frontend root and preserve full-repository frontend/API parity checks.
- **1.3.0** — release candidate: invoice payment shortcut and remaining balance, opening stock/current quantity for stock-tracked items, and this feature guide.
- **1.2.1** — accounting and workflow improvements: stock validation and consistent invoice rounding, payment retry feedback, owner-only invoice issue/void, and clearer UI/API version information.
- **1.2.0** — core workspace, customer/product, invoicing, payments, currency-separated reporting, stock movement, and CSV product import workflows.
- **1.0.0** — mobile multi-line invoice drafts and totals preview.

Only the version embedded in the deployed build identifies what users have actually received. A version listed on a candidate branch is not proof that it has been deployed to production.


## 1.3.4 — Release metadata alignment

- Aligned the frontend package, lockfile root metadata, backend package, and FastAPI `/version` metadata at `1.3.4`.
- Updated the local build-info fallback, service-worker cache fallback, bilingual in-app release history, and release consistency regression tests.
- Production status: NOT DEPLOYED until exact-main CircleCI and release gates pass and the deployment SHA/version is verified.


## 1.3.5 — Session and tenant-state security (production release)

- Align frontend package, lockfile root metadata, backend package, FastAPI API metadata, local build-info fallback, and PWA service-worker fallback at `1.3.5`.
- Synchronize Firebase sign-in/sign-out/account changes across tabs; clear workspace-scoped state on identity transitions; fence delayed Audit and Customer Statement responses against stale workspace, UID, role, and selected-customer context.
- Add regression coverage for observer lifecycle and tenant request-context transitions.
- **Production deployment:** Web and API are both `READY` on GitHub main SHA `dcb0853ab06dc9271b1109db03eb84ab2e3360c8`. Vercel production deployment IDs: Web `dpl_F4CDmFLXug9aRqkU2TQerP4XzRDy`; API `dpl_6E9bZUkucaBM2og1s7eFNBbk7QH4`.
- **Live API verification (2026-10-31):** `GET /version` returned version `1.3.5`, commit `dcb0853ab06d`, environment `production`; `GET /readyz` returned ready; `GET /health` returned ok.
- This verifies the existing v1.3.5 production release. It does not mean any newer candidate PR has been merged or deployed.
