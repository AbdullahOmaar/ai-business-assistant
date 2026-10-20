# V0 Architecture Decision Matrix

- **Status:** Working proposal — not owner-approved
- **Purpose:** Make the open architecture choice explicit before application scaffolding.
- **Related decision issue:** [#7 — reconcile and approve V0 stack](https://github.com/AbdullahOmaar/ai-business-assistant/issues/7)
- **Related proposal:** [PR #1](https://github.com/AbdullahOmaar/ai-business-assistant/pull/1)

## 1. What is confirmed vs unresolved?

### Confirmed product constraints
- Angular is the intended web-first frontend for V0.
- The product must isolate every business's data and enforce OWNER/STAFF permissions at a trusted boundary.
- Invoice, payment, allocation, expense, and inventory events must be auditable.
- Invoice value, collected payments, outstanding balances, and estimated profit must remain distinct.
- Money calculations need decimal-safe handling, explicit currency, documented rounding, and tests.
- No silent cross-currency aggregation; no consequential AI financial writes without human approval.
- Existing Firebase/Railway resources are protected. No changes, deployment, new cloud resources, or paid services without explicit owner approval.

### Conflicting or unresolved architecture statements
- The current `main` branch's `docs/ARCHITECTURE_BASELINE.md` is marked **Not yet approved** and lists Angular + Firebase Auth/Firestore and Angular + API backend/database as options.
- Open PR #1 describes **Angular + Spring Boot + PostgreSQL/Flyway**.
- The onboarding issue and proposed governance document describe **Python as the intended backend language**, with FastAPI/PostgreSQL not yet approved.
- Therefore, neither Spring Boot nor FastAPI/PostgreSQL should be treated as the approved stack yet. Resolve this conflict in issue #7 before implementation.

## 2. Backend/data architecture options

| Option | Benefits | Costs / risks | Assessment for V0 |
|---|---|---|---|
| Angular + Firebase Auth/Firestore, with carefully designed trusted financial operations | May reuse existing identity infrastructure; less initial service setup | Firestore rules and data model must safely enforce tenant isolation; multi-record financial invariants and reporting need careful design; existing rules are not verified here | Keep as an option only if a concrete security and transaction design proves the requirements |
| Angular + Python API (for example FastAPI) + PostgreSQL | Centralized business rules; SQL transactions/constraints; Python aligns with the stated backend-language direction and future AI/data work | Adds API hosting, database operations, migrations, secrets, backup/recovery, and deployment responsibilities | Plausible candidate, subject to owner approval and cost/operations review |
| Angular + Spring Boot API + PostgreSQL | Mature backend ecosystem; strong validation and transaction patterns; SQL database fits financial records | Conflicts with the Python direction currently recorded in onboarding/governance proposals; separate Java expertise/tooling | Plausible technically, but do not proceed unless the owner explicitly chooses to replace the Python direction |

This table is decision support, not a final selection.

## 3. Decisions required from the owner

Record each decision in issue #7 before scaffolding:
1. **Backend language:** Python or Java/Spring Boot?
2. **Backend framework:** if Python, FastAPI or another framework; if Java, Spring Boot.
3. **Business database:** PostgreSQL or another explicitly selected option.
4. **Identity:** reuse existing Firebase Authentication, or choose another identity approach? Do not change Firebase during this decision.
5. **Authorization source of truth:** where business memberships and OWNER/STAFF roles live, and how every API/data access validates them.
6. **Financial invariants:** payment allocation limits, invoice states/corrections, currency precision, rounding, inventory costing, and audit events.
7. **Local development/testing:** supported runtimes, database setup, test isolation, and CI checks.
8. **Hosting:** defer until local tests and a cost/recovery review are complete, unless there is a separately approved reason to decide earlier.

## 4. Minimum security and finance acceptance tests

Before the first vertical slice is accepted, tests should demonstrate:
- A user from Business A cannot read or mutate Business B records by changing an ID or request payload.
- STAFF cannot perform OWNER-only actions; both allowed and denied cases are tested.
- A payment cannot be allocated beyond its own unallocated amount.
- An invoice cannot be allocated beyond its remaining allocatable balance, except through a separately modeled, auditable credit/refund flow.
- Repeated requests/retries do not duplicate payments or allocations.
- Invoice totals, recorded collections, and outstanding balances reconcile from source records.
- Different currencies are not silently combined.
- Missing cost data is disclosed and estimated profit is not presented as confirmed.
- Issued invoices are corrected/cancelled through an auditable workflow rather than silently overwritten.
- Important financial changes capture actor, business, action, target, timestamp, and AI involvement where applicable.

## 5. Safe next steps

1. Owner records the architecture decisions in issue #7.
2. Update the baseline, ADR, onboarding instructions, and implementation plan consistently in a reviewed PR.
3. Only then create the application skeleton and local test harness.
4. Keep AI integration, hosting selection, production deployment, and any Firebase/Railway changes outside the initial slice until separately reviewed and approved.

**No application code, existing Firebase/Railway resources, paid services, or deployment settings are changed by this decision matrix.**
