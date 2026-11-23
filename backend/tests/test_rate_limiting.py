"""3A-650 part C: API rate limiting on the abuse-sensitive surfaces.

Unit tests pin the fixed-window behaviour with injected time; API tests
pin that business creation returns 429 + Retry-After once the configured
per-minute limit is exhausted, and that unrelated surfaces stay open.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.rate_limit import FixedWindowLimiter
from app.security import AuthenticatedPrincipal


def test_fixed_window_allows_up_to_the_limit_then_blocks_until_rollover():
    limiter = FixedWindowLimiter()
    assert limiter.check("k", limit=2, window_seconds=60, now=120) == (True, 60)
    assert limiter.check("k", limit=2, window_seconds=60, now=121) == (True, 59)
    allowed, retry_after = limiter.check("k", limit=2, window_seconds=60, now=122)
    assert allowed is False
    assert retry_after == 58
    # A different key has its own window.
    assert limiter.check("other", limit=2, window_seconds=60, now=122)[0] is True
    # The next window resets the count.
    assert limiter.check("k", limit=2, window_seconds=60, now=180) == (True, 60)


def _client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("ratelimit-owner")
    client = TestClient(app, raise_server_exceptions=False)
    return client, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def test_business_creation_is_rate_limited_per_minute(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_BUSINESS_CREATE_PER_MINUTE", "2")
    client, previous_factory, previous_resolver = _client()
    try:
        body = {"name": "Limited Co", "currency_code": "EGP", "timezone": "Africa/Cairo"}
        # A unique forwarded address gives this test its own limiter key:
        # the in-process counters are shared across the whole suite run.
        headers = {"X-Forwarded-For": "203.0.113.7"}
        assert client.post("/api/v1/businesses", json=body, headers=headers).status_code == 201
        assert client.post("/api/v1/businesses", json=body, headers=headers).status_code == 201
        blocked = client.post("/api/v1/businesses", json=body, headers=headers)
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
        assert int(blocked.headers["Retry-After"]) >= 1
        # Unrelated surfaces stay open while this one is limited.
        assert client.get("/api/v1/businesses").status_code == 200
    finally:
        _restore(previous_factory, previous_resolver)


def test_rate_limit_can_be_disabled_by_configuration(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_BUSINESS_CREATE_PER_MINUTE", "0")
    client, previous_factory, previous_resolver = _client()
    try:
        body = {"name": "Unlimited Co", "currency_code": "EGP", "timezone": "Africa/Cairo"}
        for _ in range(4):
            assert client.post("/api/v1/businesses", json=body).status_code == 201
    finally:
        _restore(previous_factory, previous_resolver)
