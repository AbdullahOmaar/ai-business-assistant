# Phase 1 closure audit — AIBA (3A-367)

Closure batch, approved by the manager 2026-11-23 17:42 EET (8h estimate).
Audited against the three exit criteria of 3A-367, with live checks where
the criterion allows them. Verdict up front: **Phase 1 is not closable
yet — one criterion is unmet as written, one is partial, one is unmet.**
This document lists exactly what blocks closure, so nothing is hidden
behind a percentage.

## Criterion 1 — «جرد الشاشات U00–U42 منفذ بالكامل» — NOT MET

Two problems, one of them in the criterion itself:

1. **The register does not cover U25–U42.** The screens register (the
   owner-uploaded PDF, inventoried on 3A-371) covers **U00–U24 + rules
   G1–G7**. Screens U25–U42 do not exist in the register. The criterion
   as written asks for work that has no definition. The manager/owner
   must reconcile this: either the register extends to U42, or the
   criterion is corrected to U00–U24.
2. **Inside U00–U24, the work is not fully executed** (last inventory
   3A-371, 2026-11-22; nothing since has changed the register items
   except where noted):
   - Done (5): U01, U02, U05, U06, U24.
   - Partial with implementable remainder (7): U00, U03, U04, U07,
     U08, U09, U11. (The 3A-650 Part A fixes — overview KPI grid,
     assistant defer guard — repaired live review defects on these
     surfaces; they did not close the register's partial items.)
   - U10 (tax form, display only): implemented in 3A-371.
   - **U12–U23 (12 screens): no detailed owner requirements —
     «لسه ما اتحددش».** They cannot be executed until the owner
     defines them. Tracked as owner-reserved planning in 3A-408.
   - Rules: G6 done; G1/G2/G4/G5/G7 partial.

## Criterion 2 — «المراقبة الحية شغالة» — PARTIAL

- **Web Sentry: live.** DSN ships in `runtime-config.json`; test event
  AIBA-WEB-1 received 2026-11-22. The deployed web build (1.13.0)
  includes the Sentry integration.
- **UptimeRobot: live.** Monitor "AIBA API health" (id 804771958),
  5-minute interval on `/health`; Up at creation.
- **API Sentry: NOT activated.** The code merged in 3A-327 and shipped
  in 1.13.0, but `SENTRY_DSN` was never set on the Vercel API project
  (manager step, pending since 2026-11-22). No API event has been
  received. The API deploy alone does not activate it.

## Criterion 3 — «لا ديون مراجعة مفتوحة» — NOT MET

Round-2 review (3A-445) debts, status after the 1.13.0 release:

- Fixed and live: items 1 (API divergence — API now 1.13.0), 2
  (assistant defer guard), 3 (metric-grid CSS), 4 (API rate limiting),
  6 (report indexes), 7 (SW update flow).
- **Still open:** item 5 (Sentry API activation — manager step);
  item 8 (account/business deletion — launch-gate planning, 3A-650 §2);
  item 9 (RUM/Web Vitals — planning); item 10 partially (visual
  regression harness shipped; contract/mutation/fault-injection
  testing still planning).
- **3A-267 (CI failure notifications):** configuration verified sound,
  but delivery is **unproven** — the last 40 CI runs contain zero
  failures, so the notifier has legitimately skipped every time.
  Closing it needs a real failure notification or an authorized test
  post (manager's call).

## What blocks closure (complete list)

1. Owner decision: define U12–U23, or accept them out of Phase 1.
2. Criterion correction: U00–U42 → U00–U24 (or extend the register).
3. The 7 partial register screens (U00, U03, U04, U07, U08, U09, U11)
   and the partial rules G1/G2/G4/G5/G7 — one execution batch.
4. Manager step: set `SENTRY_DSN` on the Vercel API project + redeploy,
   then confirm an API test event.
5. Manager step: apply migration 0011 (needs production `DATABASE_URL`).
6. 3A-267: delivery proof (real failure or authorized test post).

## Addendum — 2026-11-23 ~18:05 EET (after the manager's SENTRY_DSN step)

- **API redeploy verified live:** after the manager set `SENTRY_DSN`
  and redeployed (deployment `c35zpd9f8`), `/version` still reports
  **1.13.0** / commit `b721905` / environment `production`;
  `/health` 200; `/readyz` 200 with `{"status":"ready"}`; `/docs`,
  `/openapi.json`, `/redoc` all 404 — **intended**, per the owner
  decision of 2026-11-22 (3A-364): `_interactive_docs_enabled()` in
  `backend/app/main.py` enables the docs routes only when `VERCEL_ENV`
  is empty or `development`. The 404 is the security fix working, not a
  problem.
- **Sentry API activation — test event sent:** a production-labelled
  test event ("3A-650 part B — production activation check (API)",
  id `a9b3e95e98dc4330bd2d4d20f857ef4b`) was sent through the aiba-api
  DSN and accepted. Final confirmation is a dashboard check the
  manager does: the event should appear under the aiba-api project's
  Issues in Sentry (it proves ingestion; the live deployment's own
  init runs the same code path when `SENTRY_DSN` is set).
- **Migration 0011 — release-time step built:** `DATABASE_URL` is a
  Vercel Sensitive (write-only) variable, so it cannot be applied from
  outside Vercel. PR #454 adds the repo side: a fail-closed
  build-time wrapper (`backend/scripts/apply_migrations.py`) plus
  `docs/RELEASE_MIGRATION.md` with the exact one-time dashboard
  change (prepend the script to the API project's Build Command),
  the exact 0011 SQL review, and the rollback plan. The dashboard
  change is the manager's step; the next deploy then applies 0011
  automatically.

## Live evidence gathered for this audit (2026-11-23 ~18:00 EET)

- API `/version` 1.13.0 / commit `b721905`; `/docs`, `/openapi.json`,
  `/redoc` all 404; `/health` 200; `/readyz` 200.
- Web `sw.js` `CACHE_NAME = 'aba-shell-v1.13.0-b721905132bc'`, 200, full
  security-header set live (CSP, DENY, nosniff, Referrer-Policy,
  Permissions-Policy, HSTS).
- CI: last 40 runs 38 success / 2 cancelled / 0 failures.
