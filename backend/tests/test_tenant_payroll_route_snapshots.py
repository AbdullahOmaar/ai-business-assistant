"""Full-row tenant-isolation snapshots for employee and payroll route denials."""

from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


def test_employee_payroll_denials_preserve_all_business_rows_and_audit_events():
    """STAFF/non-members and foreign owners cannot mutate/read another tenant's payroll."""
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": "payroll-tenant-a-owner"}
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject["value"])

    try:
        client = TestClient(app)

        def use_subject(value: str) -> None:
            subject["value"] = value

        def create_business(owner: str, name: str) -> str:
            use_subject(owner)
            response = client.post(
                "/api/v1/businesses",
                json={"name": name, "currency_code": "EGP"},
            )
            assert response.status_code == 201, response.text
            return response.json()["id"]

        def create_employee(business_id: str, name: str) -> str:
            response = client.post(
                f"/api/v1/businesses/{business_id}/employees",
                json={"name": name, "monthly_salary": "5000.00"},
            )
            assert response.status_code == 201, response.text
            return response.json()["id"]

        def create_payroll(business_id: str, employee_id: str, period: str) -> str:
            response = client.post(
                f"/api/v1/businesses/{business_id}/employees/{employee_id}/payroll",
                json={"period": period},
            )
            assert response.status_code == 201, response.text
            return response.json()["id"]

        business_a = create_business("payroll-tenant-a-owner", "Payroll Tenant A")
        employee_a = create_employee(business_a, "Tenant A Employee")
        payroll_a = create_payroll(business_a, employee_a, "2026-10")

        business_b = create_business("payroll-tenant-b-owner", "Payroll Tenant B")
        employee_b = create_employee(business_b, "Tenant B Employee")
        payroll_b = create_payroll(business_b, employee_b, "2026-10")

        staff_subject = "payroll-tenant-a-staff"
        with app.state.session_factory() as session:
            session.add(BusinessMembership(
                business_id=UUID(business_a),
                user_subject=staff_subject,
                role=MembershipRole.STAFF,
            ))
            session.commit()

        business_ids = (UUID(business_a), UUID(business_b))

        def all_business_rows():
            """Snapshot every business row, including Business and AuditEvent."""
            with app.state.session_factory() as session:
                result = []
                for table in Base.metadata.sorted_tables:
                    if "business_id" in table.c:
                        statement = table.select().where(
                            table.c.business_id.in_(business_ids)
                        )
                    elif table.name == "businesses":
                        statement = table.select().where(
                            table.c.id.in_(business_ids)
                        )
                    else:
                        continue
                    primary_key = list(table.primary_key.columns)
                    if primary_key:
                        statement = statement.order_by(*primary_key)
                    result.append((
                        table.name,
                        tuple(tuple(row) for row in session.execute(statement).all()),
                    ))
                return tuple(result)

        def assert_denied_without_side_effects(
            *, actor: str, method: str, url: str, expected_status: int, payload=None
        ) -> None:
            use_subject(actor)
            before = all_business_rows()
            response = getattr(client, method)(url, json=payload) if payload is not None else getattr(client, method)(url)
            assert response.status_code == expected_status, (
                f"{actor} {method.upper()} {url}: expected {expected_status}, "
                f"got {response.status_code}: {response.text}"
            )
            assert all_business_rows() == before, (
                f"{actor} {method.upper()} {url} changed a business row or AuditEvent"
            )

        base_a = f"/api/v1/businesses/{business_a}"
        base_b = f"/api/v1/businesses/{business_b}"
        protected_a = [
            ("get", f"{base_a}/employees", None),
            ("get", f"{base_a}/payroll", None),
            ("post", f"{base_a}/employees", {"name": "Injected Employee", "monthly_salary": "1.00"}),
            ("patch", f"{base_a}/employees/{employee_a}", {"name": "Unauthorized Rename"}),
            ("post", f"{base_a}/employees/{employee_a}/payroll", {"period": "2026-11"}),
            ("patch", f"{base_a}/payroll/{payroll_a}", {"allowances": "1.00"}),
            ("post", f"{base_a}/payroll/{payroll_a}/approve", None),
            ("post", f"{base_a}/payroll/{payroll_a}/pay", None),
        ]

        for actor in ("payroll-tenant-a-outsider", staff_subject):
            for method, url, payload in protected_a:
                assert_denied_without_side_effects(
                    actor=actor, method=method, url=url, expected_status=403, payload=payload
                )

        foreign_attempts = [
            ("patch", f"{base_b}/employees/{employee_a}", {"name": "Cross-Tenant Rename"}),
            ("post", f"{base_b}/employees/{employee_a}/payroll", {"period": "2026-11"}),
            ("patch", f"{base_b}/payroll/{payroll_a}", {"allowances": "999.00"}),
            ("post", f"{base_b}/payroll/{payroll_a}/approve", None),
            ("post", f"{base_b}/payroll/{payroll_a}/pay", None),
        ]
        for method, url, payload in foreign_attempts:
            assert_denied_without_side_effects(
                actor="payroll-tenant-b-owner",
                method=method,
                url=url,
                expected_status=404,
                payload=payload,
            )

        # Positive controls: each OWNER sees only its own employee and payroll.
        use_subject("payroll-tenant-a-owner")
        employees_a = client.get(f"{base_a}/employees")
        payrolls_a = client.get(f"{base_a}/payroll")
        assert employees_a.status_code == 200, employees_a.text
        assert payrolls_a.status_code == 200, payrolls_a.text
        assert [row["id"] for row in employees_a.json()] == [employee_a]
        assert [row["id"] for row in payrolls_a.json()] == [payroll_a]

        use_subject("payroll-tenant-b-owner")
        employees_b = client.get(f"{base_b}/employees")
        payrolls_b = client.get(f"{base_b}/payroll")
        assert employees_b.status_code == 200, employees_b.text
        assert payrolls_b.status_code == 200, payrolls_b.text
        assert [row["id"] for row in employees_b.json()] == [employee_b]
        assert [row["id"] for row in payrolls_b.json()] == [payroll_b]

    finally:
        if previous_factory is None:
            if hasattr(app.state, "session_factory"):
                del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            if hasattr(app.state, "principal_resolver"):
                del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
        engine.dispose()
