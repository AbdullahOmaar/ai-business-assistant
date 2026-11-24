# Page integrity + audit-log anomaly detection (B5 — 3A-723)

## 1. Page integrity — the script inventory

Read from the live page 2026-11-24 ~22:05 EET
(`https://ai-business-assistant-web.vercel.app/`, web 1.17.0 @ `61ffb76`):

| What the page loads | Count | Verdict |
|---|---|---|
| Same-origin hashed bundles (`polyfills-<HASH>.js`, `main-<HASH>.js`) | 2 | expected — the Angular build emits name-<HASH>.js |
| Inline `<script>` (the language/dir bootstrap from `frontend/src/index.html`) | 1 | expected — its SHA-256 is pinned in the CSP |
| Third-party **scripts** | 0 | none — Google Fonts is styles/fonts only, never a script |
| Other third-party origins (CSP allowlist) | fonts.googleapis.com / fonts.gstatic.com (style + font only), Firebase + Sentry ingest (connect-src only) | as designed |

The CSP (`frontend/vercel.json`) pins `script-src 'self'` plus the
inline script's `sha256-` hash. There is no `'unsafe-inline'` and no
wildcard in `script-src`.

### Finding — one stale CSP hash (fixed in this task)

The served CSP carried a **second** `sha256-` token
(`MhtPZXr7+…`) that matches **no** inline script on the served page —
a leftover from an inline script removed in an earlier change.
It was harmless (an unused allowlist entry) and it is removed in
this PR; the tightening lands with the next grouped web release.
The smoke flow reports such orphans as informational notes, not
failures, because the live CSP lags the repo until that deploy.

### What is checked automatically

The production smoke (`scripts/production_smoke.py`, flow
`web-scripts`, run on every grouped release) fetches the live shell
and fails on: any script from another origin; any external script
that is not a same-origin hashed bundle; any inline script whose
SHA-256 is not pinned in the CSP; a missing CSP; a `script-src`
with `'unsafe-inline'` or a wildcard. It also fetches each script
src and requires HTTP 200. Orphan CSP hashes are printed, not failed.

## 2. Audit-log anomaly detection

Pure rules in `backend/app/audit_anomaly.py` (thresholds are module
constants, tuned by review, not by code change at the moment):

| Rule | Pattern | Threshold |
|---|---|---|
| R1 destructive burst | destructive actions by one actor (deletes, deactivations, voids, cancellations, membership removals) | ≥3 in 10 min |
| R2 mass export | full exports by one actor | ≥3 in 60 min |
| R3 off-hours | any action outside 06:00–22:00 in the business's own timezone (`Business.timezone`, UTC fallback) | any |
| R4 cross-business actor | one actor with actions in several businesses | ≥3 businesses in 60 min |
| R5 settings churn | setting creates/updates by one actor | ≥10 in 60 min |

The report script `scripts/audit_anomaly_report.py` reads the
AuditEvent rows of a database (never production directly — run it
against a dump or an approved copy) and prints the findings, or
"no anomalies". Exit 0 always when the report is produced; a
finding is a review item, not a failure.

### Review cadence

- **Weekly:** the manager runs the report over the last 7 days
  and reviews any finding the same week.
- **Before each grouped production release:** the report runs
  over the period since the last release; findings are either
  explained in the release evidence or become tracked work.
- **A finding is not a verdict.** Each finding carries the rule,
  the actor, the window and sample event ids so a reviewer can
  verify it in one look; most findings will be legitimate work
  (a real bulk cleanup, a night-shift owner).

### What the detector cannot see

Denied requests write **no** AuditEvent (the denial matrix proves
it), so repeated denials are invisible here — they live only in the
platform security logs (`platform_admin_api._log_security_event`).
A burst of denials is a finding for the platform log review, not
for this detector.
