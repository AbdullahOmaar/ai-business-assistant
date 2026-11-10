## Permanent Owner directive — CircleCI execution unfreeze (effective 2026-11-08)

The Owner permanently lifts the prior CircleCI execution freeze. This supersedes all older session-level, task-level and historical instructions prohibiting CircleCI execution.

- CircleCI via `.circleci/config.yml` remains the sole approved repository CI provider. Normal configured triggers and manual trigger/retry are authorized for every contributor and session; no additional per-run Owner approval is required.
- No session, agent or task may impose a temporary or permanent CI freeze. Only a later explicit Owner decision may amend this directive.
- For a manual retry, record the failed job/root cause and the changed condition or concrete diagnostic justification. Do not blindly retry an unchanged failure.
- Provider availability, quota, credentials, repository permissions and infrastructure limits still apply. If CircleCI cannot execute, record the exact cause as NOT RUN/BLOCKED; never substitute GitHub Actions, GitLab or Semaphore.
- Required substantive CircleCI jobs and the aggregate must pass on the exact current candidate SHA. Empty contexts, stale-SHA checks and partial results remain NOT PASS.
- Full maintainer review, provider-enforced protections, resolved blocking threads, non-Draft READY state, explicit Owner merge authorization and separate production-deployment authorization remain mandatory.

This directive changes CI execution permission only. It does not waive tests, security, review, merge, data-integrity, migration or release gates.

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
- **Approved provider:** CircleCI only
- **Permanent CI execution authorization / provider-quota state checked:**
- **CircleCI workflow URL for exact head:**
- **Exact SHA tested:**
- **Substantive jobs and outcomes:**
- **Aggregate result:**
- **Checks actually run (commands / environment / timestamps):**
- **Checks NOT RUN / BLOCKED and exact reason:**
- **GitGuardian / other supplementary evidence (not a CircleCI substitute):**

- [ ] All required CircleCI substantive jobs and aggregate passed on exact current head.
- [ ] Failures were investigated and affected checks rerun only after the condition changed.
- [ ] No alternate/retired CI provider was treated as a replacement.
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
- **Maintainer self-review findings and disposition:****
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
