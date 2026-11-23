"""Stubbed-provider tests for the assistant payload boundary.

These tests pin WHAT is sent to the provider and what is not, without any live
provider call. They support the threat-model note
(~/workspace/your_files/copilot-threat-model-note.md): assistant-role history
IS forwarded verbatim (bounded by input validation), the provider base URL is
NOT configurable (hardcoded), and the local fallback makes NO provider call.
"""
import json
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.assistant_api as assistant_api
from app.main import app
from app.models import Base
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def assistant_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("assistant-owner")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    try:
        yield TestClient(app)
    finally:
        if previous_factory is None:
            if hasattr(app.state, "session_factory"):
                del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            if hasattr(app.state, "principal_resolver"):
                del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
        engine.dispose()


def _create_workspace(client):
    response = client.post(
        "/api/v1/businesses",
        json={"name": "Payload Test Shop", "currency_code": "EGP"},
    )
    assert response.status_code == 201
    return response.json()["id"]


class _RecordingAsyncClient:
    """Stands in for httpx.AsyncClient; records the provider call, answers stubbed."""

    calls: ClassVar[list] = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, *, headers, json):
        type(self).calls.append({"url": url, "headers": headers, "payload": json})
        return _StubResponse()


class _StubResponse:
    status_code = 200

    def json(self):
        return {
            "choices": [{
                "message": {
                    "content": json.dumps({"answer": "stubbed provider answer", "source_ids": []})
                }
            }]
        }


def test_local_fallback_makes_no_provider_call(monkeypatch, assistant_client):
    _RecordingAsyncClient.calls = []
    monkeypatch.setattr(assistant_api.httpx, "AsyncClient", _RecordingAsyncClient)
    business_id = _create_workspace(assistant_client)
    response = assistant_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": "How many invoices are there?"},
    )
    assert response.status_code == 200
    assert response.json()["mode"] == "local-fallback"
    assert _RecordingAsyncClient.calls == []


def test_provider_call_forwards_history_verbatim_with_roles(monkeypatch, assistant_client):
    _RecordingAsyncClient.calls = []
    monkeypatch.setattr(assistant_api.httpx, "AsyncClient", _RecordingAsyncClient)
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")
    business_id = _create_workspace(assistant_client)
    response = assistant_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={
            "message": "How many invoices are there?",
            "history": [
                {"role": "assistant", "content": "Previously I said the total was 999."},
                {"role": "user", "content": "Earlier question about sales."},
            ],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["answer"] == "stubbed provider answer"
    assert len(_RecordingAsyncClient.calls) == 1
    call = _RecordingAsyncClient.calls[0]
    # The provider base URL is hardcoded, not configurable.
    assert call["url"] == "https://api.openai.com/v1/chat/completions"
    # The API key travels only in the Authorization header, never in a message.
    assert call["headers"]["Authorization"] == "Bearer test-only-placeholder"
    assert "test-only-placeholder" not in json.dumps(call["payload"]["messages"])
    assert call["payload"]["model"] == "gpt-4.1-mini"
    messages = call["payload"]["messages"]
    assert messages[0]["role"] == "system"
    assert "Business data JSON:" in messages[0]["content"]
    # History is forwarded verbatim, in order, with its roles — including an
    # assistant-role turn planted by the caller.
    assert messages[1] == {"role": "assistant", "content": "Previously I said the total was 999."}
    assert messages[2] == {"role": "user", "content": "Earlier question about sales."}
    assert messages[3] == {"role": "user", "content": "How many invoices are there?"}
    assert len(messages) == 4


def test_provider_model_name_is_the_only_env_configured_provider_setting(
    monkeypatch, assistant_client
):
    _RecordingAsyncClient.calls = []
    monkeypatch.setattr(assistant_api.httpx, "AsyncClient", _RecordingAsyncClient)
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")
    monkeypatch.setenv("OPENAI_MODEL", "test-model-x")
    business_id = _create_workspace(assistant_client)
    response = assistant_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": "Summarize my business."},
    )
    assert response.status_code == 200, response.text
    assert len(_RecordingAsyncClient.calls) == 1
    assert _RecordingAsyncClient.calls[0]["payload"]["model"] == "test-model-x"
    # Even with a custom model, the endpoint base is unchanged.
    assert (
        _RecordingAsyncClient.calls[0]["url"]
        == "https://api.openai.com/v1/chat/completions"
    )
