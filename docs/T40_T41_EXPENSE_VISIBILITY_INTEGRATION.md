# T40 / T41 Expense Visibility Integration Review

Date: 2026-10-30  
Status: **BLOCKED — integration contract decision required; no runtime changes made.**

## Scope

This note reconciles the existing T40 Expenses & Reports PR #304 with T41 Employee/Payroll PR #308. It records a concrete privacy integration requirement and the source-level changes needed to preserve both workstreams. It does not approve the proposed role policy or authorize a merge.

## Verified repository evidence

- Live `main`: `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`.
- T40 PR #304 branch: `task/t40-fin-report-003-current-main-20261029`; source-level code reviewed at `c46370a64ddb157a621a7de44084d070835875c2`; documentation checkpoints `5ef93cea54cb39e036ca2e21f73da2e29718d383` and `757a07649cc27ec7a15e96901c1af0babe2a2896`; latest exact PR head at this review is `757a07649cc27ec7a15e96901c1af0babe2a2896`.
- T41 PR #308 branch: `feat/t41-salary-history-effective-dates`, head `f89380722efb580be79a2d46013df7f29a3e3f9c`.
- Both branches diverge from live main by two commits; their merge base is `c464398e0a6ace77eba32aabfbdbd09091f53999`.
- PR #304 is OPEN / DRAFT / UNMERGED (49 ahead / 2 behind); latest GitHub metadata says `mergeable=true`. PR #308 is OPEN / DRAFT / UNMERGED (80 ahead / 2 behind). Neither metadata value constitutes validation or permission to merge.
- Current T40 exact head `757a07649cc27ec7a15e96901c1af0babe2a2896` returns six CircleCI FAILURE contexts (backend-accounting, backend-container, frontend-unit-tests, frontend-production-build, frontend-dependency-audit, frontend-browser-smoke). Current T41 exact head `f89380722efb580be79a2d46013df7f29a3e3f9c` returned no status contexts. Neither is a pass.
- T37 remains PARTIALLY COMPLETE / NOT APPROVED. Master has requested an explicit decision on payroll-linked expense visibility; no versioned APPROVED decision is present.

## Source-level integration finding

### T40 implementation that must be preserved

On PR #304, `backend/app/extended_api.py::list_expenses`:
- accepts optional inclusive `start_date` / `end_date`;
- resolves local-day bounds using the business IANA timezone and UTC half-open intervals;
- rejects reversed/unrepresentable ranges with HTTP 422;
- orders by `Expense.incurred_at DESC, Expense.id DESC` before offset/limit.

This is the T40 date-boundary and deterministic-pagination behavior.

### T41 privacy candidate

On PR #308:
- `backend/app/security.py::apply_expense_visibility` excludes expenses whose IDs are referenced by `PayrollRecord.expense_id` for non-OWNER roles; OWNER remains unrestricted.
- `backend/app/extended_api.py` applies the predicate to expense list, report summary and deterministic insights.
- `backend/app/core_features_api.py` applies it to dashboard and P&L.
- `backend/app/operations.py` applies it to internal `financial_summary`.
- `backend/app/assistant_api.py` applies it to expense records included in AI chat context.
- T41's authored regression `test_staff_cannot_read_payroll_expense_through_broad_surfaces` checks STAFF and OWNER behavior across these surfaces, but the current PR #308 exact head has not been executed.

### Required integration — do not overwrite either side

1. The final `GET /expenses` query must start with the business-scoped Expense query, apply `apply_expense_visibility(..., business_id=business_id, role=membership.role)`, then apply T40's date predicates, stable ordering and pagination. The privacy predicate must run before offset/limit so hidden payroll rows do not affect visible page contents.
2. The current T40 `_authorized` helper returns `None`; T41's candidate requires retaining the returned membership role. If Master approves the candidate, update the helper to return `authorize_membership(...)` and pass `membership.role` to the visibility predicate. Do not hardcode role assumptions independently in route handlers.
3. Reconcile `core_features_api.py` as well: T40's `_day_bounds` overflow handling and report date behavior must survive while the T41 visibility predicate is applied to dashboard and P&L expense aggregates.
4. Preserve the T41 predicate on report summary, insights, internal financial summary and AI chat context. Preserve existing OWNER-only CSV export and employee/payroll management controls.
5. Keep all tenant scoping in the predicate itself (`PayrollRecord.business_id == business_id`) and in the base Expense query. Never rely on mutable category/description text as the privacy boundary.

## Decision gate

T41's candidate policy is:
- OWNER can read payroll-linked Expense rows and payroll-derived aggregates.
- STAFF and other non-OWNER members can continue reading ordinary business expenses but cannot read payroll-linked rows or their derived totals/counts across expenses, dashboard, P&L, report summary, deterministic insights, internal financial summary or AI chat context.
- CSV export and employee/payroll management remain OWNER-only.

This is a candidate only. T37's route × role × action × tenant matrix remains unapproved. Master must explicitly APPROVE this exact policy or publish an alternative before code/permission behavior is integrated or either PR is marked ready.

## Required regression coverage after approval

- Seed one payroll-linked Expense (via authoritative PayrollRecord.expense_id) and one ordinary Expense in the same business.
- STAFF list: payroll row is absent with no date filters, with start-only, end-only and combined date filters; ordinary row remains visible.
- Confirm visibility predicate is applied before deterministic ordering and offset/limit; test pages containing interleaved payroll and ordinary expenses.
- OWNER retains both payroll and ordinary rows under the same date filters and pagination.
- STAFF cannot recover payroll identity, net pay, payroll reference or payroll-derived totals/counts from dashboard, P&L, report summary, deterministic insights, internal financial summary or AI chat context.
- Existing OWNER-only CSV behavior remains enforced; OWNER positive access remains intact.
- Cross-tenant PayrollRecord links cannot suppress or expose another business's Expense rows.
- Preserve existing T40 reversed-range, timezone-invalid, calendar-extreme, DST and same-principal cross-business tests.
- Assert denied cross-tenant/role paths have no business-state or audit side effects where applicable.

## Validation and release

- T40-authored tests on PR #304: 21; related existing suites: 26. All source-reviewed only, **NOT RUN**.
- T41 privacy regression on PR #308: authored/source-inspected; current exact head **NOT RUN**. Historical test results on older commits do not validate current PR heads.
- T40 current exact-head GitHub status: six CircleCI FAILURE contexts on `757a07649cc27ec7a15e96901c1af0babe2a2896`. The documentation correction commit that produced this head omitted `[skip ci]`, so CircleCI contexts appeared automatically; this was unintended and contrary to the Operating Model. No manual run or retry was initiated; no job logs/root cause were verified. Future documentation-only commits must include `[skip ci]`. T41 current exact-head status query returned no contexts; that is not a pass.
- CircleCI execution/retries are prohibited by the Operating Model; GitHub Actions must not be used as replacement CI. GitLab mirror is stale and cannot validate either GitHub head. Desktop Commander device is OFFLINE.
- No code, schema, migration, payroll calculation, posting, permission behavior, merge or deployment was changed by this review.

## Next actions

1. Master records a versioned APPROVED/DEFERRED decision for the payroll visibility policy in T37.
2. T40 and T41 owners coordinate one source integration preserving both date semantics and visibility behavior; reconcile both branches' two-behind relationship against live main before final review.
3. Add/extend the cross-surface regression matrix, then run all relevant exact-head tests, PostgreSQL integration, build and security checks through an authorized runner.
4. Keep both PRs Draft / unmerged until policy approval, exact-head validation and independent security review pass.
