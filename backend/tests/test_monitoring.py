"""3A-327: Sentry stays off without a DSN and never sends default PII."""

import sys
from types import SimpleNamespace

from app.monitoring import configure_sentry


def test_sentry_stays_off_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert configure_sentry() is False


def test_sentry_stays_off_with_blank_dsn(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "   ")
    assert configure_sentry() is False


def test_sentry_initializes_without_default_pii(monkeypatch):
    calls = []
    fake_sdk = SimpleNamespace(init=lambda **kwargs: calls.append(kwargs))
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sdk)
    monkeypatch.setenv("SENTRY_DSN", "https://key@example.invalid/1")
    monkeypatch.setenv("VERCEL_ENV", "preview")

    assert configure_sentry() is True
    assert calls == [
        {
            "dsn": "https://key@example.invalid/1",
            "environment": "preview",
            "send_default_pii": False,
            "traces_sample_rate": 0.0,
        }
    ]


def test_sentry_environment_falls_back_to_local(monkeypatch):
    calls = []
    fake_sdk = SimpleNamespace(init=lambda **kwargs: calls.append(kwargs))
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake_sdk)
    monkeypatch.setenv("SENTRY_DSN", "https://key@example.invalid/1")
    monkeypatch.delenv("VERCEL_ENV", raising=False)

    assert configure_sentry() is True
    assert calls[0]["environment"] == "local"
