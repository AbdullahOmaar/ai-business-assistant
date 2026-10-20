"""Local-first FastAPI entry point for AI Business Assistant."""
from fastapi import FastAPI

from app.api import router as business_router

app = FastAPI(
    title="AI Business Assistant API",
    version="0.2.0",
    description=(
        "Local-first business workflows. Business endpoints fail closed until "
        "the host configures PostgreSQL sessions and a trusted identity verifier."
    ),
)
app.include_router(business_router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Report process liveness only; does not imply database readiness."""
    return {"status": "ok"}
