"""
app/routes/health.py
─────────────────────
GET /  →  Liveness probe endpoint.

Purpose: Let deployment tools (Docker, Kubernetes, Render, Railway, etc.)
         know the server is alive. Returns a simple JSON response.
"""
from fastapi import APIRouter
from app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/", response_model=HealthResponse, summary="Liveness probe")
def health_check() -> HealthResponse:
    """Returns 200 OK when the server is running."""
    return HealthResponse(status="ok")
