# Release evidence register (T07 / Linear 3A-241)

Per-release operational evidence: the exact head that shipped, what was
verified live, and the rollback plan. An entry records only what was
actually observed — a candidate that was never deployed says so, and a
backup restore never claims point-in-time recovery (PITR): a successful
backup restore proves backup recovery, not PITR (see
`docs/BACKUP_RESTORE_DRILL.md`).

Rollback for every Vercel release below is the same shape: redeploy the
previous known-good deployment (Vercel instant rollback) or, for a bad
merge, revert the merge commit on `main` and let the grouped deploy
follow. Database migrations are additive-only in this project, so a code
rollback never needs a schema rollback.

| Release | Exact head | State | Live evidence | Rollback |
|---|---|---|---|---|
| 1.6.5 | PR #420 merge (3A-342) | Deployed 2026-11-22 | `/version` reported 1.6.5; `/readyz` ready (verified live by the builder the same morning) | Redeploy 1.6.4 deployment |
| 1.7.0 | `7e741b3` (PR #421) | Candidate merged 2026-11-22 | Not separately live-verified by the builder | Redeploy previous |
| 1.7.1 | `adbb4cd` (PR #422) + `6e9f5c8` (PR #423, 1.8.0 candidate) | Deployed | API `/version` reported **1.7.1** (commit `adbb4cd`) and web returned 200 on 2026-11-22 22:32 EET — the API deploy lagged one candidate behind the merged stack; recorded as observed, not assumed | Redeploy previous |
| 1.8.1–1.9.9 stack | merges through `f2ae207` (PRs #425–#436) | Merged to `main` 2026-11-22/23 | The manager reported the phase-era live line as 1.9.3 and one grouped deploy for the 1.9.9 stack; per-candidate live verification was not performed by the builder | Redeploy previous |
| 1.10.0 | 3A-407 parts 1–3 (PRs #437+) | Candidate — NOT deployed at register time | Local evidence only: full backend suite, frontend suite, Ruff, gitleaks full-history scan + planted-secret trial (part 1) | n/a until deployed |
| 1.11.0 | 3A-435 parts 1–3 (PRs #440–#442) | Candidate merged 2026-11-23 | Local evidence only: backend 495/14, frontend 775/775, Ruff clean; invoice + PO duplication verified by new tests | n/a until deployed |
| 1.12.0 | 3A-435 follow-on batch (3) (PRs #443–#446) | Candidate merged 2026-11-23 | Local evidence only: backend 503/14, frontend 778/778, Ruff clean; T41–T43 failure states + #402 matrix pinned by new tests | n/a until deployed |
| 1.13.0 | 3A-650 §1 parts A/C/D/E (PRs #447–#450, merges `d6d642c`, `578defc`, `08b81e5`, `de7f6e8`) + release PR #451 (merge `b721905`) | **Deployed 2026-11-23 ~17:56 EET — API + web** | Live at 17:56–18:00 EET: API `/version` reported **1.13.0** / commit `b721905`; `/docs`, `/openapi.json`, `/redoc` all **404** (docs gating live for the first time); `/health` 200, `/readyz` 200. Web `sw.js` reports `CACHE_NAME = 'aba-shell-v1.13.0-b721905132bc'` and returns 200 with the full security-header set live (CSP, DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS) — the web deployed from the same merge, so the Part A/E UI fixes are live; the earlier "web not deployed" note was corrected by this live check. Before the deploy (17:51 EET) the API still reported 1.7.1 / `adbb4cd` with `/docs` 200. Update 2026-11-23 ~20:55 EET: `SENTRY_DSN` set by the manager (deployment `c35zpd9f8`); test event `a9b3e95e98dc4330bd2d4d20f857ef4b` sent, accepted, and **confirmed visible in the dashboard** 2026-11-23 ~20:56 EET (aiba-api issue AIBA-API-1, environment production, exact ID match). **Migration 0011 APPLIED**: the manager set the API Build Command to run `python scripts/apply_migrations.py` and redeployed from main `bb4553c` (deployment `d3i34s2zg`); build log shows the upgrade to `0011_report_indexes (head)` (0010 applied in the same run). Production API + web both verified at `bb4553c` ~20:57 EET (`/version` 1.13.0/production — commit field reads "unknown" on the CLI deploy; web `sw.js` fingerprint `aba-shell-v1.13.0-bb4553cb2894`). Note: GitHub-triggered deployments after merges #452–#455 were being cancelled seconds after starting, which is why production had stayed at `b721905` until this CLI redeploy. | Redeploy previous |

| 1.15.0–1.17.0 web | Merges #466–#468 (closure batches, 3A-698/699/700) + #469 paperwork (`162f7ab`) | **Deployed (grouped, manager-side)** | Web `sw.js` reports `CACHE_NAME = 'aba-shell-v1.17.0-162f7aba920f'` — verified live 2026-11-24 ~17:45 EET by `scripts/production_smoke.py` (10/10 flows PASS in 17.5s, see the procedure below). **The API still serves 1.13.0** — the divergence is recorded here, not smoothed over; the API release is a pending manager step. | Redeploy previous |

## Production smoke procedure (3A-701 — Phase 2 A1)

`scripts/production_smoke.py` is the documented, runnable production
smoke. Run it after every grouped deploy and before any release is
called "live". It is stdlib-only and needs no secrets: the demo session
is public, and the Firebase web API key is read from the live public
`runtime-config.json`.

**The 10 flows:** web shell 200 + security headers; live web version
from the served `sw.js`; API `/health`; API `/version`; API `/readyz`
(a real `SELECT 1`); interactive API docs gated (404); demo session
(the rate-limit upsert is itself a committed production write); demo
token exchange + demo business read; authenticated customers + invoices
reads; a synthetic write cycle inside the demo business only (create →
read back → delete).

**Exit contract:** exit 0 only when every flow passes AND the repo
chain, the live web version and the live API version agree. A
divergence exits non-zero and is printed, never hidden. Transport
failures (a cold serverless instance dropped connections outright in
the first live runs; the first demo-session call once took ~116s) retry
inside the script — a single dropped connection is not evidence the
deployment is down — but a flow that still fails after retries fails
the run, and the script always reaches its verdict instead of crashing.

**In CI:** `python scripts/production_smoke.py --repo-only` runs on
every PR in the `release-chain` job (gated by `all-checks-passed`); it
checks the repo chain only, with no network. The live flows run
manually from the repo root after a deploy.

## Standing rules this register enforces

1. No release is called live without a live check of the exact head
   (`/version` for the API, build-info for the web) recorded with its time.
2. Every deploy gets one register row in the same change that ships it —
   grouped deploys get one row for the group, listing every candidate in it.
3. Recovery claims stay separated: backup restore (drill doc) ≠ PITR;
   neither is claimed from the other's evidence.
4. "Live" is claimed only from a passing production-smoke run (exit 0),
   recorded with its time — never from a merge alone.
5. A divergence the smoke reports is recorded in this register the
   moment it is seen; a run that passes all flows but shows a
   divergence still exits non-zero.
