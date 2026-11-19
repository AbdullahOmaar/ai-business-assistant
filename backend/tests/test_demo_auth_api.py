from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest

from app.main import app


class _DemoSession:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def scalar(self, _statement):
        return None


def test_demo_session_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("DEMO_LOGIN_ENABLED", raising=False)
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 404
    assert response.json()["detail"] == "Demo access is not enabled."


def test_public_demo_session_mints_custom_token_without_password(monkeypatch):
    from firebase_admin import auth
    from app import demo_auth_api

    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "aiba-test")
    monkeypatch.setenv("DEMO_RATE_LIMIT_REDIS_URL", "https://redis.example.test")
    monkeypatch.setenv("DEMO_RATE_LIMIT_REDIS_TOKEN", "test-token")
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    monkeypatch.setattr(demo_auth_api, "get_firebase_admin_app", lambda: object())
    monkeypatch.setattr(auth, "get_user_by_email", lambda _email, app: SimpleNamespace(uid="demo-uid"))
    monkeypatch.setattr(auth, "create_custom_token", lambda uid, app: b"one-time-custom-token")
    class _RedisResponse:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def read(self): return b'{"result":1}'
    monkeypatch.setattr(demo_auth_api, "urlopen", lambda *_args, **_kwargs: _RedisResponse())

    previous_factory = getattr(app.state, "session_factory", None)
    app.state.session_factory = lambda: _DemoSession()
    try:
        response = TestClient(app).post("/api/v1/demo/session")
        assert response.status_code == 200
        assert response.json() == {"custom_token": "one-time-custom-token"}
        assert response.headers["cache-control"] == "no-store, private"
        assert response.headers["pragma"] == "no-cache"
    finally:
        if previous_factory is None:
            del app.state.session_factory
        else:
            app.state.session_factory = previous_factory


def test_public_demo_session_rejects_platform_super_admin(monkeypatch):
    from firebase_admin import auth
    from app import demo_auth_api

    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "aiba-test")
    monkeypatch.setenv("PLATFORM_SUPER_ADMIN_UIDS", "firebase:aiba-test:demo-uid")
    monkeypatch.setattr(demo_auth_api, "get_firebase_admin_app", lambda: object())
    monkeypatch.setattr(auth, "get_user_by_email", lambda _email, app: SimpleNamespace(uid="demo-uid"))

    previous_factory = getattr(app.state, "session_factory", None)
    app.state.session_factory = lambda: _DemoSession()
    try:
        response = TestClient(app).post("/api/v1/demo/session")
        assert response.status_code == 403
        assert "platform-wide access" in response.json()["detail"]
    finally:
        if previous_factory is None:
            del app.state.session_factory
        else:
            app.state.session_factory = previous_factory



def test_demo_session_fails_closed_when_shared_rate_limiter_is_not_configured(monkeypatch):
    from app import demo_auth_api

    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.delenv("DEMO_RATE_LIMIT_REDIS_URL", raising=False)
    monkeypatch.delenv("DEMO_RATE_LIMIT_REDIS_TOKEN", raising=False)
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 503
    assert "rate limiting is not configured" in response.json()["detail"]


def test_demo_session_rate_limit_rejects_excess_requests_before_firebase(monkeypatch):
    from app import demo_auth_api

    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.setenv("DEMO_RATE_LIMIT_REDIS_URL", "https://redis.example.test")
    monkeypatch.setenv("DEMO_RATE_LIMIT_REDIS_TOKEN", "test-token")
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "1")
    class _RedisResponse:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def read(self): return b'{"result":2}'
    monkeypatch.setattr(demo_auth_api, "urlopen", lambda *_args, **_kwargs: _RedisResponse())
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
