# Production monitoring runbook (3A-327)

How AIBA's error and uptime monitoring is set up, what it costs (nothing —
free plans), where alerts go, and how to verify or extend it. Set up
2026-11-22 under Linear 3A-327; accounts created by the manager's browser
with the company Google account.

## Error monitoring — Sentry

- Organization: **3A Automation** — slug `3a-automation`, data location EU,
  <https://3a-automation.sentry.io>. Signed in with the company Google
  account (`the.president.abdo@gmail.com`), which is the organization owner
  and therefore the alert recipient for new issues.
- Projects (free plan):
  - `aiba-web` (Angular) — DSN
    `https://cfdbc7302a85310266ef9c202e71a48e@o4512476853764096.ingest.de.sentry.io/4512476856516688`
  - `aiba-api` (FastAPI) — DSN
    `https://7801115f981f3f7ab27a31abb9a59350@o4512476853764096.ingest.de.sentry.io/4512476863135824`
- A DSN is a public client key: it can only *send* events to its project.
  It is not an account credential and is safe in the public web runtime
  config, exactly like the Firebase web API key.

### How the code uses it

- Web (`frontend/src/app/sentry-monitoring.ts`): after the runtime config
  is validated, the Sentry browser SDK is loaded with a dynamic import —
  only when `sentry.dsn` in `frontend/public/runtime-config.json` is
  non-empty — so it never weighs on the initial bundle. Initialized with
  `sendDefaultPii: false` and `tracesSampleRate: 0`.
- API (`backend/app/monitoring.py`): `configure_sentry()` runs at startup
  and initializes the SDK **only when the `SENTRY_DSN` environment variable
  is set**, with `send_default_pii=False` and `traces_sample_rate=0.0`. The
  environment label reuses `VERCEL_ENV` (`local` outside Vercel).

### Activation state

- Web: activates automatically with the first production deploy of the
  1.8.1 candidate (the DSN ships in the public runtime config).
- API: needs one operator step at release time — set `SENTRY_DSN` (the
  aiba-api DSN above) on the Vercel API project, then redeploy. Until then
  the API simply runs with monitoring off; nothing breaks.

### Log hygiene

Both SDKs are configured to send **no default PII**: no request headers,
cookies, bodies, IP-based user identity or form values are attached to
events. The backend's own security-event logging is likewise payload-free
(see `docs/SECURITY_NEGATIVE_PROOF_2026-11-22.md`). If a future change
needs breadcrumbs or context, review what is attached before enabling it.

### Verify it works (non-production)

Send a documented test error with the environment label `development` and
confirm it appears under the project's Issues:

- API: run a one-off Python snippet with `SENTRY_DSN` set to the aiba-api
  DSN, `sentry_sdk.init(..., environment="development")`, raise/capture a
  test exception and `flush()`. The 2026-11-22 verification event is titled
  "3A-327 monitoring verification (API test error)".
- Web: POST a minimal event envelope to the aiba-web ingest endpoint with
  `environment: "development"`. The 2026-11-22 verification event is titled
  "3A-327 monitoring verification (web test error)".

Delete or resolve the test issues afterwards so real alerts stay visible.

## Uptime monitoring — UptimeRobot

- Account: company Google account, free plan (1 of 50 monitors used).
- Monitor **AIBA API health** (id `804771958`):
  `https://ai-business-assistant-api.vercel.app/health`, HTTP check every
  5 minutes, alert contact = the company mailbox. Status at creation:
  Up, ~174 ms average response.
- Dashboard: <https://dashboard.uptimerobot.com/monitors/804771958>

## Alert routing summary

| Signal | Tool | Recipient |
| --- | --- | --- |
| New web/API error issue | Sentry | Company mailbox (org owner) |
| API `/health` down | UptimeRobot | Company mailbox |

## Limits and follow-ups

- Free-plan limits: Sentry's developer plan caps monthly events; with
  tracing off and a pre-release user base this is ample. UptimeRobot free
  checks every 5 minutes (no 1-minute checks, no status page extras).
- Re-check this setup before the public launch (paid-tier decision,
  alert escalation, and a status page are launch-time choices).
