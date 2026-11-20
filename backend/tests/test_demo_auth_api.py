import hashlib
import os
import threading
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import PlatformRoleGrant


_COUNTER_DDL = """
CREATE TABLE demo_rate_limit_counters (
    key_hash VARCHAR(64) PRIMARY KEY,
    window_start_epoch BIGINT NOT NULL,
    request_count INTEGER NOT NULL CONSTRAINT ck_demo_rate_limit_count_positive CHECK (request_count > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


def _sqlite_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as connection:
        connection.execute(text(_COUNTER_DDL))
        PlatformRoleGrant.__table__.create(connection)
    return sessionmaker(bind=engine), engine


@pytest.fixture
def demo_db(monkeypatch):
    factory, engine = _sqlite_factory()
    monkeypatch.setattr(app.state, "session_factory", factory, raising=False)
    yield engine


@pytest.fixture
def demo_firebase(monkeypatch):
    from firebase_admin import auth
    from app import demo_auth_api

    calls = {"get_user": 0, "mint": 0}

    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "aiba-test")
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    monkeypatch.setattr(demo_auth_api, "get_firebase_admin_app", lambda: object())

    def _get_user(_email, app=None):
        calls["get_user"] += 1
        return SimpleNamespace(uid="demo-uid")

    def _mint(_uid, app=None):
        calls["mint"] += 1
        return b"one-time-custom-token"

    monkeypatch.setattr(auth, "get_user_by_email", _get_user)
    monkeypatch.setattr(auth, "create_custom_token", _mint)
    return calls


def test_demo_session_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("DEMO_LOGIN_ENABLED", raising=False)
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 404
    assert response.json()["detail"] == "Demo access is not enabled."


def test_public_demo_session_mints_custom_token_without_password(demo_db, demo_firebase):
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 200
    assert response.json() == {"custom_token": "one-time-custom-token"}
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["pragma"] == "no-cache"
    with demo_db.begin() as connection:
        rows = connection.execute(text("SELECT key_hash, request_count FROM demo_rate_limit_counters")).all()
    assert len(rows) == 1
    assert rows[0][1] == 1
    assert len(rows[0][0]) == 64  # only the hashed client identity is stored


def test_public_demo_session_rejects_platform_super_admin(demo_db, monkeypatch):
    from firebase_admin import auth
    from app import demo_auth_api

    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "aiba-test")
    monkeypatch.setenv("PLATFORM_SUPER_ADMIN_UIDS", "firebase:aiba-test:demo-uid")
    monkeypatch.setattr(demo_auth_api, "get_firebase_admin_app", lambda: object())
    monkeypatch.setattr(auth, "get_user_by_email", lambda _email, app=None: SimpleNamespace(uid="demo-uid"))
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 403
    assert "platform-wide access" in response.json()["detail"]


def test_demo_session_fails_closed_when_shared_rate_limiter_is_not_configured(monkeypatch):
    monkeypatch.setenv("DEMO_LOGIN_ENABLED", "true")
    monkeypatch.setenv("DEMO_LOGIN_EMAIL", "demo@example.test")
    monkeypatch.delattr(app.state, "session_factory", raising=False)
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 503
    assert "rate limiting is not configured" in response.json()["detail"]


def test_demo_session_rate_limit_rejects_excess_requests_before_firebase(demo_db, demo_firebase, monkeypatch):
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "1")
    client = TestClient(app)
    first = client.post("/api/v1/demo/session")
    assert first.status_code == 200
    second = client.post("/api/v1/demo/session")
    assert second.status_code == 429
    retry_after = int(second.headers["retry-after"])
    assert 1 <= retry_after <= 60  # computed from the actual end of the current window
    # The 429 is raised before any identity-provider work.
    assert demo_firebase["get_user"] == 1
    assert demo_firebase["mint"] == 1


def test_demo_rate_limit_window_expiry_resets_counter(demo_db, demo_firebase, monkeypatch):
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "1")
    monkeypatch.setenv("DEMO_RATE_LIMIT_WINDOW_SECONDS", "1")
    client = TestClient(app)
    assert client.post("/api/v1/demo/session").status_code == 200
    assert client.post("/api/v1/demo/session").status_code == 429
    time.sleep(1.1)
    assert client.post("/api/v1/demo/session").status_code == 200


def test_demo_rate_limit_fails_closed_on_store_error(demo_firebase, monkeypatch):
    # A store without the counters table simulates an unavailable limiter:
    # the endpoint must fail closed and never reach the identity provider.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    monkeypatch.setattr(app.state, "session_factory", sessionmaker(bind=engine), raising=False)
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]
    assert demo_firebase["get_user"] == 0
    assert demo_firebase["mint"] == 0


def test_demo_rate_limit_rejects_invalid_configuration(demo_db, demo_firebase, monkeypatch):
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "0")
    assert TestClient(app).post("/api/v1/demo/session").status_code == 503
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "not-a-number")
    assert TestClient(app).post("/api/v1/demo/session").status_code == 503
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "5")
    monkeypatch.setenv("DEMO_RATE_LIMIT_WINDOW_SECONDS", "3601")
    assert TestClient(app).post("/api/v1/demo/session").status_code == 503


def test_demo_rate_limit_window_is_monotonic_for_late_requests(demo_db, demo_firebase):
    # A late request from an older window must not move a newer stored window
    # backwards; it increments the newer window instead.
    future_window = (int(time.time()) // 60) * 60 + 3600
    identity = hashlib.sha256(b"testclient").hexdigest()
    with demo_db.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO demo_rate_limit_counters (key_hash, window_start_epoch, request_count)"
                " VALUES (:k, :w, 4)"
            ),
            {"k": identity, "w": future_window},
        )
    response = TestClient(app).post("/api/v1/demo/session")
    assert response.status_code == 200  # 4 + 1 = 5, at the default limit
    with demo_db.begin() as connection:
        row = connection.execute(
            text("SELECT window_start_epoch, request_count FROM demo_rate_limit_counters WHERE key_hash = :k"),
            {"k": identity},
        ).one()
    assert row[0] == future_window
    assert row[1] == 5


def _fake_request(factory):
    return SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(session_factory=factory)),
        headers={"x-real-ip": "203.0.113.7"},
        client=None,
    )


@pytest.mark.skipif(not os.getenv("AIBA_TEST_PG_DSN"), reason="disposable PostgreSQL DSN not provided")
def test_demo_rate_limit_concurrent_upserts_are_atomic(monkeypatch):
    # Concurrency evidence requires a real PostgreSQL store: SQLite serializes
    # writes and cannot prove cross-instance atomicity. The DSN must point to a
    # disposable database whose name ends in _test.
    from app.demo_auth_api import _enforce_demo_rate_limit

    dsn = os.environ["AIBA_TEST_PG_DSN"]
    database_name = dsn.rsplit("/", 1)[-1].split("?")[0]
    assert database_name.endswith("_test"), "concurrency test requires a disposable *_test database"
    monkeypatch.setenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "100")
    monkeypatch.setenv("DEMO_RATE_LIMIT_WINDOW_SECONDS", "60")

    engine = create_engine(dsn)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS demo_rate_limit_counters"))
        connection.execute(text(_COUNTER_DDL))
    factory = sessionmaker(bind=engine)

    errors = []

    def worker():
        try:
            _enforce_demo_rate_limit(_fake_request(factory))
        except Exception as exc:  # noqa: BLE001 - collected and asserted below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors

    identity = hashlib.sha256(b"203.0.113.7").hexdigest()
    with factory() as session:
        count = session.execute(
            text("SELECT request_count FROM demo_rate_limit_counters WHERE key_hash = :k"),
            {"k": identity},
        ).scalar_one()
    assert count == 8
