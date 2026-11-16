# Public Demo Access

AIBA's public demo entry point is intentionally opt-in and uses a Firebase
custom token minted by the API. The demo email and Firebase Admin credentials
remain server-side; no password is shipped to the browser.

## API configuration

Set these variables on the API deployment only:

- `DEMO_LOGIN_ENABLED=true` — disabled by default; use only while the product
  is approved for public synthetic-data testing.
- `DEMO_LOGIN_EMAIL=admin@demo-aiba.test` — exact Firebase Auth identity
  configured for the demo. This is an identifier, not a password.
- Existing `FIREBASE_PROJECT_ID` and Firebase Admin credentials must be
  configured as usual.

The API returns a short-lived, single-use Firebase custom token from
`POST /api/v1/demo/session`. Responses are marked `Cache-Control: no-store`.
The endpoint fails closed when disabled or misconfigured, and refuses to mint
a token if the identity is configured as a platform super-admin or has an
active delegated platform role.

## Demo identity requirements

- The identity must have membership in the intended synthetic demo workspace.
- Do not grant it platform-wide administration.
- Do not attach real customer, employee, payroll, financial, or other personal
  data to the demo workspace.
- Anyone using the button shares the same demo identity and workspace. Changes
  made by one visitor are visible to other visitors; coordinate resets and
  concurrent edits accordingly.
- Keep ordinary tenant authorization, validation, idempotency, and audit
  behavior enabled. Do not create an unauthenticated business-data bypass.

## Disable

Set `DEMO_LOGIN_ENABLED=false` or remove it from the API deployment and
redeploy. The endpoint returns 404 when disabled.
