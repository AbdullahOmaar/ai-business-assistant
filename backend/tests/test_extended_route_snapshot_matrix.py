"""Per-request full-row snapshots for non-member and STAFF route matrices."""

from uuid import UUID, uuid4

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.api import router as business_router
from app.extended_api import router as extended_business_router
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


def test_nonmember_and_staff_route_matrices_preserve_all_business_rows_per_request():
    """Every denied request and allowed STAFF read must leave tenant rows/audit unchanged."""
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": "route-snapshot-owner"}
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject["value"])

    try:
        client = TestClient(app)
        business = client.post(
            "/api/v1/businesses",
            json={"name": "Per Request Snapshot Workspace", "currency_code": "EGP"},
        )
        assert business.status_code == 201, business.text
        business_id = business.json()["id"]
        customer = client.post(
            f"/api/v1/businesses/{business_id}/customers",
            json={"name": "Snapshot Customer"},
        )
        assert customer.status_code == 201, customer.text
        customer_id = customer.json()["id"]
        staff_subject = "route-snapshot-staff"
        with app.state.session_factory() as session:
            session.add(BusinessMembership(
                business_id=UUID(business_id),
                user_subject=staff_subject,
                role=MembershipRole.STAFF,
            ))
            session.commit()

        base = f"/api/v1/businesses/{business_id}"

        def use_subject(value: str) -> None:
            subject["value"] = value

        def business_snapshot():
            with app.state.session_factory() as session:
                snapshot = []
                for table in Base.metadata.sorted_tables:
                    if "business_id" in table.c:
                        statement = table.select().where(
                            table.c.business_id == UUID(business_id)
                        )
                    elif table.name == "businesses":
                        statement = table.select().where(
                            table.c.id == UUID(business_id)
                        )
                    else:
                        continue
                    primary_key = list(table.primary_key.columns)
                    if primary_key:
                        statement = statement.order_by(*primary_key)
                    snapshot.append((
                        table.name,
                        tuple(tuple(row) for row in session.execute(statement).all()),
                    ))
                return tuple(snapshot)

        def assert_response_without_side_effects(
            *, actor: str, method: str, url: str, expected_status: int, payload=None,
            content=None, headers=None,
        ) -> None:
            use_subject(actor)
            before = business_snapshot()
            if content is not None:
                response = getattr(client, method)(url, content=content, headers=headers)
            elif payload is not None:
                response = getattr(client, method)(url, json=payload)
            else:
                response = getattr(client, method)(url)
            assert response.status_code == expected_status, (
                f"{actor} {method.upper()} {url}: expected {expected_status}, "
                f"got {response.status_code}: {response.text}"
            )
            assert business_snapshot() == before, (
                f"{actor} {method.upper()} {url} changed business rows or AuditEvent"
            )

        nonmember_requests = [
            ("get", f"{base}/operations/health", None, None),
            ("get", f"{base}/reports/tax-summary", None, None),
            ("post", f"{base}/purchase-orders/{uuid4()}/approve", None, None),
            ("post", f"{base}/imports/customers.csv/preview", None, "name\nOutsider\n"),
            ("get", f"{base}/reports/receivables-aging", None, None),
            ("get", f"{base}/customers/{uuid4()}/statement", None, None),
            ("get", f"{base}/audit-events", None, None),
            ("get", f"{base}/reports/data-integrity", None, None),
        ]
        for method, url, payload, csv_content in nonmember_requests:
            assert_response_without_side_effects(
                actor="route-snapshot-outsider",
                method=method,
                url=url,
                expected_status=403,
                payload=payload,
                content=csv_content,
                headers={"content-type": "text/csv"} if csv_content is not None else None,
            )

        staff_denials = [
            ("get", f"{base}/operations/health"),
            ("post", f"{base}/imports/customers.csv/preview"),
            ("get", f"{base}/audit-events"),
            ("get", f"{base}/reports/data-integrity"),
        ]
        for method, url in staff_denials:
            assert_response_without_side_effects(
                actor=staff_subject,
                method=method,
                url=url,
                expected_status=403,
                content="name\nStaff Preview\n" if method == "post" else None,
                headers={"content-type": "text/csv"} if method == "post" else None,
            )

        staff_allowed_reads = [
            ("get", f"{base}/reports/tax-summary"),
            ("get", f"{base}/reports/receivables-aging"),
            ("get", f"{base}/customers/{customer_id}/statement"),
        ]
        for method, url in staff_allowed_reads:
            assert_response_without_side_effects(
                actor=staff_subject,
                method=method,
                url=url,
                expected_status=200,
            )

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



def test_supplier_create_route_is_registered_once_on_canonical_service_handler():
    """The assembled FastAPI app must expose one canonical supplier-create route."""
    path = "/api/v1/businesses/{business_id}/suppliers"
    # Inspect the source routers directly: recent FastAPI versions defer
    # include_router expansion, so app.routes is not a stable flattened list.
    routes = [
        route
        for router in (business_router, extended_business_router)
        for route in router.routes
        if isinstance(route, APIRoute)
        and "POST" in (route.methods or set())
        and route.path == path
    ]

    assert len(routes) == 1, (
        "Supplier create must be registered exactly once; duplicate router handlers "
        "can shadow different service/validation behavior"
    )
    assert routes[0].endpoint.__module__ == "app.api"
    assert routes[0].endpoint.__name__ == "post_supplier"
    assert "post" in app.openapi()["paths"][path]
