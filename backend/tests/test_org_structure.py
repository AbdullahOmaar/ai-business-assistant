"""Org structure (C8 Part 1, 3A-392): departments, teams, assignment.

Departments nest via parent_id (a parent cycle is rejected); a team
belongs to exactly one department. Employees and memberships carry
nullable assignment FKs. Assignment replaces both slots: a team
implies its department, a department alone clears the team, nulls
clear both. Writes are owner-only; reads are open to any member.
"""
from __future__ import annotations

from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AuditEvent,
    Base,
    Business,
    BusinessMembership,
    MembershipRole,
)
from app.security import AuthenticatedPrincipal


def _environment():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.session_factory = factory
    subject = {"value": "org-owner"}

    def resolver(request):
        return AuthenticatedPrincipal(subject["value"])

    app.state.principal_resolver = resolver
    return factory, subject, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def _make_business(client) -> UUID:
    business = client.post(
        "/api/v1/businesses", json={"name": "Org Centre", "currency_code": "EGP"}
    )
    assert business.status_code == 201, business.text
    return UUID(business.json()["id"])


def _make_employee(client, business_id) -> UUID:
    employee = client.post(
        f"/api/v1/businesses/{business_id}/employees",
        json={"name": "Mona", "monthly_salary": "7000.00"},
    )
    assert employee.status_code == 201, employee.text
    return UUID(employee.json()["id"])


def _make_staff(factory, business_id) -> str:
    staff_subject = f"org-staff-{uuid4()}"
    with factory() as session:
        session.add(BusinessMembership(
            business_id=business_id,
            user_subject=staff_subject,
            role=MembershipRole.STAFF,
        ))
        session.commit()
    return staff_subject


def _department(client, business_id, name, parent_id=None):
    body = {"name": name}
    if parent_id is not None:
        body["parent_id"] = str(parent_id)
    return client.post(f"/api/v1/businesses/{business_id}/departments", json=body)


def test_department_create_duplicate_and_list():
    _factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)

        created = _department(client, business_id, "Sales")
        assert created.status_code == 201, created.text
        assert created.json()["name"] == "Sales"
        assert created.json()["parent_id"] is None

        duplicate = _department(client, business_id, "Sales")
        assert duplicate.status_code == 409, duplicate.text

        listed = client.get(f"/api/v1/businesses/{business_id}/departments")
        assert listed.status_code == 200, listed.text
        assert [row["name"] for row in listed.json()] == ["Sales"]
    finally:
        _restore(previous_factory, previous_resolver)


def test_department_nesting_and_parent_cycle_rejected():
    _factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)

        parent = _department(client, business_id, "Operations")
        parent_id = UUID(parent.json()["id"])
        child = _department(client, business_id, "Logistics", parent_id=parent_id)
        assert child.status_code == 201, child.text
        child_id = UUID(child.json()["id"])

        self_parent = client.patch(
            f"/api/v1/businesses/{business_id}/departments/{parent_id}",
            json={"parent_id": str(parent_id)},
        )
        assert self_parent.status_code == 422, self_parent.text

        descendant_parent = client.patch(
            f"/api/v1/businesses/{business_id}/departments/{parent_id}",
            json={"parent_id": str(child_id)},
        )
        assert descendant_parent.status_code == 422, descendant_parent.text

        renamed = client.patch(
            f"/api/v1/businesses/{business_id}/departments/{child_id}",
            json={"name": "Fleet"},
        )
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["name"] == "Fleet"
    finally:
        _restore(previous_factory, previous_resolver)


def test_team_create_and_department_scope():
    _factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)
        department_id = UUID(_department(client, business_id, "Sales").json()["id"])

        team = client.post(
            f"/api/v1/businesses/{business_id}/teams",
            json={"name": "Retail", "department_id": str(department_id)},
        )
        assert team.status_code == 201, team.text
        assert team.json()["department_id"] == str(department_id)

        missing_department = client.post(
            f"/api/v1/businesses/{business_id}/teams",
            json={"name": "Ghost", "department_id": str(uuid4())},
        )
        assert missing_department.status_code == 404, missing_department.text

        listed = client.get(
            f"/api/v1/businesses/{business_id}/teams",
            params={"department_id": str(department_id)},
        )
        assert listed.status_code == 200, listed.text
        assert [row["name"] for row in listed.json()] == ["Retail"]
    finally:
        _restore(previous_factory, previous_resolver)


def test_employee_assignment_team_implies_department_and_mismatch():
    factory, subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)
        employee_id = _make_employee(client, business_id)
        sales_id = UUID(_department(client, business_id, "Sales").json()["id"])
        ops_id = UUID(_department(client, business_id, "Operations").json()["id"])
        team_id = UUID(client.post(
            f"/api/v1/businesses/{business_id}/teams",
            json={"name": "Retail", "department_id": str(sales_id)},
        ).json()["id"])

        mismatch = client.post(
            f"/api/v1/businesses/{business_id}/employees/{employee_id}/assign",
            json={"department_id": str(ops_id), "team_id": str(team_id)},
        )
        assert mismatch.status_code == 422, mismatch.text

        assigned = client.post(
            f"/api/v1/businesses/{business_id}/employees/{employee_id}/assign",
            json={"team_id": str(team_id)},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["department_id"] == str(sales_id)
        assert assigned.json()["team_id"] == str(team_id)

        cleared = client.post(
            f"/api/v1/businesses/{business_id}/employees/{employee_id}/assign",
            json={"department_id": None, "team_id": None},
        )
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["department_id"] is None
        assert cleared.json()["team_id"] is None

        staff_subject = _make_staff(factory, business_id)
        subject["value"] = staff_subject
        forbidden = client.post(
            f"/api/v1/businesses/{business_id}/employees/{employee_id}/assign",
            json={"department_id": str(sales_id)},
        )
        assert forbidden.status_code == 403, forbidden.text
    finally:
        _restore(previous_factory, previous_resolver)


def test_membership_assignment_and_audit_events():
    factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)
        department_id = UUID(_department(client, business_id, "Sales").json()["id"])
        staff_subject = _make_staff(factory, business_id)

        with factory() as session:
            membership = session.execute(
                select(BusinessMembership).where(
                    BusinessMembership.business_id == business_id,
                    BusinessMembership.user_subject == staff_subject,
                )
            ).scalar_one()
            membership_id = membership.id

        assigned = client.post(
            f"/api/v1/businesses/{business_id}/memberships/{membership_id}/assign",
            json={"department_id": str(department_id)},
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["department_id"] == str(department_id)

        with factory() as session:
            actions = [
                row.action for row in session.execute(
                    select(AuditEvent).where(
                        AuditEvent.business_id == business_id
                    )
                ).scalars().all()
            ]
        assert "department.created" in actions
        assert "membership.assigned" in actions
    finally:
        _restore(previous_factory, previous_resolver)


def test_org_entities_in_business_export():
    factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        from app.business_export import build_business_export

        client = TestClient(app, raise_server_exceptions=False)
        business_id = _make_business(client)
        department_id = UUID(_department(client, business_id, "Sales").json()["id"])
        client.post(
            f"/api/v1/businesses/{business_id}/teams",
            json={"name": "Retail", "department_id": str(department_id)},
        )

        with factory() as session:
            business = session.get(Business, business_id)
            exported = build_business_export(session, business, exported_by="org-owner")
        assert exported["manifest"]["counts"]["departments"] == 1
        assert exported["manifest"]["counts"]["teams"] == 1
    finally:
        _restore(previous_factory, previous_resolver)
