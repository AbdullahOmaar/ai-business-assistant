"""Public synthetic-demo session bootstrap.

The endpoint never accepts or returns a password. It mints a short-lived,
single-use Firebase custom token for one explicitly configured demo identity.
It is disabled unless DEMO_LOGIN_ENABLED=true and DEMO_LOGIN_EMAIL is set.
"""
import os

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from app.models import PlatformRoleGrant

from app.firebase_auth import get_firebase_admin_app

router = APIRouter(prefix="/api/v1/demo", tags=["demo access"])


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
