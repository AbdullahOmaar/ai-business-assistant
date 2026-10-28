# Closed-unmerged PR reconciliation — 2026-10-28

**Repository:** `AbdullahOmaar/ai-business-assistant`  
**Status:** IN PROGRESS — evidence-based dispositions only; this is not a completed repository-wide audit.  
**Inventory baseline:** 109 closed-unmerged PR records. PR #263 previously documented 9 dispositions. This pass adds 11 more, for **20/109 reviewed and 89 remaining**.

## Disposition rules

- Never bulk-merge stale branches or delete branches as cleanup.
- A successor is accepted only when its commit is an ancestor of current `main`, or current source/tests directly demonstrate the intended behavior.
- If a successor chain exists, follow it to the current-main implementation.
- “Present/superseded” means do not merge the old PR; it does not mean production readiness or unrelated release gates are satisfied.

## Initial nine dispositions recorded in PR #263

| Closed PR | Intended change | Evidence-based disposition |
|---:|---|---|
| [#230](https://github.com/AbdullahOmaar/ai-business-assistant/pull/230) | Backup restore-target catalog guard | Superseded by [#234](https://github.com/AbdullahOmaar/ai-business-assistant/pull/234), merge commit `0346fa32de69ad83b2d58dcbd9caadbd6580bb60`; preserve the focused guard/tests, not the stale draft. |
| [#232](https://github.com/AbdullahOmaar/ai-business-assistant/pull/232) | Prevent voiding invoices after approved returns | Superseded by [#233](https://github.com/AbdullahOmaar/ai-business-assistant/pull/233), merge commit `6fde1b7191314a8225285f44154fa8963c89ae65). |
| [#227](https://github.com/AbdullahOmaar/ai-business-assistant/pull/227) | Post-merge verification documentation | Stale documentation-only checkpoint. Its branch is 2 commits ahead / 81 behind main, while current main's security review has later release and concurrency checkpoints. Do not replace current evidence with this historical snapshot. |
| [#222](https://github.com/AbdullahOmaar/ai-business-assistant/pull/222) | Branch consolidation ledger | Superseded by [#226](https://github.com/AbdullahOmaar/ai-business-assistant/pull/226), merge commit `6773389e030416c2ef91b6db04fd9bc24cb08399`. |
| [#212](https://github.com/AbdullahOmaar/ai-business-assistant/pull/212) | OWNER-only opening stock | Superseded by [#225](https://github.com/AbdullahOmaar/ai-business-assistant/pull/225), merge commit `e4117291ab64bbac395ba6c64c15bbf1914d27b4`. |
| [#170](https://github.com/AbdullahOmaar/ai-business-assistant/pull/170) | Duplicate-line oversell guard and v1.2.1 slice | Superseded by [#185](https://github.com/AbdullahOmaar/ai-business-assistant/pull/185), merge commit `7472026c2e0b02dcdc9ea8db43574c0ff416a66b`; production release status is tracked separately. |
| [#180](https://github.com/AbdullahOmaar/ai-business-assistant/pull/180) | Mobile UI refinements | Superseded by [#182](https://github.com/AbdullahOmaar/ai-business-assistant/pull/182), merge commit `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`. |
| [#184](https://github.com/AbdullahOmaar/ai-business-assistant/pull/184) | v1.2.1 version alignment | Follow successor chain #184 → #170 → #185; no separate merge needed. |
| [#179](https://github.com/AbdullahOmaar/ai-business-assistant/pull/179) | Mobile customers/invoices/activity-log polish | Superseded by [#182](https://github.com/AbdullahOmaar/ai-business-assistant/pull/182), merge commit `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`. |

## Eleven additional dispositions in this pass

| Closed PR | Intended change | Evidence-based disposition |
|---:|---|---|
| [#190](https://github.com/AbdullahOmaar/ai-business-assistant/pull/190) | Global Platform Admin directory and delegated roles | Current main contains the newer Platform Admin implementation and E2E. Candidate commit `83e5aa8e6d22cb8cc32a936e80cc6fe6e5bec787` is an ancestor of main; stale branch is 0 ahead / 98 behind. |
| [#202](https://github.com/AbdullahOmaar/ai-business-assistant/pull/202) | Firebase directory hardening and least privilege | Same stale Platform Admin workstream as #190; no unique commits to merge. Current-main component SHA `f4e47cf30e6306508eb66e7b693a58c897166fd7` differs from stale-branch component SHA `ecd12591da584b99a4e41982b7355582f64e6a58`. |
| [#199](https://github.com/AbdullahOmaar/ai-business-assistant/pull/199) | Owner-only data-integrity review UI | Superseded by [#203](https://github.com/AbdullahOmaar/ai-business-assistant/pull/203); successor commit `955e2314439a32a0266936da0d03947de61e8ec7` is an ancestor of main. |
| [#201](https://github.com/AbdullahOmaar/ai-business-assistant/pull/201) | Owner-only data-integrity review UI | Duplicate of #199's workstream; superseded by #203. |
| [#198](https://github.com/AbdullahOmaar/ai-business-assistant/pull/198) | Workspace-scoped customer search by name/email/phone | Superseded by [#214](https://github.com/AbdullahOmaar/ai-business-assistant/pull/214); successor commit `ac770fdfd079acc1bca4e360bc278b10c6e9d074` is an ancestor of main. |
| [#200](https://github.com/AbdullahOmaar/ai-business-assistant/pull/200) | Workspace-scoped customer search by name/email/phone | Duplicate of #198's workstream; superseded by #214. |
| [#194](https://github.com/AbdullahOmaar/ai-business-assistant/pull/194) | Firebase missing-account / directory-outage role-grant tests | Behavior is present in `backend/tests/test_platform_admin_api.py`: `test_role_grant_returns_not_found_for_missing_firebase_account_without_persisting` and `test_role_grant_fails_closed_when_firebase_directory_is_unavailable`. |
| [#196](https://github.com/AbdullahOmaar/ai-business-assistant/pull/196) | Firebase directory failure-path tests | Same behavior is present in current-main Platform Admin tests; do not reapply duplicate stale test branches. |
| [#195](https://github.com/AbdullahOmaar/ai-business-assistant/pull/195) | Mobile startup and RTL/LTR overflow E2E | Superseded by [#208](https://github.com/AbdullahOmaar/ai-business-assistant/pull/208); successor commit `8772438405764734bda6f475e31bd50c22341c86` is an ancestor of main. Current `frontend/e2e/startup.spec.ts` covers startup fallback, direction switching, and 360×800 overflow. |
| [#204](https://github.com/AbdullahOmaar/ai-business-assistant/pull/204) | Tenant-scoped supplier/purchasing/recurring APIs | Superseded by [#215](https://github.com/AbdullahOmaar/ai-business-assistant/pull/215); successor commit `64e44b01c39256a669a5fdb3002f4a7b9dafcc48` is an ancestor of main. |
| [#205](https://github.com/AbdullahOmaar/ai-business-assistant/pull/205) | Tenant-scoped supplier/purchasing/recurring APIs | Duplicate of #204's workstream; current main retains the scoped operations API/UI through #215. |

## Current totals and next steps

- **Reviewed dispositions:** 20 / 109
- **Remaining closed-unmerged PRs:** 89
- **Branches deleted:** 0
- **Stale branches bulk-merged:** 0
- **Production deployments performed by this audit:** 0

Next: continue the remaining 89 PRs in issue #249's priority order. For each, compare actual changed behavior and tests against current main, follow successor chains to terminal commits, and only propose a single focused implementation PR when a still-intended behavior is proven missing. This report does not close issue #249 and does not certify production readiness.
