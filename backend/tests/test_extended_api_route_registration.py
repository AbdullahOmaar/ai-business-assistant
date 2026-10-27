"""Regression checks for duplicate FastAPI route registrations."""

from app.extended_api import router as extended_router


def test_extended_api_registers_each_reported_get_route_once():
    expected_paths = {
        "/api/v1/businesses/{business_id}/recurring-invoices",
        "/api/v1/businesses/{business_id}/operations/health",
        "/api/v1/businesses/{business_id}/reports/tax-summary",
    }

    for path in expected_paths:
        matching = [
            route
            for route in extended_router.routes
            if getattr(route, "path", None) == path
            and "GET" in getattr(route, "methods", set())
        ]
        assert len(matching) == 1, f"Expected one GET route for {path}, found {len(matching)}"
