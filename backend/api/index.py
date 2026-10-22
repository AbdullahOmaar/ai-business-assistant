"""Vercel Python Function entry point for the existing FastAPI backend."""

from app.main import app

# Vercel discovers this exported ASGI application and serves the API routes.
