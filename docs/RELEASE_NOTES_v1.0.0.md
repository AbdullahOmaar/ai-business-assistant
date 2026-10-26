# AI Business Assistant — v1.0.0 Release Candidate

## Included in this release candidate

- Multi-line invoice drafts with explicit save and separate issue actions.
- Discount and tax rate inputs with a mobile-friendly estimated totals preview.
- Decimal-safe client preview aligned with the backend's per-line `ROUND_HALF_UP` policy.
- Draft edit rate reconstruction with additional precision to avoid silently changing totals when reopening an unchanged draft.
- Regression coverage for half-cent line rounding and invoice subtotal/discount/tax/total reconciliation.
- Frontend package version set to `1.0.0`; the production build script generates the visible build version and service-worker cache name from the package version and actual build commit.

## Release status

This file describes a **release candidate**, not a declaration that production is ready. The release remains blocked until the exact candidate SHA passes CI, independent review is complete, security/tenant isolation and financial workflows are verified, the approved backup/restore gate is satisfied, and production deployment plus smoke checks are confirmed.

## Known release gates

- GitHub Actions must complete real jobs for the exact release commit. A job with no assigned runner and no steps is not a passing check.
- OWNER/STAFF authorization changes in PR #137 require successful tests and review before release.
- Verify Firebase token rejection, cross-workspace isolation, production CORS and login in a controlled environment.
- Complete the authorized backup/restore drill without introducing unapproved paid resources.
- Verify the production frontend and API commit SHAs, API readiness/version endpoints, invoice/payment/return flows, and installed-PWA update behavior after deployment.
- No production database migration or historical data rewrite is included or authorized by this release candidate.
