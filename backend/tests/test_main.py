from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_method_policy_includes_existing_settings_put_route() -> None:
    from app.main import CORS_ALLOWED_METHODS
    from starlette.middleware.cors import CORSMiddleware

    middleware = CORSMiddleware(
        app,
        allow_origins=["https://frontend.example"],
        allow_credentials=True,
        allow_methods=CORS_ALLOWED_METHODS,
        allow_headers=["Authorization", "Content-Type", "Accept"],
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
    assert response.headers["access-control-allow-methods"].find("PUT") >= 0
