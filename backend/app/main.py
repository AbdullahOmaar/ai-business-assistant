"""FastAPI application entry point and production runtime configuration."""
import os
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.api import router as business_router
from app.assistant_api import router as assistant_router
from app.core_features_api import router as core_features_router
from app.extended_api import router as extended_business_router
from app.database import create_database_engine
from app.firebase_auth import configure_firebase_auth
from app.platform_admin_api import router as platform_admin_router
from app.employee_payroll_api import router as employee_payroll_router

CORS_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

app = FastAPI(
    title="AI Business Assistant API",
    version="1.3.4",
    description=(
        "Business workflows with PostgreSQL, Firebase ID-token verification, "
        "tenant-scoped authorization, and grounded assistant chat."
    ),
)

@app.middleware("http")
async def attach_request_id(request, call_next):
    """Attach a server-generated correlation ID without trusting caller input."""
    request_id = str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=CORS_ALLOWED_METHODS,
        allow_headers=["Authorization", "Content-Type", "Accept"],
        expose_headers=["X-Request-ID"],
    )

app.include_router(business_router)
app.include_router(core_features_router)
app.include_router(extended_business_router)
app.include_router(assistant_router)
app.include_router(platform_admin_router)
app.include_router(employee_payroll_router)


@app.on_event("startup")
def configure_runtime() -> None:
    """Initialize production dependencies only when explicitly configured."""
    if os.getenv("DATABASE_URL", "").strip():
        engine = create_database_engine()
        app.state.database_engine = engine
        app.state.session_factory = sessionmaker(
            bind=engine, autoflush=False, expire_on_commit=False
        )
    configure_firebase_auth(app)


@app.on_event("shutdown")
def close_runtime() -> None:
    engine = getattr(app.state, "database_engine", None)
    if engine is not None:
        engine.dispose()
        del app.state.database_engine
        if hasattr(app.state, "session_factory"):
            del app.state.session_factory


@app.get("/version", tags=["health"])
def version_info() -> dict[str, str]:
    """Expose non-sensitive release metadata so the UI can detect stale API deployments."""
    commit = os.getenv("VERCEL_GIT_COMMIT_SHA", "").strip() or os.getenv("GITHUB_SHA", "").strip() or "unknown"
    return {
        "version": app.version,
        "commit": commit[:12],
        "environment": os.getenv("VERCEL_ENV", "unknown"),
    }


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Report process liveness only; does not imply database readiness."""
    return {"status": "ok"}


@app.get("/readyz", tags=["health"])
def readiness_check() -> dict[str, str]:
    """Return ready only when database and trusted identity verification exist."""
    factory = getattr(app.state, "session_factory", None)
    resolver = getattr(app.state, "principal_resolver", None)
    if factory is None or resolver is None:
        raise HTTPException(
            status_code=503,
            detail="Readiness requires PostgreSQL and configured Firebase token verification.",
        )
    try:
        with factory() as session:
            session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database readiness check failed.") from exc
    return {"status": "ready"}
