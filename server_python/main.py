"""
main.py
───────
GP-RAG FastAPI application entry point.

HOW TO RUN:
    uvicorn main:app --reload

API DOCS (auto-generated):
    http://localhost:8000/docs    (Swagger UI)
    http://localhost:8000/redoc   (ReDoc)

ARCHITECTURE:
    main.py         → creates the app, registers middleware and routers
    app/config.py   → all environment variables in one place
    app/lifespan.py → opens/closes DB connections on startup/shutdown
    app/connections.py → shared connection singletons
    app/routes/     → one file per endpoint group (health, upload, chat, documents)
    app/services/   → business logic (embeddings cache, vector search)
    app/models/     → Pydantic schemas for request/response validation
    worker.py       → separate process that handles background PDF embedding
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.config import ALLOWED_ORIGINS
from app.lifespan import lifespan
from app.routes import health, upload, documents, chat

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="GP-RAG API",
    description=(
        "Retrieval-Augmented Generation API.\n\n"
        "Upload a PDF → ask questions → get AI answers grounded in your document."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS Middleware ────────────────────────────────────────────────────────────
# Allow the Next.js frontend to call this API from a different port/domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
# Each router lives in its own file in app/routes/
app.include_router(health.router)       # GET  /
app.include_router(upload.router)       # POST /upload/pdf
app.include_router(documents.router)    # GET  /documents
app.include_router(chat.router)         # POST /chat  (SSE streaming)


# ── Favicon ────────────────────────────────────────────────────────────────────
# Browsers auto-request /favicon.ico — return 204 to avoid 404 log noise
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)
