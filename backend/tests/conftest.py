"""Suite-wide fixtures.

3A-650 part C: the API rate limiter (app/rate_limit.py) reads its limits
from the environment on every request, with production defaults sized for
real traffic. The test suite drives thousands of synthetic requests from
one address in under a minute, which would trip those defaults without
testing anything real — so the suite raises the ceilings here. The
limiter's own tests (test_rate_limiting.py) override these values with
monkeypatch to pin the actual limiting behaviour.
"""

import os

import pytest


@pytest.fixture(scope="session", autouse=True)
def _raise_rate_limit_ceilings_for_suite():
    for scope in ("BUSINESS_CREATE", "INVITATION_ACCEPT", "ASSISTANT_CHAT", "ASSISTANT_EXECUTION", "CSV_IMPORT"):
        os.environ.setdefault(f"RATE_LIMIT_{scope}_PER_MINUTE", "100000")
    yield
