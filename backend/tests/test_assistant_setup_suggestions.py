"""Conversational setup through the chat endpoint (B7, 3A-725).

The provider's answer may carry up to 3 setting suggestions. The
endpoint validates them (bad keys dropped, financial ones flagged
requires_confirmation, current values attached for the preview)
and never applies anything — application stays the user's explicit
act through the owner-only PUT /settings/{key}.
"""
from __future__ import annotations

import json
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import assistant_api
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
        json={"name": "Setup Test Shop", "currency_code": "EGP"},
    )
    assert response.status_code == 201
    return response.json()["id"]


class _SuggestingAsyncClient:
    """Stands in for httpx.AsyncClient; the stubbed provider answer
    carries setting suggestions, including one bad key and one
    financial number."""

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
                    "content": json.dumps({
                        "answer": "Here are three setup suggestions.",
                        "source_ids": [],
                        "suggestions": [
                            {"setting_key": "locale", "setting_value": "ar",
                             "reason": "Switch the workspace language."},
                            {"setting_key": "tax_rate", "setting_value": "14",
                             "reason": "Set the tax rate."},
                            {"setting_key": "api_token", "setting_value": "x",
                             "reason": "A secret — must be dropped."},
                            {"setting_key": "invoice_prefix", "setting_value": "INV-",
                             "reason": "Add an invoice prefix."},
                        ],
                    })
                }
            }]
        }


def test_chat_returns_validated_suggestions_with_preview_and_guard(monkeypatch, assistant_client):
    monkeypatch.setattr(assistant_api.httpx, "AsyncClient", _SuggestingAsyncClient)
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-placeholder")
    business_id = _create_workspace(assistant_client)
    # A current value exists for locale, so the preview shows old -> new.
    put = assistant_client.put(
        f"/api/v1/businesses/{business_id}/settings/locale",
        json={"setting_value": "en"},
    )
    assert put.status_code == 200, put.text

    response = assistant_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": "Set up my workspace language and tax rate."},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answer"] == "Here are three setup suggestions."
    suggestions = body["suggestions"]
    # The secret-like key is dropped; the cap is 3.
    assert [item["setting_key"] for item in suggestions] == [
        "locale", "tax_rate", "invoice_prefix",
    ]
    locale = suggestions[0]
    assert locale["current_value"] == "en"
    assert locale["proposed_value"] == "ar"
    assert locale["requires_confirmation"] is False
    tax = suggestions[1]
    assert tax["is_financial"] is True
    assert tax["requires_confirmation"] is True
    assert tax["current_value"] is None
    # Nothing was applied by the chat call itself: a second chat call
    # still sees the old value as the current one.
    again = assistant_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": "Set up my workspace language and tax rate."},
    )
    assert again.status_code == 200, again.text
    assert again.json()["suggestions"][0]["current_value"] == "en"


def test_local_fallback_returns_empty_suggestions(monkeypatch, assistant_client):
    monkeypatch.setattr(assistant_api.httpx, "AsyncClient", _SuggestingAsyncClient)
    business_id = _create_workspace(assistant_client)
    response = assistant_client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": "How many invoices are there?"},
    )
    assert response.status_code == 200
    assert response.json()["suggestions"] == []


if __name__ == "__main__":
    pytest.main([__file__])
