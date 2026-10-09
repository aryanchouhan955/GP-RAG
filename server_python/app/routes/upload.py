"""
app/routes/upload.py
─────────────────────
POST /upload/pdf  →  Upload a PDF for processing.

HOW IT WORKS (3 steps):
  1. Validate  → check file size and MIME type before touching any DB
  2. Store     → save raw PDF bytes in MongoDB GridFS, create a document
                 record with status="processing"
  3. Enqueue   → push a job to the Redis queue; the worker process picks
                 it up, embeds the chunks, and updates the status to "ready"

The API returns immediately with a file_id.
The frontend polls GET /documents to watch status change to "ready".
"""
import json
import logging

from fastapi import APIRouter, File, Header, HTTPException, UploadFile

from app import connections
from app.config import GEMINI_API_KEY, MAX_PDF_SIZE_BYTES, MAX_PDF_SIZE_MB, QDRANT_COLLECTION
from app.models.schemas import UploadResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Upload"])


@router.post(
    "/upload/pdf",
    response_model=UploadResponse,
    summary="Upload a PDF for RAG processing",
    status_code=202,   # 202 Accepted — work happens asynchronously
)
async def upload_pdf(
    pdf: UploadFile = File(..., description="PDF file to embed (max 20 MB)"),
    x_gemini_api_key: str = Header(default=None, description="Your Gemini API key"),
    x_user_id: str = Header(default="anonymous", description="Clerk user ID"),
) -> UploadResponse:
    """
    Upload a PDF and queue it for background processing.

    The PDF is stored in MongoDB GridFS immediately.
    A background worker (worker.py) picks up the job, splits the PDF into
    chunks, generates embeddings with Gemini, and stores them in Qdrant.
    """
    # ── Step 1: Validate ──────────────────────────────────────────────────────
    content = await pdf.read()

    if len(content) > MAX_PDF_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_PDF_SIZE_MB} MB.",
        )

    if pdf.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(
            status_code=415,
            detail="Only PDF files are accepted.",
        )

    # ── Step 2: Store in MongoDB GridFS ───────────────────────────────────────
    file_id = connections.fs.put(content, filename=pdf.filename)

    # Insert a tracking record so the frontend can poll for status
    connections.db.documents.insert_one({
        "file_id": file_id,
        "filename": pdf.filename,
        "status": "processing",
        "user_id": x_user_id,
    })

    logger.info("PDF stored in GridFS: file_id=%s  user=%s  size=%d bytes",
                file_id, x_user_id, len(content))

    # ── Step 3: Enqueue background job ────────────────────────────────────────
    api_key = x_gemini_api_key or GEMINI_API_KEY

    job_payload = {
        "file_id": str(file_id),
        "filename": pdf.filename,
        "api_key": api_key,
        "user_id": x_user_id,
        "collection_name": QDRANT_COLLECTION,
    }

    # Use a dotted-string function reference so the API server never imports
    # worker.py (which would load heavy ML dependencies into the API process)
    from rq import Retry
    connections.task_queue.enqueue(
        "worker.process_pdf",
        json.dumps(job_payload),
        retry=Retry(max=3, interval=[10, 30, 60]),
        job_timeout=600,    # 10 minutes max per job
    )

    logger.info("Job enqueued for file_id=%s", file_id)
    return UploadResponse(message="File uploaded — processing started", file_id=str(file_id))
