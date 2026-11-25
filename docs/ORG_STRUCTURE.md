# Org structure — departments, teams, assignment (C8 Part 1)

Phase 2, Stage C — C8 (3A-392). Part 1 ships the backend only: the
org model, the assignment endpoints, and the audit trail. The UI
(multi-select in lists, org screens) is deferred to coordination with
the assistant-execution chat per the owner's 2026-11-25 redistribution
— same pattern as the deferred settings-screen UI in B3.

## Model

- **Department** — business-scoped, name unique per business, optional
  `parent_id` (nesting). A department cannot be its own parent or
  descendant; the API rejects a parent cycle with 422.
- **Team** — business-scoped, belongs to exactly one department, name
  unique per (business, department).
- **Assignment** — `Employee` and `BusinessMembership` carry nullable
  `department_id` / `team_id` FKs (ondelete SET NULL). The legacy
  free-text `Employee.department` column is untouched and is not read
  by these endpoints; the FKs are the authoritative structure.

Migration `0014_org_structure` (down_revision `0013_cashbox`):
two new tables + four nullable columns. Additive only.

## Endpoints (all under `/api/v1/businesses/{business_id}`)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/departments` | Owner | 201; duplicate name → 409 |
| GET | `/departments` | Any member | Ordered by name |
| PATCH | `/departments/{department_id}` | Owner | Rename / reparent; explicit `parent_id: null` clears the parent |
| POST | `/teams` | Owner | 201; department must exist in the business (404) |
| GET | `/teams` | Any member | Optional `?department_id` filter |
| PATCH | `/teams/{team_id}` | Owner | Rename / move to another department |
| POST | `/employees/{employee_id}/assign` | Owner | Full-replace assignment (see below) |
| POST | `/memberships/{membership_id}/assign` | Owner | Full-replace assignment (see below) |

**Assignment semantics (both assign endpoints):** the request replaces
both slots. Sending a team implies its department; sending only a
department clears the team; sending nulls clears both. A team that
does not belong to the given department is rejected with 422.

**Audit:** every write records an AuditEvent with the name only in the
summary — `department.created`, `department.updated`, `org_team.created`,
`org_team.updated`, `employee.assigned`, `membership.assigned` (targets
`department` / `team`; `employee` / `membership` already existed).

**Export:** `departments` and `teams` are included in the full business
export (28 entities now).

## What Part 1 deliberately does NOT do

- No department/team DELETE endpoint (deletion with assigned members is
  a separate decision; assignment can be cleared instead).
- No bulk operations — those are C8 Part 2 (per 3A-686: multi-select in
  lists; export / cancel / status change; no bulk financial deletion
  without a separate confirmation).
- No UI — see the note at the top.

## Validation

- `backend/tests/test_org_structure.py` — 6 tests (create/duplicate,
  nesting + cycle rejection, team scoping, assignment rules + 403 for
  staff, membership assignment + audit events, export counts).
- Route matrix: 106 routes (8 added); the route-table test enumerates
  `org_api.router` alongside the other routers.
