# Version history and feature guide

## User-facing guide

- The app's **App guide & versions / دليل التطبيق والإصدارات** page is accessible from the desktop navigation and the mobile **More / المزيد** menu.
- The canonical content for that page is `frontend/src/app/release-guide.ts`. It contains the grouped feature catalogue and a short newest-first change log in Arabic and English.
- Keep the visible catalogue concise. Group related features, use collapsible sections, and note features that need an owner role or backend setup.
- List only behavior available in the version being described. Keep roadmap/demo-only features out of the available-feature list.

## Required steps for each versioned release

1. Pick the next appropriate semantic version. Use a patch bump for compatible fixes and a minor bump for additive user-facing features; a major bump requires a deliberate compatibility change.
2. For coordinated full-stack releases, align `frontend/package.json`, `backend/pyproject.toml`, and `backend/app/main.py`. For an independently releasable frontend-only patch, bump the frontend package/lockfile and record the unchanged API version in `RELEASE_HISTORY[0].apiVersion`; do not change or redeploy the backend. The production frontend build regenerates `frontend/src/app/build-info.ts` and the PWA cache key from the frontend package version; update their fallbacks for local runs when needed.
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

- **1.3.7** — frontend accessibility patch: WCAG AA secondary-text contrast on light surfaces; deployed to production Web at main SHA `ac31d3d38f727ce24eb1b748d44a33c76344e0fd`; API remains 1.3.5.\n- **1.3.6** — startup reliability and workspace navigation; deployed to production Web at main SHA `45924b5b37da917d98085487f091779317988966`.
- **1.3.5** — session synchronization and workspace data protection; current production API version is 1.3.5.
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


## 1.3.5 — Session and tenant-state security (release candidate)

- Align frontend package, lockfile root metadata, backend package, FastAPI API metadata, local build-info fallback, and PWA service-worker fallback at `1.3.5`.
- Synchronize Firebase sign-in/sign-out/account changes across tabs; clear workspace-scoped state on identity transitions; fence delayed Audit and Customer Statement responses against stale workspace, UID, role, and selected-customer context.
- Add regression coverage for observer lifecycle and tenant request-context transitions.
- **Production status:** API version 1.3.5 is live on main SHA `45924b5b37da917d98085487f091779317988966`; frontend version 1.3.6 is deployed separately. CircleCI is the approved validation provider; GitLab is inactive.

## 1.3.6 — Startup reliability and workspace navigation (frontend-only release candidate)

- Bumps the frontend package, lockfile, local build-info fallback, and PWA cache fallback to `1.3.6`.
- Adds recoverable startup configuration errors/retry and rejects whitespace-only public Firebase/API settings before initialization.
- Adds the role-aware All Modules launcher, centralized protected-tab navigation checks, and OWNER-only Activity Log visibility in the mobile More menu.
- API remains unchanged at `1.3.5`; no backend deployment, database migration, or financial/payroll rule change is included.
- **Production status:** Web version 1.3.6 was deployed on main SHA `45924b5b37da917d98085487f091779317988966` before the subsequent 1.3.7 frontend patch; API remains 1.3.5.

## 1.3.7 — Accessibility and text contrast (frontend-only release candidate)

- Bumps the frontend package, lockfile, local build-info fallback, and PWA shell cache fallback to `1.3.7`.
- Raises secondary text contrast on light surfaces to WCAG AA normal-text threshold (at least 4.5:1) while preserving dark-sidebar colors.
- Adds a regression test for the affected selectors and calculated contrast ratios.
- API remains unchanged at `1.3.5`; no backend deployment, database migration, or financial/payroll rule change is included.
- **Production status: DEPLOYED.** Web Vercel deployment `dpl_9fFHJ45QxzMBuuoEhLkCUDwBXPDy` is READY on main SHA `ac31d3d38f727ce24eb1b748d44a33c76344e0fd`, production alias `ai-business-assistant-web.vercel.app`, frontend version `1.3.7`, and PWA cache `aba-shell-v1.3.7-ac31d3d38f72`. API remains at version `1.3.5` on SHA `45924b5b37da917d98085487f091779317988966`; health/readiness are 200.
