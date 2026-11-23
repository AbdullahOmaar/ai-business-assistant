"""3A-364: interactive API docs are local-only.

Deployed environments (VERCEL_ENV=preview/production) must not serve
/docs, /redoc or /openapi.json; local development keeps them. The
deployed-mode checks run in a subprocess so the shared test app import
is never reloaded or mutated.
"""
import json
import os
import subprocess
import sys

import pytest

from app.main import _interactive_docs_enabled


@pytest.mark.parametrize("value", [None, "", "development", "Development"])
def test_docs_enabled_for_local_environments(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("VERCEL_ENV", raising=False)
    else:
        monkeypatch.setenv("VERCEL_ENV", value)
    assert _interactive_docs_enabled() is True


@pytest.mark.parametrize("value", ["production", "preview", "Production"])
def test_docs_disabled_for_deployed_environments(monkeypatch, value):
    monkeypatch.setenv("VERCEL_ENV", value)
    assert _interactive_docs_enabled() is False


def _probe_app(vercel_env: str) -> dict:
    code = (
        "import json;"
        "from fastapi.testclient import TestClient;"
        "from app.main import app;"
        "client = TestClient(app, raise_server_exceptions=False);"
        "print(json.dumps({"
        "'docs_url': app.docs_url, 'redoc_url': app.redoc_url,"
        " 'openapi_url': app.openapi_url,"
        " 'docs': client.get('/docs').status_code,"
        " 'redoc': client.get('/redoc').status_code,"
        " 'openapi': client.get('/openapi.json').status_code,"
        " 'health': client.get('/health').status_code}))"
    )
    env = dict(os.environ, VERCEL_ENV=vercel_env)
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True, env=env, timeout=120, check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_deployed_app_serves_docs_as_404():
    probe = _probe_app("production")
    assert probe["docs_url"] is None
    assert probe["redoc_url"] is None
    assert probe["openapi_url"] is None
    assert probe["docs"] == 404
    assert probe["redoc"] == 404
    assert probe["openapi"] == 404
    # The API itself is unaffected by the docs gating.
    assert probe["health"] == 200


def test_local_app_serves_docs():
    probe = _probe_app("development")
    assert probe["docs_url"] == "/docs"
    assert probe["docs"] == 200
    assert probe["openapi"] == 200
