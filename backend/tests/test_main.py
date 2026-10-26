from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_method_policy_includes_settings_put_route() -> None:
    from app.main import CORS_ALLOWED_METHODS
    from starlette.middleware.cors import CORSMiddleware

    middleware = CORSMiddleware(
        app,
        allow_origins=["https://frontend.example"],
        allow_credentials=True,
        allow_methods=CORS_ALLOWED_METHODS,
        allow_headers=["Authorization", "Content-Type", "Accept"],
        expose_headers=["X-Request-ID"],
    )
    client_with_cors = TestClient(middleware)
    response = client_with_cors.options(
        "/api/v1/businesses/00000000-0000-0000-0000-000000000001/settings/locale",
        headers={
            "Origin": "https://frontend.example",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]
    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()


def test_health_response_includes_server_generated_request_id() -> None:
    from uuid import UUID

    response = client.get(
        "/health",
        headers={"X-Request-ID": "caller-controlled-value"},
    )

    assert response.status_code == 200
    request_id = response.headers["X-Request-ID"]
    assert str(UUID(request_id)) == request_id
    assert request_id != "caller-controlled-value"
