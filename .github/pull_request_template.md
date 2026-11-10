## Permanent Owner directive — GitHub Actions CI migration (effective 2026-11-10)

The Owner selects GitHub Actions as the sole approved repository CI provider. This decision supersedes all earlier CircleCI-only, CircleCI-freeze/unfreeze, GitLab CI, and provider-substitution instructions.

- The core required workflow is .github/workflows/ci.yml; it runs backend accounting/tests and PostgreSQL migration validation, knowledge-package validation, frontend unit tests and production build, frontend dependency audit, Playwright browser smoke, backend container/import checks, backup/restore safety guards, and a single aggregate gate.
- The required aggregate status is CI / all-checks-passed and must be successful on the exact current PR head SHA. Individual substantive jobs must also be inspected; an aggregate cannot conceal skipped or missing required jobs.
- .github/workflows/dependency-security.yml runs scheduled and manually requested Python/npm dependency audits.
- CircleCI is retired for this repository. Do not trigger, retry, require, or treat CircleCI results as current release evidence. The migration removes .circleci/config.yml.
- GitLab CI and Semaphore remain inactive/non-authoritative. Do not substitute them.
- Use the repository's approved GitHub-hosted runner configuration. Do not enable paid larger runners, purchase credits, or change billing without separate Owner authorization.
- Provider availability, Actions permissions, quotas, and organization/repository policy still apply. If Actions cannot execute, record the exact cause as NOT RUN/BLOCKED; never claim an unexecuted job passed.
- During cutover, update GitHub branch protection to require CI / all-checks-passed; confirm the effective setting through Owner/Admin UI readback because the connected integration cannot verify branch protection.
- Full maintainer diff review, provider-enforced protections, resolved blocking threads, non-Draft READY state, explicit Owner merge authorization, and separate production-deployment authorization remain mandatory.

This changes CI provider authority only. It does not waive tests, security, review, merge, data-integrity, migration, or release gates. The repository cutover becomes effective when this migration PR is merged; do not disable the current mainline validation before the replacement workflow has passed on the migration candidate.

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
- **Approved provider:** GitHub Actions only
- **Permanent CI execution authorization / provider-quota state checked:**
- **GitHub Actions workflow URL for exact head:**
- **Exact SHA tested:**
- **Substantive jobs and outcomes:**
- **Aggregate result:**
- **Checks actually run (commands / environment / timestamps):**
- **Checks NOT RUN / BLOCKED and exact reason:**
- **GitGuardian / other supplementary evidence (not a CI substitute):**

- [ ] All required GitHub Actions substantive jobs and aggregate passed on exact current head.
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
