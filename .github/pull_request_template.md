## Owner-approved CI provider change — effective 2026-11-10

The Owner explicitly supersedes the earlier CircleCI-only provider directive and the 2026-11-10 GitLab Free selection. GitHub remains canonical for source code, branches, pull requests and exact release SHAs. GitHub Actions is now the primary test/build/security CI provider.

- Use standard GitHub-hosted `ubuntu-latest` runners. The repository is Public; standard hosted runner usage for public repositories is free. No self-hosted runner, paid larger runner, or separate server is required.
- `.github/workflows/ci.yml` is the single authoritative validation workflow. It runs backend pytest + disposable PostgreSQL migration/schema checks + knowledge validator, frontend unit tests, production build, frontend dependency audit, Playwright browser smoke, backend container/backup-restore safety checks, and a fail-closed `all-checks-passed` aggregate.
- Every substantive job verifies that its checkout equals the workflow event SHA. Workflow permissions are read-only; no production secrets are needed or exposed to fork PR code. PostgreSQL is disposable and local to the CI job; no production database is accessed.
- GitHub Actions is the Owner-selected primary CI provider. The full six-job suite and aggregate have passed on an exact candidate SHA (see the dated checkpoint in `TASKS.md`). The active default-branch ruleset strictly requires GitHub Actions check `all-checks-passed` from the GitHub Actions App. No separate PR-approval count is currently enforced. CircleCI's GitHub webhook is disabled and no project schedules exist.
- GitLab CI is inactive and no longer an approved target. Do not create GitLab runners, triggers, webhooks or CI variables for this migration.
- Main's active default-branch ruleset requires the GitHub Actions `all-checks-passed` check from app ID 15368 with strict up-to-date enforcement. Copilot review and deletion/non-fast-forward rules remain active; no separate PR-approval count is configured.
- The Owner has explicitly authorized this CI retirement and normal PR-based integration of eligible branches. Production deployment, production DB writes/migrations, and gate bypasses remain separately restricted.

This directive changes the CI provider and validation implementation only. It does not waive tests, security, maintainer review, merge, data-integrity, migration or production-release gates.

## Summary
<!-- User-visible outcome, defect addressed, and why this is one coherent work package. -->

## Ownership and scope
- **Canonical task / issue ID and Notion link:**
- **Accountable Feature Owner:**
- **Actual primary writer:**
- **Maintainer self-review owner:**
- **Formal GitHub branch-protection approval:** N/A unless GitHub actually enforces one
- **Owned paths / shared-path boundary:**
- **Out of scope / explicit deferrals:**

## Candidate identity and PR size
- **Base branch / exact base SHA:**
- **Head branch / exact current head SHA:**
- **Changed paths / non-generated changed lines:**
- **Review budget:** within 15 paths / 800 lines OR staged-review plan below
- **Reason for exceeding target (if applicable):**
- **Staged review batches, order, dependencies and per-batch evidence (if applicable):**
- **Generated / lockfile files and rationale:**

## Acceptance criteria
- [ ] User-visible outcome implemented end to end.
- [ ] Positive, negative, failure/recovery and edge paths covered where applicable.
- [ ] Authorization and tenant-isolation behavior verified where applicable.
- [ ] Data integrity, idempotency, auditability and side effects reviewed where applicable.
- [ ] Documentation and TASKS.md updated where appropriate.

## Branch and writer coordination
- [ ] Existing branches and PRs checked; related scope reused where possible.
- [ ] This is the contributor's only active writing branch, or the independent-boundary exception is documented.
- [ ] One primary writer is named for each shared/coordination-sensitive path.
- [ ] No overlapping active writer claim; manual claim is understood not to be a lock.
- [ ] No unrelated scope, duplicate PR, unsafe rewrite or unapproved force push.

## Exact-SHA verification
- **Primary provider:** GitHub Actions hosted runners only; CircleCI webhook disabled.
- **Permanent CI execution authorization / provider-quota state checked:**
- **GitHub Actions workflow URL for exact head:**
- **Exact SHA tested:**
- **Substantive jobs and outcomes:**
- **Aggregate result:**
- **Checks actually run (commands / environment / timestamps):**
- **Checks NOT RUN / BLOCKED and exact reason:**
- **GitGuardian / other supplementary evidence (not a CI substitute):**

- [ ] All six GitHub Actions substantive jobs and `all-checks-passed` aggregate passed on exact workflow SHA; GitHub Actions is the sole active CI provider.
- [ ] Failures were investigated and affected checks rerun only after the condition changed.
- [ ] No unapproved/retired CI provider was treated as a replacement.
- [ ] Final cumulative diff was reviewed for regressions, secrets, unsafe changes and unrelated paths.

## Maintainer review and merge readiness
- **Maintainer full-diff review evidence / exact SHA:**
- **Provider-enforced review requirements readback:**
- **Blocking review threads:**
- **Base/divergence/conflict readback:**
- **Owner merge authorization evidence:**
- [ ] PR is READY / non-Draft.
- [ ] Full maintainer diff review is complete on current head.
- [ ] Required provider-enforced reviews/checks are satisfied.
- [ ] Blocking threads are resolved.
- [ ] Explicit Owner merge authorization exists.
- [ ] No branch-protection or policy gate was bypassed.

## Release safety (if applicable)
- **Affected Vercel projects:**
- **Intentionally unaffected projects:**
- **Merge auto-deploy coupling / Ignore Build Step evidence:**
- **Release markers and target versions:**
- **Owner production-deployment authorization (separate from merge):**
- **Migration / production-data / rollback impact:**
- [ ] Deployment coupling was disclosed before merge.
- [ ] Separate production authorization was obtained when needed.
- [ ] Exact deployed SHA/version, alias, health and safe smoke evidence recorded after deployment — or deployment explicitly out of scope.

## Canonical knowledge publication (only when applicable)
- **Document/package being published:**
- **Candidate version and DRAFT/APPROVED state:**
- **Maintainer / Master full-diff self-review (exact SHA + findings):**
- **Project-level review gate:** None beyond the accountable maintainer/Project Master full diff self-review recorded on this exact candidate SHA. Any formal GitHub branch-protection approval actually enforced remains mandatory.
- **Maintainer self-review findings and disposition:**
- **Required GitHub branch-protection approval (if enforced):**
- **Owner approval / decision record:**
- **Canonical source SHA / PR:**
- **Project Sources filenames, upload and readback evidence:**
- [ ] Maintainer self-review is complete and recorded.
- [ ] Accountable maintainer/Project Master full diff self-review is documented for this exact candidate SHA; any formal GitHub branch-protection approval actually enforced is satisfied.
- [ ] Authorized publication decision exists.
- [ ] All five files are one consistent approved version set.
- [ ] Project Sources UI upload and readback are verified, or publication is explicitly NOT DONE.

## Remaining work / blockers
<!-- Exact criterion, root cause, alternatives tried, unblock condition, owner and next action. -->

## Current handoff
- **Status:** VERIFIED COMPLETE / PARTIALLY COMPLETE / IN PROGRESS / BLOCKED / NOT RUN
- **Next action + owner:**
- **Latest evidence pointer:**
