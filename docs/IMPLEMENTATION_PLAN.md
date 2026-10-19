# V0 Implementation Plan

**Status:** Proposed sequence; implementation has not started.

## Phase 0 — Architecture and repository foundation
- [ ] Review and accept/revise ADR-0001.
- [ ] Add repository conventions and ignore rules for build artifacts, IDE files, and secrets.
- [ ] Select compatible Java, Node, and Angular versions after checking current requirements.
- [ ] Add local setup documentation and automated quality checks.
- [ ] No production deployment or cloud-resource changes.

**Exit criteria:** a new developer can follow the setup guide; build/test commands are documented; no credentials are required or committed.

## Phase 1 — Authentication, membership, isolation
- [ ] Implement sign-in/session handling and logout.
- [ ] Create business and membership models with OWNER and STAFF roles.
- [ ] Require active membership for every business-scoped API.
- [ ] Test that one business member cannot read or mutate another business's data.
- [ ] Test staff-versus-owner permissions and unauthenticated requests.

**Exit criteria:** deny-by-default behavior is proven by automated tests, not only UI behavior.

## Phase 2 — Customers and products/services
- [ ] CRUD customers and catalog items, scoped by business.
- [ ] Support service items and optional inventory tracking.
- [ ] Validate inputs and enforce membership on every operation.
- [ ] Test tenant isolation and validation.

## Phase 3 — Invoices and payments
- [ ] Define draft/issued/cancelled or corrected invoice lifecycle.
- [ ] Store line items and money as decimal values with explicit currency.
- [ ] Recalculate totals in the backend and transact issue/payment operations.
- [ ] Record payments and allocations; derive outstanding balances from source records.
- [ ] Add audit events and tests for duplicate/invalid transitions.

**Exit criteria:** invoiced, collected, and outstanding amounts are separately reproducible from records.

## Phase 4 — Expenses and reporting
- [ ] Record expenses with dates, categories, amounts, currency, and business scope.
- [ ] Build reports from source records, not manually maintained totals.
- [ ] Include low-stock alerts only when inventory tracking is enabled.
- [ ] Show data-completeness limitations for estimated profit.
- [ ] Reject or separate cross-currency aggregation.

## Phase 5 — AI insights (deferred)
- [ ] Define provider-neutral AI service interface and data-minimization rules.
- [ ] Use read-only, business-scoped context for initial insights.
- [ ] Label facts, estimates, assumptions, and missing data.
- [ ] Return drafts/suggestions; require explicit confirmation before consequential writes.
- [ ] Audit AI-assisted actions and test that AI cannot bypass authorization.

## Definition of done for every phase
- Automated tests cover normal, invalid, unauthorized, and cross-business cases.
- Changes are small and reviewable.
- Setup/docs remain current.
- No secrets, real customer data, unapproved infrastructure changes, or unapproved costs.
- Do not call the system production-ready until security, deployment, recovery, and operational checks are complete.
