"""Business org structure: departments, teams, and assignment (C8 Part 1).

Departments may nest via parent_id; a team belongs to exactly one
department. Employees and memberships carry nullable assignment FKs
(the free-text Employee.department column stays as legacy display text
and is not read by these endpoints). Assignment replaces both slots:
sending a team implies its department, sending only a department clears
the team, sending nulls clears both.

Writes are owner-only; reads are open to any business member.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import (
    AuditEvent,
    BusinessMembership,
    Department,
    Employee,
    MembershipRole,
    Team,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["org structure"])


def _owner(session: Session, principal: AuthenticatedPrincipal, business_id: UUID) -> None:
    try:
        authorize_membership(
            session, principal=principal, business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
    except AuthorizationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def _member(session: Session, principal: AuthenticatedPrincipal, business_id: UUID) -> None:
    try:
        authorize_membership(session, principal=principal, business_id=business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def _commit(session: Session, action):
    try:
        result = action()
        session.commit()
        return result
    except HTTPException:
        session.rollback()
        raise
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The operation conflicts with existing org data.",
        ) from exc
    except Exception:
        session.rollback()
        raise


def _audit(session: Session, business_id: UUID, actor: str, action: str,
           target_type: str, target_id: UUID, summary: str) -> None:
    session.add(AuditEvent(
        business_id=business_id,
        actor_subject=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        change_summary=summary,
    ))


def _department_dict(department: Department) -> dict:
    return {
        "id": str(department.id),
        "business_id": str(department.business_id),
        "name": department.name,
        "parent_id": str(department.parent_id) if department.parent_id else None,
        "created_at": department.created_at.isoformat() if department.created_at else None,
        "updated_at": department.updated_at.isoformat() if department.updated_at else None,
    }


def _team_dict(team: Team) -> dict:
    return {
        "id": str(team.id),
        "business_id": str(team.business_id),
        "department_id": str(team.department_id),
        "name": team.name,
        "created_at": team.created_at.isoformat() if team.created_at else None,
        "updated_at": team.updated_at.isoformat() if team.updated_at else None,
    }


def _get_department(session: Session, business_id: UUID, department_id: UUID) -> Department:
    department = session.get(Department, department_id)
    if department is None or department.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return department


def _get_team(session: Session, business_id: UUID, team_id: UUID) -> Team:
    team = session.get(Team, team_id)
    if team is None or team.business_id != business_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


def _check_parent_cycle(session: Session, business_id: UUID,
                        department_id: UUID, parent_id: UUID) -> None:
    """Reject a parent that is the department itself or one of its descendants."""
    current_id: UUID | None = parent_id
    seen: set[UUID] = set()
    while current_id is not None:
        if current_id == department_id or current_id in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A department cannot be its own parent or descendant.",
            )
        seen.add(current_id)
        parent = session.get(Department, current_id)
        if parent is None or parent.business_id != business_id:
            break
        current_id = parent.parent_id


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    parent_id: UUID | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class DepartmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: UUID | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TeamCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    department_id: UUID

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class TeamUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    department_id: UUID | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class AssignmentRequest(BaseModel):
    """Full-replace assignment: null clears a slot; a team implies its department."""

    model_config = ConfigDict(extra="forbid")

    department_id: UUID | None = None
    team_id: UUID | None = None


def _resolve_assignment(session: Session, business_id: UUID,
                        request: AssignmentRequest) -> tuple[UUID | None, UUID | None]:
    department_id = request.department_id
    team_id = request.team_id
    team = None
    if team_id is not None:
        team = _get_team(session, business_id, team_id)
    if department_id is not None:
        _get_department(session, business_id, department_id)
    if team is not None:
        if department_id is not None and team.department_id != department_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The team does not belong to the given department.",
            )
        department_id = team.department_id
    elif department_id is not None:
        team_id = None
    return department_id, team_id


@router.post("/departments", status_code=201)
def create_department(
    business_id: UUID,
    payload: DepartmentCreate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)

    def operation():
        if payload.parent_id is not None:
            _get_department(session, business_id, payload.parent_id)
        department = Department(
            business_id=business_id, name=payload.name, parent_id=payload.parent_id,
        )
        session.add(department)
        session.flush()
        _audit(session, business_id, principal.subject, "department.created",
               "department", department.id, f"Department created: {department.name}")
        return _department_dict(department)

    return _commit(session, operation)


@router.get("/departments")
def list_departments(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _member(session, principal, business_id)
    rows = session.execute(
        select(Department)
        .where(Department.business_id == business_id)
        .order_by(Department.name)
    ).scalars().all()
    return [_department_dict(row) for row in rows]


@router.patch("/departments/{department_id}")
def update_department(
    business_id: UUID,
    department_id: UUID,
    payload: DepartmentUpdate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)

    def operation():
        department = _get_department(session, business_id, department_id)
        if payload.parent_id is not None:
            _get_department(session, business_id, payload.parent_id)
            _check_parent_cycle(session, business_id, department_id, payload.parent_id)
        if payload.name is not None:
            department.name = payload.name
        if "parent_id" in payload.model_fields_set:
            department.parent_id = payload.parent_id
        session.flush()
        _audit(session, business_id, principal.subject, "department.updated",
               "department", department.id, f"Department updated: {department.name}")
        return _department_dict(department)

    return _commit(session, operation)


@router.post("/teams", status_code=201)
def create_team(
    business_id: UUID,
    payload: TeamCreate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)

    def operation():
        _get_department(session, business_id, payload.department_id)
        team = Team(
            business_id=business_id,
            department_id=payload.department_id,
            name=payload.name,
        )
        session.add(team)
        session.flush()
        _audit(session, business_id, principal.subject, "org_team.created",
               "team", team.id, f"Team created: {team.name}")
        return _team_dict(team)

    return _commit(session, operation)


@router.get("/teams")
def list_teams(
    business_id: UUID,
    department_id: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _member(session, principal, business_id)
    query = select(Team).where(Team.business_id == business_id)
    if department_id is not None:
        _get_department(session, business_id, department_id)
        query = query.where(Team.department_id == department_id)
    rows = session.execute(query.order_by(Team.name)).scalars().all()
    return [_team_dict(row) for row in rows]


@router.patch("/teams/{team_id}")
def update_team(
    business_id: UUID,
    team_id: UUID,
    payload: TeamUpdate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)

    def operation():
        team = _get_team(session, business_id, team_id)
        if payload.department_id is not None:
            _get_department(session, business_id, payload.department_id)
            team.department_id = payload.department_id
        if payload.name is not None:
            team.name = payload.name
        session.flush()
        _audit(session, business_id, principal.subject, "org_team.updated",
               "team", team.id, f"Team updated: {team.name}")
        return _team_dict(team)

    return _commit(session, operation)


@router.post("/employees/{employee_id}/assign")
def assign_employee(
    business_id: UUID,
    employee_id: UUID,
    payload: AssignmentRequest,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)

    def operation():
        employee = session.get(Employee, employee_id)
        if employee is None or employee.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
        department_id, team_id = _resolve_assignment(session, business_id, payload)
        employee.department_id = department_id
        employee.team_id = team_id
        session.flush()
        _audit(session, business_id, principal.subject, "employee.assigned",
               "employee", employee.id, f"Employee assigned: {employee.name}")
        return {
            "employee_id": str(employee.id),
            "department_id": str(department_id) if department_id else None,
            "team_id": str(team_id) if team_id else None,
        }

    return _commit(session, operation)


@router.post("/memberships/{membership_id}/assign")
def assign_membership(
    business_id: UUID,
    membership_id: UUID,
    payload: AssignmentRequest,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)

    def operation():
        membership = session.get(BusinessMembership, membership_id)
        if membership is None or membership.business_id != business_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
        department_id, team_id = _resolve_assignment(session, business_id, payload)
        membership.department_id = department_id
        membership.team_id = team_id
        session.flush()
        _audit(session, business_id, principal.subject, "membership.assigned",
               "membership", membership.id,
               f"Membership assigned: {membership.user_subject}")
        return {
            "membership_id": str(membership.id),
            "department_id": str(department_id) if department_id else None,
            "team_id": str(team_id) if team_id else None,
        }

    return _commit(session, operation)
