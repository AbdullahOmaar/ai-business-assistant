# Environment parity — what must match, what legitimately differs

3A-650 part E (from the 3A-445 round-2 review). The review's sharpest
finding was an environment divergence nobody had written down: the web
app had shipped several releases while the API still ran an old one, so
fixes that existed in the repo (docs gating, monitoring) were not live.
This document is the standing checklist for spotting that class of drift.
It describes how to check parity; it does not itself change any
environment.

## The environments

| | Local dev | CI | Production web | Production API |
|---|---|---|---|---|
| What runs | `ng serve` / local build + local API | GitHub Actions on the PR head | Vercel project (web) | Vercel project (API) |
| Data | none / SQLite in tests | SQLite test suites + disposable PostgreSQL jobs | — | Neon PostgreSQL |
| Identity | test resolvers | test resolvers | Firebase (real) | Firebase (real) |

## Parity checks (run at every grouped release)

1. **Version chain agrees.** `frontend/package.json`, `package-lock.json`
   (both root fields), `frontend/src/app/build-info.ts`,
   `frontend/public/sw.js` CACHE_NAME, `backend/pyproject.toml`,
   `backend/app/main.py` and the top `RELEASE_HISTORY` entry all carry
   the same version. The release-guide spec enforces this in CI; the
   deployed check is `GET /version` on the API and the version pill in
   the web app — **web and API versions must match each other**, not
   just their own repos. A mismatch is the divergence the review found;
   record it in `docs/RELEASE_EVIDENCE_REGISTER.md` the moment it is
   seen.
2. **Security headers are live on the web app.** `curl -sI` the
   production web URL and compare against `frontend/vercel.json`
   (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
   Permissions-Policy). Vercel's HSTS is platform-provided and is not
   duplicated in the file on purpose.
3. **API docs are gated in production.** `/docs`, `/redoc` and
   `/openapi.json` on the production API must not answer 200
   (`_interactive_docs_enabled` allows them only when `VERCEL_ENV` is
   empty or `development`).
4. **Monitoring is actually wired.** The web DSN ships in
   `frontend/public/runtime-config.json`; the API needs `SENTRY_DSN`
   set on the Vercel API project (see `docs/MONITORING_RUNBOOK.md`) —
   code being merged is not evidence; a received test event is.
5. **Migrations are applied.** The app does not auto-run Alembic at
   startup. Every release that adds a migration lists it in the release
   evidence register with its applied state; an unapplied migration is
   a release blocker for any feature depending on it.
6. **Rate-limit configuration is deliberate.** The API limiter reads
   `RATE_LIMIT_<scope>_PER_MINUTE` from the environment (defaults in
   `backend/app/rate_limit.py`). Production values are the defaults
   unless an override is recorded in the evidence register.

## Automated parity checks (3A-701 — Phase 2 A1)

`scripts/production_smoke.py` automates the checks above that are
observable from outside the Vercel projects. It runs the repo version
chain (all eight version fields), the live versions on both surfaces,
the web security headers, the API docs gating, and the authenticated
demo flows including a synthetic write cycle — and it fails (exit 1)
whenever the repo chain, the live web and the live API disagree, so a
divergence is reported by the run itself instead of being discovered by
accident. `python scripts/production_smoke.py --repo-only` runs the
chain check with no network and is gated in CI (`release-chain` job).

Still manual, because they cannot be seen from outside the projects:
Vercel environment variables (including `SENTRY_DSN` on the API
project — a received test event is the evidence, not the merged code),
and the applied-migration state (the smoke proves `/readyz` only; the
release evidence row records which migrations were applied at deploy
time). Nothing in this section may be claimed from the script's
evidence alone.

## Legitimate differences (not drift)

- Test suites run on SQLite with per-test resolvers; production runs
  PostgreSQL with Firebase identity. Behaviour pinned on SQLite is
  re-validated on disposable PostgreSQL in CI for the concurrency
  suites.
- Local builds stamp the build-info from the working tree's HEAD;
  production stamps come from the deployed commit. A local stamp that
  differs from production is expected, not drift.
- The demo-session rate limiter is PostgreSQL-backed by design; the
  general API limiter is in-process by design (documented in its
  module). Different mechanisms, both intentional.
