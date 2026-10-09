"""
app/routes/documents.py
────────────────────────
GET /documents  →  List the current user's uploaded documents.

Returns documents sorted newest-first, each with:
  - file_id   : GridFS object ID
  - filename  : original PDF filename
  - status    : "processing" | "ready" | "failed"
  - chunk_count: how many chunks were embedded (only when status="ready")

Anonymous users receive an empty list (no DB query is made).
"""
import logging

from fastapi import APIRouter, Header
from app import connections
from app.models.schemas import DocumentsResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Documents"])


@router.get(
    "/documents",
    response_model=DocumentsResponse,
    summary="List the current user's documents",
)
async def list_documents(
    x_user_id: str = Header(default="anonymous", description="Clerk user ID"),
) -> DocumentsResponse:
    """
    Return all documents belonging to the authenticated user.
    The list is sorted newest-first.
    """
    if x_user_id == "anonymous":
        # Don't run a DB query for unauthenticated requests
        return DocumentsResponse(documents=[])

    raw_docs = connections.db.documents.find(
        {"user_id": x_user_id}
    ).sort("_id", -1)    # -1 = newest first

    # Convert MongoDB ObjectIds to strings (JSON can't serialize ObjectId)
    documents = []
    for doc in raw_docs:
        doc["_id"] = str(doc["_id"])
        doc["file_id"] = str(doc["file_id"])
        documents.append(doc)

    logger.debug("Returning %d documents for user=%s", len(documents), x_user_id)
    return DocumentsResponse(documents=documents)
