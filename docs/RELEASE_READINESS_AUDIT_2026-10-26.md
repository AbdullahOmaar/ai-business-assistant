# Release Readiness Audit — 2026-10-26

## Verdict

**NOT READY for production release.** This audit reviewed source, open pull requests/issues, GitHub Actions metadata, and current Vercel deployment metadata. It is not a passed test run, an independent accounting opinion, or a jurisdiction-specific tax compliance review.

## Exact release and deployment evidence

- Reviewed main SHA: `af4ba084cedcec7339498579ef5563ce7748bf7c`.
- Frontend production deployment: Vercel reports READY on `af4ba084cedcec7339498579ef5563ce7748bf7c`.
- API production deployment: Vercel reports READY on `c8078c563ad9d88f04cccee740efdb1b64527df7`, which differs from main.
- Live API checks at review time: `/version` returned HTTP 200 and commit `c8078c563ad9`; `/health` returned HTTP 200; `/readyz` returned HTTP 200.
- CI on main: [dependency scan run 40347841637](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40347841637), [backend/frontend run 40313758952](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40313758952), and [container run 40313758885](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40313758885) failed.
- Latest candidate job evidence: [backend tests 40361274542](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361274542) and [dependency scan 40361254273](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361254273) failed before steps: `runner_id=0`, empty runner name, zero steps, and no inspectable logs. This points to runner allocation/infrastructure; it does not establish application test failure or success.

## P0 — release blockers

1. **No authoritative passing CI.** Backend/PostgreSQL tests, frontend tests/build, container build, and dependency audits have not been evidenced as executed successfully on the candidate SHA.
2. **Frontend/API version mismatch.** Frontend runs main SHA, API remains on older SHA. Health/readiness alone does not verify the business workflow.
3. **Role enforcement needs end-to-end verification.** Main has owner checks in some HTTP routes, but service-layer operations commonly accept any active member. Every sensitive mutation needs server-side least-privilege enforcement plus STAFF-denied and OWNER-allowed tests and cross-business tests.
4. **Procurement authorization/workflow gap.** Purchase order creation sets status `approved` for any active member, while the release runbook says staff should create drafts and sensitive procurement operations require owner authorization. No distinct approval step is present in the current route.
5. **Business-local financial date boundaries.** Main report bounds/defaults use UTC despite a configured business timezone. This can misclassify transactions around local midnight; existing PR #154/#161 must be validated and merged before reporting is trusted.
6. **CORS settings update.** Main CORS policy omits PUT while settings use PUT; the browser preflight fix/test is open in PR #158/#161.
7. **Generic settings do not yet reliably reject secret-like aliases.** Main rejects only a small exact list of setting keys, while aliases such as `API-KEY`, `pwd`, `passwd`, `access-key`, or `encryption_key` are not all covered by that exact list; the API also returns the stored setting value. PR #160/#161 contains broader key validation but is not merged/verified. Do not use this table for secrets.
8. **Full purchase/sales UI is incomplete in main.** Current visible navigation exposes overview, customers, products, invoices, payments, assistant, reports, and audit. It does not expose complete purchasing/supplier, expense, and sales-return flows. The invoice editor remains single-line; multi-line editor is in open PR #129.
9. **Recovery not proven.** The production backup/restore drill has not been run against a separate isolated target. Do not perform a production migration or destructive action until a zero-cost recovery path is proven and the release is approved.

## P1 — accounting/operational completeness gaps

| Area | Observed gap | Release implication |
|---|---|---|
| Sales invoices | Draft/issue/payment core exists, but UI supports one line; invoice issue/void role matrix needs tests | Do not claim full multi-line, role-safe workflow until merged and tested |
| Customer balances | Currency-separated statements/aging exist in open work, but credit notes and refunds are not included end-to-end | Outstanding balances can be incomplete after returns/refunds |
| Returns | Operational return flow exists, but a complete auditable credit-note/refund workflow reversing receivables/cash is not complete | No safe correction path for paid/part-paid invoices |
| Purchasing | Purchase orders and receiving can create stock movements; supplier bill, payable balance, and supplier payment lifecycle are absent | Not a complete procure-to-pay cycle |
| Inventory | Movement ledger exists, but inventory valuation/cost layers and COGS are absent | Profit/loss is not a full accrual-accounting profit calculation |
| Tax | Summary aggregates stored invoice tax values; jurisdiction, inclusive/exclusive policy, exemptions and filing rules are not fully configured | Not a tax filing/compliance system |
| Cash/bank | No verified reconciliation workflow | Cash/bank balances are not reconciled to statements |
| Period close | No verified close/lock/reopen-with-audit workflow | Historical periods are not protected from late edits by a period lock |
| Foreign currency | Currency totals remain separate; dated exchange rates and realized FX are absent | Do not combine currencies or claim converted consolidated reporting |
| Recurring documents | Schedules exist, but automatic generation worker is not verified | Recurring invoices are not proven to run automatically |
| Notifications | Queue metadata exists; delivery provider/worker is not verified | Do not claim notifications are delivered |
| Security audit | Dependency scans failed before runner allocation; no actual audit result available | Security status is unknown, not clean |
| Mobile/PWA | Real sign-in, installed-PWA cache/update, keyboard/viewport, and full workflow smoke tests not run here | Mobile release remains unverified |

## What is already present

- Firebase ID-token verification with project audience/issuer checks and revoked-token checking.
- PostgreSQL persistence and Alembic migrations.
- Business-scoped customer/product/invoice/payment data and tenant-boundary regression tests.
- Decimal monetary helpers using explicit `ROUND_HALF_UP` in domain totals and stored invoice line totals.
- Stock movement ledger, insufficient-stock checks, idempotency key for payment recording, and currency/customer checks on payment allocations.
- Readiness endpoint and version endpoint.
- Existing open PRs consolidate some necessary fixes: #161 returns/role/CORS/timezone/settings validation, #157 payment retry/workspace state, #154 timezone reports, #158 CORS PUT, #160 schedule timezone/setting-key validation, #129 multi-line invoice editor, #134 operations UI consolidation. They must be reconciled, reviewed and tested; open PRs are not shipped functionality.

## Accounting policy boundary

The current app is a business operations and management-reporting system, not a complete double-entry accounting ledger. Before representing it as compliant with formal accounting standards, the minimum accounting design needs documented account mappings/posting rules, receivable/payable and cash/bank subledgers, inventory valuation/COGS policy, credit-note/refund reversals, tax configuration for the actual jurisdiction, reconciliation, and period-close controls. Egyptian tax/e-invoicing obligations must be reviewed by a qualified local accounting/tax professional; the code cannot establish legal compliance by itself.

## Required release sequence

1. Resolve GitHub Actions runner allocation and obtain real logs.
2. Reconcile existing PRs without duplicates; add regression coverage for every sensitive role and accounting edge case.
3. Complete only the existing in-scope user journeys in the UI: customers → sales invoice → issue → payment/allocation → balance; supplier → purchase order → owner authorization → receipt → stock; expense; return/credit/refund; reports.
4. Pass backend tests against PostgreSQL, migration validation, frontend tests/build, container verification and dependency audits on one exact candidate SHA.
5. Prove backup restore to an isolated non-production target without paid resources.
6. Deploy only after gates pass; confirm frontend/API SHA alignment, then run authenticated non-mutating or disposable-data smoke tests.
7. Record exact evidence in `TASKS.md`; mark only evidenced work VERIFIED.

No production deployment, production migration, destructive data change, or historical data rewrite was performed as part of this audit.


## Runtime observations and audit checkpoint
- Vercel runtime-error summaries for both production API and frontend reported no runtime error clusters in the last 24 hours. This is a limited observability signal, not a functional smoke test; the Hobby runtime-log query also states that 24-hour raw logs exceed the plan's retention, so detailed historical logs are unavailable.
- Audit report and ledger were committed on the existing draft PR #161 branch. Current observed branch head: `df6954b54f17814fe3b790b82b5dde3e5e84689c`. The documentation-only commits do not execute backend/frontend workflows under the current path filters; the application candidate still has no passing test evidence. Keep PR #161 draft/unmerged.


## Execution follow-up — 2026-10-26 17:04 UTC
- Current PR #161 head observed before this documentation update: `aeab21141fae781f24877e5b21b0656146195e10`; PR remains Draft and unmerged.
- Purchasing authorization is now represented in candidate source as a two-step workflow: staff can create a draft; owner-only approval changes it to approved; owner-only receipt records stock movements. Regression tests cover staff denial and owner approval-before-receipt.
- Retry evidence on the latest code head still shows immediate workflow failure with no exposed steps: backend/frontend run [40365000073](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365000073), container run [40364999911](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40364999911), and dependency scan [40364999866](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40364999866). GitHub returned empty step arrays on retry. This is not a successful test result.
- Main and production were not changed. No merge, deploy, production migration, or data mutation was performed.
