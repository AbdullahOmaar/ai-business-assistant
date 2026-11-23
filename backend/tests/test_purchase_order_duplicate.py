"""3A-435 / T39 (Linear 3A-248): purchase-order duplication («إعادة الطلب»).

The purchasing cycle was verified to exist (create, approve, partial/final
receipt, cancel, over-receipt prevention, stock-movement idempotency,
role/business isolation) except for re-ordering: no duplicate path existed
anywhere. These tests pin the new
POST .../purchase-orders/{order_id}/duplicate endpoint.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from test_api import (
    _configure_test_identity,
    _restore_test_identity,
    _sales_return_fixture,
)
from test_t39_purchase_order_workflow_api import _draft_order
from test_t39_purchase_receiving_api import _create_approved_order

from app.main import app
from app.models import Business


def test_duplicate_approved_order_creates_matching_draft():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, _, _ = _create_approved_order(
            engine, client, business_id, [("4.000", True)], "PO-T39-DUP"
        )
        base = f"/api/v1/businesses/{business_id}"

        duplicated = client.post(f"{base}/purchase-orders/{order_id}/duplicate")
        assert duplicated.status_code == 201, duplicated.text
        copy = duplicated.json()
        assert copy["id"] != str(order_id)
        assert copy["status"] == "draft"
        assert copy["order_number"] == "PO-T39-DUP-COPY"
        assert copy["currency_code"] == "EGP"
        assert copy["total"] == "30.00"

        detail = client.get(f"{base}/purchase-orders/{copy['id']}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["lines"][0]["received_quantity"] == "0.000"
        assert detail.json()["lines"][0]["remaining_quantity"] == "4.000"

        # The source is untouched: still approved.
        source = client.get(f"{base}/purchase-orders/{order_id}")
        assert source.json()["status"] == "approved"

        again = client.post(f"{base}/purchase-orders/{order_id}/duplicate")
        assert again.status_code == 201, again.text
        assert again.json()["order_number"] == "PO-T39-DUP-COPY-2"
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_duplicate_cancelled_order_is_allowed_and_tenant_scoped():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, _, _ = _draft_order(engine, client, business_id, "PO-T39-DUP-CANCEL")
        base = f"/api/v1/businesses/{business_id}"
        cancelled = client.post(f"{base}/purchase-orders/{order_id}/cancel")
        assert cancelled.status_code == 200, cancelled.text

        duplicated = client.post(f"{base}/purchase-orders/{order_id}/duplicate")
        assert duplicated.status_code == 201, duplicated.text
        assert duplicated.json()["status"] == "draft"

        # A business the caller is not a member of: 403.
        with Session(engine) as session:
            other = Business(name="T39 foreign tenant", currency_code="EGP")
            session.add(other)
            session.commit()
            foreign_id = other.id
        assert (
            client.post(
                f"/api/v1/businesses/{foreign_id}/purchase-orders/{order_id}/duplicate"
            ).status_code
            == 403
        )

        # Unauthenticated: 401.
        saved_resolver = app.state.principal_resolver
        app.state.principal_resolver = lambda request: None
        try:
            assert (
                client.post(f"{base}/purchase-orders/{order_id}/duplicate").status_code
                == 401
            )
        finally:
            app.state.principal_resolver = saved_resolver
    finally:
        _restore_test_identity(*previous)
        engine.dispose()
