## Owner-approved CI provider transition — effective 2026-11-10

The Owner selects GitLab Free as the intended automatic repository CI provider. GitHub remains canonical for source code, branches, pull requests and release SHAs.

- GitHub branch Push events are the documented direct-webhook trigger path to GitLab Free. The resolver also accepts Pull Request payloads (including forks) and source-fetch fetches canonical `refs/pull/<number>/head` with exact-SHA verification; GitLab's documented direct-webhook contract covers Push/Tag only, so PR-event delivery remains experimental and NOT VERIFIED. GitHub tokens are restricted to source-fetch/status-report jobs; test/build/security jobs receive no GitHub tokens.
- GitLab's official external-repository CI integration and pull mirroring require Premium/Ultimate; the Free implementation uses the direct Pipeline Trigger webhook path and a protected GitLab runner-configuration ref.
- CircleCI remains configured and active as the transition fallback. Until automatic GitLab triggering, exact-SHA validation, GitHub status reporting and merge-control acceptance are verified, CircleCI's exact-SHA checks remain the current required validation gate. Do not retire CircleCI early.
- No session, agent or task may silently change the selected provider, disable CircleCI during transition, or substitute GitHub Actions/Semaphore. Only a later explicit Owner decision may amend this directive.
- For retries, record the failed job/root cause and changed condition or concrete diagnostic justification. Do not blindly retry an unchanged failure.
- Provider availability, quota, credentials, repository permissions and infrastructure limits still apply. If either approved transition path cannot execute, record the exact cause as NOT RUN/BLOCKED; never infer success from a skipped or missing pipeline.
- Required substantive jobs and the aggregate must pass on the exact current candidate SHA. Empty contexts, stale-SHA checks and partial results remain NOT PASS.
- GitHub private Free does not provide protected-branch/status-check enforcement for private repositories. Until an enforceable merge-control solution is verified, mark the merge gate BLOCKED / NOT VERIFIED; do not bypass it, make the repository public, or incur a paid upgrade without separate Owner approval.
- Full maintainer review, provider-enforced protections where available, resolved blocking threads, non-Draft READY state, explicit Owner merge authorization and separate production-deployment authorization remain mandatory.

This directive changes the intended CI provider and transition plan only. It does not waive tests, security, review, merge, data-integrity, migration or release gates.

## Summary
<!-- User-visible outcome, defect addressed, and why this is one coherent work package. -->

## Ownership and scope
- **Canonical task / issue ID and Notion link:**
- **Accountable Feature Owner:**
- **Actual primary writer:**
- **Maintainer reviewer:**
- **Additional reviewer:** N/A unless enforced by provider or required by a separate explicit Owner-approved policy
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
- **Intended provider:** GitLab Free automatic webhook pipeline (exact-SHA); CircleCI remains transition gate until cutover acceptance
- **Permanent CI execution authorization / provider-quota state checked:**
- **GitLab pipeline URL for exact head:**
- **Exact SHA tested:**
- **Substantive jobs and outcomes:**
- **Aggregate result:**
- **Checks actually run (commands / environment / timestamps):**
- **Checks NOT RUN / BLOCKED and exact reason:**
- **GitGuardian / other supplementary evidence (not a CI substitute):**

- [ ] All required exact-SHA jobs and aggregate passed on exact current head (GitLab after cutover; CircleCI remains required until then).
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
- **Author / maintainer self-review:**
- **Independent reviewer (must not be the author):**
- **Independent findings and disposition:**
- **Owner approval / decision record:**
- **Canonical source SHA / PR:**
- **Project Sources filenames, upload and readback evidence:**
- [ ] Independent knowledge review is complete and recorded.
- [ ] Authorized publication decision exists.
- [ ] All five files are one consistent approved version set.
- [ ] Project Sources UI upload and readback are verified, or publication is explicitly NOT DONE.

## Remaining work / blockers
<!-- Exact criterion, root cause, alternatives tried, unblock condition, owner and next action. -->

## Current handoff
- **Status:** VERIFIED COMPLETE / PARTIALLY COMPLETE / IN PROGRESS / BLOCKED / NOT RUN
- **Next action + owner:**
- **Latest evidence pointer:**
