"""3A-376 part 3: the full route x role x tenant denial matrix (issue #276).

Every business-scoped and platform-admin route is fired as four actors —
unauthenticated, authenticated non-member, the owner of ANOTHER business
(cross-tenant), and a STAFF member of the target business — against a
two-business fixture seeded with real records. Denied requests must return
the pinned status AND leave every business-scoped row of BOTH businesses
byte-identical (the full-row snapshot discipline of
test_extended_route_snapshot_matrix.py, generalized to the whole API).
STAFF-allowed rows pin the documented membership-level surface.

A second test enumerates the live route table from the routers and asserts
it equals this registry exactly: a route added without a matrix entry (or
removed without updating it) fails the suite, so the matrix cannot
silently rot again. Excluded from the matrix, with their own coverage:
the three public operational routes (health/readyz/version), POST
/businesses (no tenant exists yet; principal-only) and POST
/invitations/accept (token-based, covered by
test_membership_invitations_api.py).
"""

from uuid import UUID, uuid4

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import (
    api,
    assistant_api,
    core_features_api,
    demo_auth_api,
    employee_payroll_api,
    extended_api,
    platform_admin_api,
    purchasing_api,
)
from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

# staff: "allow" = membership suffices (expect 200/201); "deny" = owner-only
# or platform-grant-only (expect 403). Non-member and cross-tenant actors
# are denied (403) on EVERY row; unauthenticated is 401 on every row.
MATRIX = [
    # method, path template, staff expectation
    ("GET", "/api/v1/businesses", "allow"),
    ("GET", "/api/v1/businesses/{business_id}", "allow"),
    ("PATCH", "/api/v1/businesses/{business_id}", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/memberships", "deny"),
    ("PATCH", "/api/v1/businesses/{business_id}/memberships/{membership_id}", "deny"),
    ("DELETE", "/api/v1/businesses/{business_id}/memberships/{membership_id}", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/invitations", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/invitations", "deny"),
    ("DELETE", "/api/v1/businesses/{business_id}/invitations/{invitation_id}", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/dashboard", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/profit-loss", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/customers", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/suppliers", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/products", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/invoices", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/duplicate", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/invoices/issue", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", "deny"),
    ("PATCH", "/api/v1/businesses/{business_id}/invoices/{invoice_id}", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/void", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/stock-movements", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/payments", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/expenses", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/expenses", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/suppliers", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/purchase-orders", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/purchase-orders", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/duplicate", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/approve", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}", "allow"),
    ("PUT", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/cancel", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receipts", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/activity", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/inventory/movements", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/sales-returns", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/sales-returns", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/sales-returns/{return_id}/approve", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/sales-returns/{return_id}/credit-note", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/credit-notes", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/recurring-invoices", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/recurring-invoices", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/pricing-rules", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/notifications", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/notifications", "allow"),
    ("PUT", "/api/v1/businesses/{business_id}/settings/{setting_key}", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/reports/summary", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/reports/tax-summary", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/reports/receivables-aging", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/reports/data-integrity", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/exports/{entity_type}.csv", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/imports/{entity_type}.csv/preview", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/imports/{entity_type}.csv", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/customers", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/customers/{customer_id}", "allow"),
    ("PATCH", "/api/v1/businesses/{business_id}/customers/{customer_id}", "allow"),
    ("DELETE", "/api/v1/businesses/{business_id}/customers/{customer_id}", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/products", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/products/{product_id}", "allow"),
    ("PATCH", "/api/v1/businesses/{business_id}/products/{product_id}", "deny"),
    ("DELETE", "/api/v1/businesses/{business_id}/products/{product_id}", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/payments", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/invoices", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/invoices/{invoice_id}", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/assistant/insights", "allow"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/chat", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/customers/{customer_id}/statement", "allow"),
    ("GET", "/api/v1/businesses/{business_id}/audit-events", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/operations/health", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/employees", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/employees", "deny"),
    ("PATCH", "/api/v1/businesses/{business_id}/employees/{employee_id}", "deny"),
    ("GET", "/api/v1/businesses/{business_id}/payroll", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/employees/{employee_id}/payroll", "deny"),
    ("PATCH", "/api/v1/businesses/{business_id}/payroll/{payroll_id}", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/payroll/{payroll_id}/approve", "deny"),
    ("POST", "/api/v1/businesses/{business_id}/payroll/{payroll_id}/pay", "deny"),
    ("GET", "/api/v1/platform-admin/access", "deny"),
    ("GET", "/api/v1/platform-admin/system-status", "deny"),
    ("GET", "/api/v1/platform-admin/overview", "deny"),
    ("GET", "/api/v1/platform-admin/businesses", "deny"),
    ("GET", "/api/v1/platform-admin/businesses/{business_id}", "deny"),
    ("PATCH", "/api/v1/platform-admin/businesses/{business_id}/status", "deny"),
    ("GET", "/api/v1/platform-admin/audit-events", "deny"),
    ("GET", "/api/v1/platform-admin/audit-events/export.csv", "deny"),
    ("GET", "/api/v1/platform-admin/users", "deny"),
    ("POST", "/api/v1/platform-admin/users/{user_uid}/roles", "deny"),
    ("GET", "/api/v1/platform-admin/role-audit-events", "deny"),
]

EXCLUDED_FROM_MATRIX = {
    ("GET", "/health"),
    ("GET", "/readyz"),
    ("GET", "/version"),
    ("POST", "/api/v1/businesses"),
    ("POST", "/api/v1/invitations/accept"),
    # Public by design (the demo account's shared credentials are
    # intentional); covered by test_demo_auth_api.py.
    ("POST", "/api/v1/demo/session"),
}


def _live_route_table() -> set[tuple[str, str]]:
    table: set[tuple[str, str]] = set()
    for router in (
        app.router,
        core_features_api.router,
        api.router,
        extended_api.router,
        assistant_api.router,
        platform_admin_api.router,
        employee_payroll_api.router,
        purchasing_api.router,
        demo_auth_api.router,
    ):
        for route in router.routes:
            if isinstance(route, APIRoute):
                for method in route.methods - {"HEAD", "OPTIONS"}:
                    table.add((method, route.path))
    return table


def test_route_table_matches_matrix_registry():
    """The registry IS the route table (minus the named exclusions)."""
    live = _live_route_table()
    registered = {(method, path) for method, path, _staff in MATRIX} | EXCLUDED_FROM_MATRIX
    assert live == registered, (
        f"routes without a matrix entry: {sorted(live - registered)}; "
        f"registry entries with no live route: {sorted(registered - live)}"
    )


def test_full_route_role_tenant_denial_matrix():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": "matrix-owner-a"}
    authenticated = {"value": True}

    def resolver(request):
        if not authenticated["value"]:
            return None
        return AuthenticatedPrincipal(subject["value"])

    app.state.principal_resolver = resolver
    try:
        client = TestClient(app, raise_server_exceptions=False)

        def as_user(value: str) -> None:
            subject["value"] = value
            authenticated["value"] = True

        # --- Seed business A (owner-a) with real records -------------------
        as_user("matrix-owner-a")
        business_a = client.post(
            "/api/v1/businesses", json={"name": "Matrix A", "currency_code": "EGP"}
        )
        assert business_a.status_code == 201, business_a.text
        a_id = business_a.json()["id"]
        customer_id = client.post(
            f"/api/v1/businesses/{a_id}/customers", json={"name": "Customer A"}
        ).json()["id"]
        supplier_id = client.post(
            f"/api/v1/businesses/{a_id}/suppliers", json={"name": "Supplier A"}
        ).json()["id"]
        product_id = client.post(
            f"/api/v1/businesses/{a_id}/products",
            json={
                "name": "Product A", "unit_price": "10.00",
                "is_stock_tracked": True, "opening_quantity": "10",
            },
        ).json()["id"]
        draft_invoice = client.post(
            f"/api/v1/businesses/{a_id}/invoices",
            json={
                "invoice_number": "INV-DRAFT",
                "currency_code": "EGP",
                "customer_id": customer_id,
                "lines": [{"product_id": product_id, "quantity": "1", "unit_price": "10.00"}],
            },
        )
        assert draft_invoice.status_code == 201, draft_invoice.text
        draft_invoice_id = draft_invoice.json()["id"]
        issued_invoice = client.post(
            f"/api/v1/businesses/{a_id}/invoices",
            json={
                "invoice_number": "INV-ISSUED",
                "currency_code": "EGP",
                "customer_id": customer_id,
                "lines": [{"product_id": product_id, "quantity": "1", "unit_price": "10.00"}],
            },
        ).json()
        issued_invoice_id = issued_invoice["id"]
        issue = client.post(
            f"/api/v1/businesses/{a_id}/invoices/{issued_invoice_id}/issue", json={}
        )
        assert issue.status_code == 200, issue.text
        issued_detail = client.get(f"/api/v1/businesses/{a_id}/invoices/{issued_invoice_id}")
        issued_line_id = issued_detail.json()["lines"][0]["id"]
        purchase_order = client.post(
            f"/api/v1/businesses/{a_id}/purchase-orders",
            json={
                "supplier_id": supplier_id,
                "order_number": "PO-A",
                "currency_code": "EGP",
                "lines": [{"product_id": product_id, "quantity": "1", "unit_cost": "5.00"}],
            },
        )
        assert purchase_order.status_code == 201, purchase_order.text
        purchase_order_id = purchase_order.json()["id"]
        employee = client.post(
            f"/api/v1/businesses/{a_id}/employees",
            json={"name": "Employee A", "monthly_salary": "1000"},
        )
        assert employee.status_code == 201, employee.text
        employee_id = employee.json()["id"]
        payroll = client.post(
            f"/api/v1/businesses/{a_id}/employees/{employee_id}/payroll",
            json={"period": "2026-01"},
        )
        assert payroll.status_code == 201, payroll.text
        payroll_id = payroll.json()["id"]
        with app.state.session_factory() as session:
            session.add(
                BusinessMembership(
                    business_id=UUID(a_id),
                    user_subject="matrix-staff-a",
                    role=MembershipRole.STAFF,
                )
            )
            session.commit()
            staff_membership_id = str(
                session.query(BusinessMembership)
                .filter_by(user_subject="matrix-staff-a")
                .first()
                .id
            )

        # --- Business B: the cross-tenant actor's own workspace ------------
        as_user("matrix-owner-b")
        business_b = client.post(
            "/api/v1/businesses", json={"name": "Matrix B", "currency_code": "EGP"}
        )
        assert business_b.status_code == 201, business_b.text
        b_id = business_b.json()["id"]

        random_id = str(uuid4())
        ids = {
            "business_id": a_id,
            "customer_id": customer_id,
            "supplier_id": supplier_id,
            "product_id": product_id,
            "invoice_id": draft_invoice_id,
            "order_id": purchase_order_id,
            "return_id": random_id,
            "employee_id": employee_id,
            "payroll_id": payroll_id,
            "membership_id": staff_membership_id,
            "invitation_id": random_id,
            "entity_type": "customers",
            "setting_key": "matrix_key",
            "user_uid": "some-uid",
        }
        bodies = {
            ("POST", "/api/v1/businesses/{business_id}/invitations"): {"email": "inv@example.com"},
            ("PATCH", "/api/v1/businesses/{business_id}"): {"name": "Renamed"},
            ("PATCH", "/api/v1/businesses/{business_id}/memberships/{membership_id}"): {"role": "staff"},
            ("POST", "/api/v1/businesses/{business_id}/customers"): {"name": "Probe"},
            ("POST", "/api/v1/businesses/{business_id}/suppliers"): {"name": "Probe"},
            ("POST", "/api/v1/businesses/{business_id}/products"): {"name": "Probe", "unit_price": "1.00"},
            ("POST", "/api/v1/businesses/{business_id}/invoices"): {
                "invoice_number": "INV-PROBE", "currency_code": "EGP", "customer_id": customer_id,
                "lines": [{"product_id": product_id, "quantity": "1", "unit_price": "1.00"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/invoices/issue"): {
                "invoice_number": "INV-PROBE-ISSUE", "currency_code": "EGP", "customer_id": customer_id,
                "lines": [{"product_id": product_id, "quantity": "1", "unit_price": "1.00"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue"): {},
            ("POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/duplicate"): {},
            ("PATCH", "/api/v1/businesses/{business_id}/invoices/{invoice_id}"): {
                "invoice_number": "INV-PROBE-EDIT", "currency_code": "EGP", "customer_id": customer_id,
                "lines": [{"product_id": product_id, "quantity": "1", "unit_price": "1.00"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/void"): {},
            ("POST", "/api/v1/businesses/{business_id}/stock-movements"): {
                "product_id": product_id, "movement_type": "adjustment", "quantity_delta": "1",
            },
            ("POST", "/api/v1/businesses/{business_id}/payments"): {
                "amount": "1.00", "currency_code": "EGP", "idempotency_key": "matrix-probe",
                "customer_id": customer_id, "allocations": [],
            },
            ("POST", "/api/v1/businesses/{business_id}/expenses"): {
                "category": "ops", "description": "probe", "amount": "1.00",
                "currency_code": "EGP", "incurred_at": "2026-01-01T00:00:00Z",
            },
            ("POST", "/api/v1/businesses/{business_id}/purchase-orders"): {
                "supplier_id": supplier_id, "order_number": "PO-PROBE", "currency_code": "EGP",
                "lines": [{"product_id": product_id, "quantity": "1", "unit_cost": "1.00"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive"): {
                "lines": [{"line_id": random_id, "quantity": "1"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/duplicate"): {},
            ("PUT", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}"): {
                "supplier_id": supplier_id, "order_number": "PO-PROBE-EDIT", "currency_code": "EGP",
                "lines": [{"product_id": product_id, "quantity": "1", "unit_cost": "1.00"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/sales-returns"): {
                "invoice_id": issued_invoice_id,
                "lines": [{"invoice_line_id": issued_line_id, "quantity": "1"}],
            },
            ("POST", "/api/v1/businesses/{business_id}/recurring-invoices"): {
                "interval_days": 30, "next_run_at": "2026-02-01T00:00:00Z",
            },
            ("POST", "/api/v1/businesses/{business_id}/pricing-rules"): {
                "name": "probe", "rule_type": "tax", "rate": "5",
            },
            ("POST", "/api/v1/businesses/{business_id}/notifications"): {
                "kind": "business", "title": "t", "body": "b", "deduplication_key": "matrix-probe",
            },
            ("PUT", "/api/v1/businesses/{business_id}/settings/{setting_key}"): {"setting_value": "x"},
            ("PATCH", "/api/v1/businesses/{business_id}/customers/{customer_id}"): {"name": "Probe 2"},
            ("PATCH", "/api/v1/businesses/{business_id}/products/{product_id}"): {"unit_price": "2.00"},
            ("POST", "/api/v1/businesses/{business_id}/assistant/chat"): {"message": "hi"},
            ("POST", "/api/v1/businesses/{business_id}/employees"): {"name": "Probe", "monthly_salary": "1000"},
            ("PATCH", "/api/v1/businesses/{business_id}/employees/{employee_id}"): {"name": "Probe 2"},
            ("POST", "/api/v1/businesses/{business_id}/employees/{employee_id}/payroll"): {"period": "2026-02"},
            ("PATCH", "/api/v1/businesses/{business_id}/payroll/{payroll_id}"): {"allowances": "1.00"},
            ("PATCH", "/api/v1/platform-admin/businesses/{business_id}/status"): {
                "is_active": False, "reason": "matrix probe",
            },
            ("POST", "/api/v1/platform-admin/users/{user_uid}/roles"): {
                "role": "platform_viewer", "active": True, "reason": "matrix probe",
            },
        }

        def snapshot() -> tuple:
            with app.state.session_factory() as session:
                rows = []
                for table in Base.metadata.sorted_tables:
                    if "business_id" in table.c:
                        statement = table.select().where(
                            table.c.business_id.in_([UUID(a_id), UUID(b_id)])
                        )
                    elif table.name == "businesses":
                        statement = table.select().where(
                            table.c.id.in_([UUID(a_id), UUID(b_id)])
                        )
                    else:
                        continue
                    primary_key = list(table.primary_key.columns)
                    if primary_key:
                        statement = statement.order_by(*primary_key)
                    rows.append(
                        (table.name, tuple(tuple(row) for row in session.execute(statement).all()))
                    )
                return tuple(rows)

        def fire(method: str, template: str):
            url = template
            for key, value in ids.items():
                url = url.replace("{" + key + "}", str(value))
            kwargs = {}
            if template.endswith(
                ("/imports/{entity_type}.csv", "/imports/{entity_type}.csv/preview")
            ):
                kwargs = {
                    "content": "name\nProbe\n",
                    "headers": {"content-type": "text/csv"},
                }
            elif method in ("POST", "PATCH", "PUT"):
                kwargs = {"json": bodies.get((method, template), {})}
            return getattr(client, method.lower())(url, **kwargs)

        def assert_denied(actor_label: str, method: str, template: str, expected: int) -> None:
            before = snapshot()
            response = fire(method, template)
            assert response.status_code == expected, (
                f"{actor_label} {method} {template}: expected {expected}, "
                f"got {response.status_code}: {response.text}"
            )
            assert snapshot() == before, (
                f"{actor_label} {method} {template} changed business rows or AuditEvent"
            )

        for method, template, staff_expectation in MATRIX:
            # Unauthenticated: 401, no side effects.
            authenticated["value"] = False
            assert_denied("unauthenticated", method, template, 401)
            if (method, template) == ("GET", "/api/v1/businesses"):
                # The workspace list is scoped to the CALLER's memberships:
                # there is no tenant to deny — the security property is that
                # each actor sees exactly their own workspaces, never A's.
                for actor, expected_ids in (
                    ("matrix-outsider", []),
                    ("matrix-owner-b", [b_id]),
                    ("matrix-staff-a", [a_id]),
                ):
                    as_user(actor)
                    before = snapshot()
                    response = fire(method, template)
                    assert response.status_code == 200, response.text
                    assert [row["id"] for row in response.json()] == expected_ids, (
                        f"{actor} workspace list leaked or lost a workspace: {response.text}"
                    )
                    assert snapshot() == before
                continue
            # Non-member: 403, no side effects.
            as_user("matrix-outsider")
            assert_denied("non-member", method, template, 403)
            # Cross-tenant: the owner of business B against business A: 403.
            as_user("matrix-owner-b")
            assert_denied("cross-tenant", method, template, 403)
            # STAFF of business A: pinned per the documented access model.
            as_user("matrix-staff-a")
            if staff_expectation == "deny":
                assert_denied("staff", method, template, 403)
            else:
                response = fire(method, template)
                assert response.status_code in (200, 201), (
                    f"staff {method} {template}: expected success, "
                    f"got {response.status_code}: {response.text}"
                )
    finally:
        if previous_factory is None:
            del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
