"""Public synthetic-demo session bootstrap.

The endpoint never accepts or returns a password. It mints a short-lived,
single-use Firebase custom token for one explicitly configured demo identity.
It is disabled unless DEMO_LOGIN_ENABLED=true and DEMO_LOGIN_EMAIL is set.
"""
import hashlib
import json
import os
from urllib.error import URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from app.models import PlatformRoleGrant

from app.firebase_auth import get_firebase_admin_app

router = APIRouter(prefix="/api/v1/demo", tags=["demo access"])


def _enforce_demo_rate_limit(request: Request) -> None:
    """Apply an atomic shared Redis REST fixed-window limit before minting a token.

    The demo endpoint is serverless-safe: it never falls back to per-process memory.
    If the shared limiter is unavailable or misconfigured, demo login fails closed.
    """
    redis_url = os.getenv("DEMO_RATE_LIMIT_REDIS_URL", "").strip()
    redis_token = os.getenv("DEMO_RATE_LIMIT_REDIS_TOKEN", "").strip()
    if not redis_url.startswith("https://") or not redis_token:
        raise HTTPException(status_code=503, detail="Demo access rate limiting is not configured.")

    try:
        limit = int(os.getenv("DEMO_RATE_LIMIT_MAX_REQUESTS", "5"))
        window_seconds = int(os.getenv("DEMO_RATE_LIMIT_WINDOW_SECONDS", "60"))
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="Demo access rate limiting is not configured.") from exc
    if not 1 <= limit <= 100 or not 1 <= window_seconds <= 3600:
        raise HTTPException(status_code=503, detail="Demo access rate limiting is not configured.")

    # Vercel supplies x-real-ip at the edge; do not trust arbitrary X-Forwarded-For chains.
    client_ip = request.headers.get("x-real-ip", "").strip()
    if not client_ip and request.client is not None:
        client_ip = request.client.host
    if not client_ip:
        client_ip = "unknown"
    identity = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
    key = f"aiba:demo-session:{identity}"
    script = (
        "local current=redis.call('INCR',KEYS[1]); "
        "if current==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; "
        "return current"
    )
    payload = json.dumps([
        "EVAL", script, "1", key, str(window_seconds * 1000),
    ]).encode("utf-8")
    outbound = UrlRequest(
        redis_url,
        data=payload,
        headers={
            "Authorization": f"Bearer {redis_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(outbound, timeout=2.5) as result:
            body = json.loads(result.read().decode("utf-8"))
        count = int(body["result"])
    except (URLError, TimeoutError, ValueError, KeyError, TypeError, OSError) as exc:
        raise HTTPException(status_code=503, detail="Demo access rate limiting is temporarily unavailable.") from exc

    if count > limit:
        raise HTTPException(
            status_code=429,
            detail="Demo access request limit reached. Try again later.",
            headers={"Retry-After": str(window_seconds)},
        )


@router.post("/session")
def create_demo_session(request: Request, response: Response) -> dict[str, str]:
    """Issue a Firebase custom token for the configured public demo identity."""
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Pragma"] = "no-cache"

    enabled = os.getenv("DEMO_LOGIN_ENABLED", "").strip().casefold() == "true"
    email = os.getenv("DEMO_LOGIN_EMAIL", "").strip()
    if not enabled:
        raise HTTPException(status_code=404, detail="Demo access is not enabled.")
    if not email:
        raise HTTPException(status_code=503, detail="Demo access is not configured.")

    _enforce_demo_rate_limit(request)

    try:
        from firebase_admin import auth
        app = get_firebase_admin_app()
        user = auth.get_user_by_email(email, app=app)
        project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
        subject = f"firebase:{project_id}:{user.uid}"
        super_admin_uids = {
            item.strip()
            for item in os.getenv("PLATFORM_SUPER_ADMIN_UIDS", "").replace(";", ",").split(",")
            if item.strip()
        }
        if subject in super_admin_uids:
            raise HTTPException(status_code=403, detail="The configured demo identity cannot have platform-wide access.")

        factory = getattr(request.app.state, "session_factory", None)
        if factory is None:
            raise HTTPException(status_code=503, detail="Demo workspace storage is unavailable.")
        with factory() as session:
            delegated_role = session.scalar(
                select(PlatformRoleGrant.id).where(
                    PlatformRoleGrant.user_subject == subject,
                    PlatformRoleGrant.is_active.is_(True),
                ).limit(1)
            )
        if delegated_role is not None:
            raise HTTPException(status_code=403, detail="The configured demo identity cannot have platform-wide access.")

        custom_token = auth.create_custom_token(user.uid, app=app)
    except HTTPException:
        raise
    except Exception as exc:
        # Keep identity-provider details and account existence out of public errors.
        raise HTTPException(status_code=503, detail="Demo sign-in is temporarily unavailable.") from exc

    token = custom_token.decode("utf-8") if isinstance(custom_token, bytes) else str(custom_token)
    return {"custom_token": token}
