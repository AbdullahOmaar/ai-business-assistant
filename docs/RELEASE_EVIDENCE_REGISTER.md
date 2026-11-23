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

## Standing rules this register enforces

1. No release is called live without a live check of the exact head
   (`/version` for the API, build-info for the web) recorded with its time.
2. Every deploy gets one register row in the same change that ships it —
   grouped deploys get one row for the group, listing every candidate in it.
3. Recovery claims stay separated: backup restore (drill doc) ≠ PITR;
   neither is claimed from the other's evidence.
