# Acceptance Matrix — #402 (Linear 3A-276)

Built 2026-11-23 as part 4 of Phase 1 completion batch (3). This matrix
is a **living registry**: `frontend/src/app/acceptance-matrix.spec.ts`
fails CI if the shell's destination list or the access rules in
`frontend/src/app/module-access.ts` drift from the table below, so a
new destination cannot ship without an acceptance row.

## The 19 destinations

The shell's `Tab` union has 20 values. `health` is an operational
surface (owner-only diagnostics), not a user destination — the #402
matrix covers the remaining **19 user destinations**.

| # | Destination | Access | Destination-specific evidence |
|---|---|---|---|
| 1 | overview | Any member | Overview workspace extraction + metric-grid rules (3A-376/round-2 review); dashboard timezone suite |
| 2 | customers | Any member | Core-features suite (search/update/soft-deactivation); customer CSV import suite; statement query suite; T42 invoice-reference states |
| 3 | products | Any member | Core-features suite (update/soft-deactivation); catalogue pricing pinned by T42 tests |
| 4 | invoices | Any member | T38 lifecycle/returns/credit-note suites (18/18); foreign-reference suite; T42 state suite; duplicate suite (3A-435) |
| 5 | payments | Owner only | Route matrix (STAFF denied); payment allocation foreign-invoice suite |
| 6 | expenses | Any member | Expenses suites; payroll-expense linkage (T41) |
| 7 | employees | Owner only | T41: employee/payroll API suite + failure-states suite (3A-250) |
| 8 | assistant | Any member | Assistant fallback/count suites (ar+en); action-refusal + security suites; T40 reports handoff spec |
| 9 | reports | Any member | Timezone reporting, receivables ageing, CSV formula-injection suites; T40 handoff |
| 10 | taxes | Owner only | Tax workspace form/loading work (3A-371, U10) |
| 11 | audit | Owner only | Audit-events workspace; filter submit behaviour (3A-354) |
| 12 | integrity | Owner only | Data-integrity workspace extraction (3A-376) |
| 13 | release-guide | Any member | Release-guide consistency spec (version chain, bilingual titles) |
| 14 | platform-admin | Platform admin | Platform-admin export suite; context separation verified in code (3A-382 plan) |
| 15 | suppliers | Any member | Suppliers workspace extraction (3A-376); purchasing workflow suites |
| 16 | purchases | Any member | T39: PO workflow + receiving suites (25/1); duplicate suite (3A-435) |
| 17 | recurring | Any member | Recurring-schedule customer-state suites (3A-407 P2.1 + T42 era) |
| 18 | notifications | Any member | Notification records are metadata/status only until a provider is configured (feature-guide limitation, spec-pinned) |
| 19 | team | Owner only | T43: invitation lifecycle suite + membership management suite + access-after-removal suite (3A-252) |

Operational surface (not counted): **health** — Owner only.

## Shared evidence (applies to every row)

- **Roles:** `module-access.ts` is the single access rule
  (`canAccessWorkspaceTab`), unit-tested by `module-access.spec.ts`;
  the backend route × role × tenant matrix
  (`backend/tests/test_route_role_tenant_matrix.py`) denies STAFF on
  every owner-only route family and asserts full-row snapshot equality
  on denials.
- **Two businesses:** the route matrix runs against a two-business
  fixture; `test_business_tenant_boundaries.py`,
  `test_foreign_business_workflows.py` and
  `test_foreign_invoice_references.py` pin cross-tenant behaviour;
  T43 pins removal from one business leaving the other intact.
- **Languages (ar/en):** i18n key parity is spec-enforced
  (1,941 keys each, zero missing either way); the localization spec
  bans inline Arabic copy in UI sources; the 2026-11-22 accessibility
  audit exercised login/signup in Arabic and English at desktop and
  640 px with zero axe violations and correct dir flipping.
- **States:** every shell `@defer` placeholder renders through the
  shared `aba-defer-placeholder` skeleton component (3A-371);
  list skeletons, empty states and the import-timeout/no-blind-retry
  behaviour are spec-pinned (3A-407 P2.2).
- **Browsers:** the frontend suite and production build run in CI on
  every merge behind the `all-checks-passed` gate; headless-Chromium
  harness screenshots were produced for the audited surfaces
  (2026-11-22). The dedicated browser E2E workflow is **not** in the
  gate (see the Phase 2 planning item for the E2E programme).

## Kept separate — NOT RUN (never claimed as browser evidence)

- Physical Android device journeys.
- Installed-PWA behaviour (install, offline, update acceptance on a
  real device).
- Screen-reader journeys (NVDA/JAWS/VoiceOver/TalkBack).
- Real-account authenticated production smoke.

These remain open acceptance debt, tracked in the Phase 2 planning
programme (real-device + formal accessibility audit item).
