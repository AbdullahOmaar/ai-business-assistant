"""In-process fixed-window rate limiting for abuse-sensitive API surfaces.

3A-650 part C (from the 3A-445 round-2 review): the main API had no rate
limiting at all — only the demo-session endpoint was limited (with its own
PostgreSQL-backed limiter in demo_auth_api.py). This module adds a small,
dependency-free limiter for the surfaces where scripted abuse concentrates:

- business creation (workspace farming from one address),
- invitation acceptance (invite-token guessing),
- the assistant chat endpoint (the most expensive request in the API),
- CSV import commits (bulk writes).

Design notes, stated honestly:

- The store is in-process memory, so on a multi-instance serverless
  deployment each instance enforces its own window; the effective ceiling
  is limit x instances. That is a real control (it stops single-source
  floods and token guessing loops) but it is NOT a distributed quota —
  generalising the demo endpoint's PostgreSQL-backed approach to these
  surfaces is the documented follow-up if stricter guarantees are needed.
- Limits are read from the environment on every request (same convention
  as the demo limiter), so operations can tune or disable a surface
  (limit <= 0 disables) without a redeploy of the code.
- Keys are the client address (first X-Forwarded-For hop when present,
  which is how Vercel reaches the app) plus, for business-scoped surfaces,
  the business id — so one tenant's flood does not consume another
  tenant's allowance on the shared surfaces.
"""

import os
import threading
import time

from fastapi import HTTPException, Request

_MAX_TRACKED_KEYS = 4096


class FixedWindowLimiter:
    """Thread-safe fixed-window counter keyed by an opaque string."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: dict[str, tuple[int, int]] = {}

    def check(self, key: str, limit: int, window_seconds: int, now: int | None = None) -> tuple[bool, int]:
        """Record one hit for ``key``; return (allowed, retry_after_seconds)."""
        now = int(time.time()) if now is None else now
        window_start = (now // window_seconds) * window_seconds
        with self._lock:
            stored_window, count = self._counters.get(key, (window_start, 0))
            if stored_window != window_start:
                stored_window, count = window_start, 0
            count += 1
            self._counters[key] = (stored_window, count)
            if len(self._counters) > _MAX_TRACKED_KEYS:
                self._counters = {
                    k: v for k, v in self._counters.items() if v[0] == window_start
                }
            return count <= limit, max(1, stored_window + window_seconds - now)


_LIMITER = FixedWindowLimiter()


def client_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _limit_from_env(scope: str, default_limit: int) -> int:
    raw = os.getenv(f"RATE_LIMIT_{scope}_PER_MINUTE")
    if raw is None:
        return default_limit
    try:
        return int(raw)
    except ValueError:
        return default_limit


def rate_limit(scope: str, *, default_limit: int, per_business: bool = False):
    """Build a FastAPI dependency enforcing a per-minute fixed window.

    ``scope`` names the surface (used for the env override
    ``RATE_LIMIT_<scope>_PER_MINUTE`` and the counter key). A configured
    limit of 0 or less disables the surface's limiter.
    """

    def dependency(request: Request) -> None:
        limit = _limit_from_env(scope, default_limit)
        if limit <= 0:
            return
        key = f"{scope}:{client_address(request)}"
        if per_business:
            key = f"{key}:{request.path_params.get('business_id', '')}"
        allowed, retry_after = _LIMITER.check(key, limit, 60)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please retry later.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
