"""Minimal local-only FastAPI entry point for AI Business Assistant."""

from fastapi import FastAPI

app = FastAPI(
    title="AI Business Assistant API",
    version="0.1.0",
    description=(
        "Local development starter. No database, authentication, or production "
        "integrations are configured yet."
    ),
)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Report that the API process is responding; not a dependency health check."""
    return {"status": "ok"}
