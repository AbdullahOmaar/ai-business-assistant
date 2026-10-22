import asyncio

import httpx
import pytest
from fastapi import HTTPException

from app.assistant_api import _provider_post


class FakeClient:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    async def post(self, *args, **kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def response(status_code: int) -> httpx.Response:
    return httpx.Response(status_code=status_code, request=httpx.Request("POST", "https://example.test"))


def test_provider_retries_one_transient_server_error():
    client = FakeClient([response(503), response(200)])
    result = asyncio.run(_provider_post(client, headers={}, payload={}))
    assert result.status_code == 200
    assert client.calls == 2


def test_provider_stops_after_bounded_transient_retries():
    client = FakeClient([response(503), response(503)])
    with pytest.raises(HTTPException) as error:
        asyncio.run(_provider_post(client, headers={}, payload={}))
    assert error.value.status_code == 503
    assert client.calls == 2


def test_provider_does_not_retry_permanent_client_error():
    client = FakeClient([response(400), response(200)])
    with pytest.raises(HTTPException) as error:
        asyncio.run(_provider_post(client, headers={}, payload={}))
    assert error.value.status_code == 502
    assert client.calls == 1


def test_provider_maps_final_timeout_to_gateway_timeout():
    timeout = httpx.ReadTimeout("timed out", request=httpx.Request("POST", "https://example.test"))
    client = FakeClient([timeout, timeout])
    with pytest.raises(HTTPException) as error:
        asyncio.run(_provider_post(client, headers={}, payload={}))
    assert error.value.status_code == 504
    assert client.calls == 2

