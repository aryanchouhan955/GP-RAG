"""
worker.py
─────────
Background worker process — runs SEPARATELY from the FastAPI server.

HOW TO RUN:
    python worker.py

HOW IT WORKS:
  1. Listens on the Redis "file-upload-queue" for jobs
  2. When a job arrives, calls process_pdf(job_data_str)
  3. process_pdf:
       a. Fetches the PDF from MongoDB GridFS using the file_id
       b. Splits it into chunks using LangChain's text splitter
       c. Generates embeddings using Google Gemini
       d. Stores the vectors in Qdrant
       e. Updates the MongoDB document status to "ready" (or "failed")
  4. If the job fails, RQ retries up to 3 times (set in upload.py)

IMPORTANT:
  This process loads ML libraries (LangChain, Gemini, Qdrant).
  It intentionally does NOT share memory with the FastAPI server —
  they only communicate via Redis (job queue) and MongoDB (status updates).
"""
import os
import json
import logging
import tempfile

import pymongo
import gridfs
from bson.objectid import ObjectId
from dotenv import load_dotenv
from redis import Redis
from rq import SimpleWorker as Worker, Queue
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

load_dotenv()

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Read environment variables ─────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

# ── Create singleton connections (reused across jobs) ─────────────────────────
redis_conn = Redis.from_url(REDIS_URL)

mongo_client = pymongo.MongoClient(
    MONGO_URI,
    tlsAllowInvalidCertificates=True,  # fixes SSL handshake error with MongoDB Atlas
)
db = mongo_client.get_database("gp_rag")
fs = gridfs.GridFS(db)

qdrant_client = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY,
    timeout=30,
    check_compatibility=False,
)

logger.info("Worker connections established")


# ── Helper: update document status in MongoDB ──────────────────────────────────
def _update_status(file_id: ObjectId, status: str, **extra_fields):
    """Set the status field (and any extra fields) on the document record."""
    db.documents.update_one(
        {"file_id": file_id},
        {"$set": {"status": status, **extra_fields}},
    )


# ── Main job function ──────────────────────────────────────────────────────────
def process_pdf(job_data_str: str):
    """
    Process a single PDF upload job.

    Args:
        job_data_str: JSON string with keys:
            - file_id         : MongoDB GridFS ObjectId (as string)
            - filename        : original filename for metadata
            - api_key         : Gemini API key (user's or server's)
            - user_id         : Clerk user ID for per-user filtering
            - collection_name : Qdrant collection to store vectors in
    """
    # ── Parse job payload ──────────────────────────────────────────────────────
    data = json.loads(job_data_str)
    file_id_str = data["file_id"]
    filename = data.get("filename", "Uploaded PDF")
    api_key = data.get("api_key") or os.getenv("GEMINI_API_KEY")
    user_id = data.get("user_id", "anonymous")
    collection_name = data.get("collection_name", "gp-rag-docs")

    file_id = ObjectId(file_id_str)
    logger.info("Job started: file=%s  user=%s  collection=%s", filename, user_id, collection_name)

    # ── Step 1: Fetch PDF from MongoDB GridFS ──────────────────────────────────
    try:
        grid_out = fs.get(file_id)
        pdf_bytes = grid_out.read()
        logger.info("Fetched %d bytes from GridFS", len(pdf_bytes))
    except Exception as e:
        logger.error("Failed to fetch from GridFS: %s", e)
        _update_status(file_id, "failed", error=str(e))
        return   # don't retry GridFS failures (file is gone)

    # ── Step 2: Write to temp file → load pages → split into chunks ────────────
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdf_bytes)
            temp_path = tmp.name

        # Load PDF pages (each page becomes a LangChain Document)
        loader = PyPDFLoader(temp_path)
        pages = loader.load()
        logger.info("Loaded %d pages from PDF", len(pages))

        # Replace temp file path in metadata with the real filename
        for page in pages:
            page.metadata["source"] = filename

        # Split pages into overlapping chunks for better retrieval
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=["\n\n", "\n", ".", " ", ""],
        )
        chunks = splitter.split_documents(pages)
        logger.info("Split into %d chunks (size=%d, overlap=%d)",
                    len(chunks), CHUNK_SIZE, CHUNK_OVERLAP)

        # Tag every chunk with user_id so Qdrant can filter by owner
        for chunk in chunks:
            chunk.metadata["user_id"] = user_id

        # ── Step 3: Embed chunks and store in Qdrant ───────────────────────────
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=api_key,
        )

        vector_store = QdrantVectorStore(
            client=qdrant_client,       # reuse singleton — no new connection
            collection_name=collection_name,
            embedding=embeddings,
        )

        vector_store.add_documents(chunks)
        logger.info("Stored %d vectors in Qdrant collection '%s'", len(chunks), collection_name)

        # ── Step 4: Mark document as ready ────────────────────────────────────
        _update_status(file_id, "ready", chunk_count=len(chunks))
        logger.info("Job complete: file=%s  chunks=%d", filename, len(chunks))

    except Exception as e:
        logger.error("Embedding failed for file=%s: %s", filename, e)
        _update_status(file_id, "failed", error=str(e))
        raise   # re-raise so RQ marks the job as failed and can retry

    finally:
        # Always clean up the temp file, even if an error occurred
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
            logger.debug("Temp file cleaned up: %s", temp_path)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    queue = Queue("file-upload-queue", connection=redis_conn)
    worker = Worker([queue], connection=redis_conn)
    logger.info("Worker listening on 'file-upload-queue'…  (Press Ctrl+C to stop)")
    worker.work()
