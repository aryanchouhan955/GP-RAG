"""
app/config.py
─────────────
Single source of truth for all environment variables.

Rules:
  - Only this file calls os.getenv().
  - Every other module imports from here.
  - All values are typed and documented.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── Google Gemini ─────────────────────────────────────────────────────────────
GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
GEMINI_CHAT_MODEL: str = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.0-flash")
GEMINI_EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004")

# ── Qdrant (Vector Database) ──────────────────────────────────────────────────
QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY: str | None = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION_NAME", "gp-rag-docs")

# ── Redis (Job Queue) ─────────────────────────────────────────────────────────
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
REDIS_QUEUE_NAME: str = "file-upload-queue"

# ── MongoDB (File Storage + Document Tracking) ────────────────────────────────
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME: str = "gp_rag"

# ── CORS ──────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

# ── Upload Settings ───────────────────────────────────────────────────────────
MAX_PDF_SIZE_MB: int = 20
MAX_PDF_SIZE_BYTES: int = MAX_PDF_SIZE_MB * 1024 * 1024

# ── RAG Retrieval Settings ────────────────────────────────────────────────────
RETRIEVAL_TOP_K: int = 4                 # number of chunks to retrieve per query
CHUNK_SIZE: int = 800                    # characters per chunk
CHUNK_OVERLAP: int = 100                 # overlap between chunks
