"""
app/routes/chat.py
───────────────────
POST /chat  →  RAG-powered streaming chat endpoint.

HOW IT WORKS (4 steps):
  1. Validate  → check API key is present
  2. Retrieve  → find the most relevant PDF chunks from Qdrant using the
                 user's question as the search query
  3. Build     → construct the full prompt: system context + history + question
  4. Stream    → stream Gemini's response token-by-token as Server-Sent Events

SSE EVENT TYPES:
  {"type": "docs",  "data": [...]}   → citations, sent first so UI shows them immediately
  {"type": "chunk", "data": "text"}  → one token of the AI response
  {"type": "done"}                   → signals the end of the stream
  {"type": "error", "data": "msg"}   → sent if Gemini throws an error mid-stream
"""
import json
import logging

from fastapi import APIRouter, Header, HTTPException
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app import connections
from app.config import GEMINI_API_KEY, GEMINI_CHAT_MODEL
from app.models.schemas import ChatRequest
from app.services.embeddings import get_embeddings
from app.services.vector_store import retrieve_chunks

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Chat"])

# System prompt template — injected with retrieved context before each request
SYSTEM_PROMPT_TEMPLATE = """\
You are a helpful AI assistant. Answer the user's question using ONLY the \
context retrieved from their PDF documents below.

Rules:
- If the answer is not in the context, say "I couldn't find that in your documents."
- Be concise and clear.
- Use markdown formatting where helpful (bullet points, bold text, etc.)

Context:
{context}
"""


@router.post("/chat", summary="RAG chat — streams response as Server-Sent Events")
async def chat_endpoint(
    body: ChatRequest,
    x_user_id: str = Header(default="anonymous", description="Clerk user ID"),
    x_gemini_api_key: str = Header(default=None, description="Your Gemini API key"),
):
    """
    Accepts a user message + conversation history.
    Retrieves relevant document chunks, builds a prompt, and streams the
    Gemini response back as Server-Sent Events (SSE).
    """
    # ── Step 1: Validate ──────────────────────────────────────────────────────
    api_key = x_gemini_api_key or GEMINI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="A Gemini API key is required. Set it in the sidebar.",
        )

    # ── Step 2: Retrieve relevant chunks from Qdrant ─────────────────────────
    try:
        embeddings = get_embeddings(api_key)
        chunks = retrieve_chunks(
            client=connections.qdrant_client,
            embeddings=embeddings,
            query=body.message,
            user_id=x_user_id,
        )
    except Exception as e:
        logger.error("Qdrant retrieval failed: %s", e)
        raise HTTPException(status_code=503, detail=f"Vector search unavailable: {e}")

    logger.info("Retrieved %d chunks for user=%s query='%s'",
                len(chunks), x_user_id, body.message[:60])

    # ── Step 3: Build prompt ──────────────────────────────────────────────────
    # Format chunks as citations for the frontend
    citations = [
        {
            "pageContent": doc.page_content,
            "metadata": {
                "source": doc.metadata.get("source", "Unknown"),
                "loc": {"pageNumber": doc.metadata.get("page", 0) + 1},
            },
        }
        for doc in chunks
    ]

    # Combine chunk text into a single context block
    context = "\n\n---\n\n".join(doc.page_content for doc in chunks)
    system_message = SystemMessage(
        content=SYSTEM_PROMPT_TEMPLATE.format(context=context)
    )

    # Convert history + current question into LangChain message objects
    messages = [system_message]
    for turn in body.history:
        if turn.role == "assistant":
            messages.append(AIMessage(content=turn.content))
        else:
            messages.append(HumanMessage(content=turn.content))
    messages.append(HumanMessage(content=body.message))

    # ── Step 4: Stream Gemini response as SSE ─────────────────────────────────
    chat_model = ChatGoogleGenerativeAI(
        model=GEMINI_CHAT_MODEL,
        google_api_key=api_key,
    )

    async def event_generator():
        # Send citations first — frontend can render them before the answer arrives
        yield {"data": json.dumps({"type": "docs", "data": citations})}

        try:
            async for chunk in chat_model.astream(messages):
                if chunk.content:
                    yield {"data": json.dumps({"type": "chunk", "data": chunk.content})}

            yield {"data": json.dumps({"type": "done"})}

        except Exception as e:
            logger.error("Gemini streaming error: %s", e)
            yield {"data": json.dumps({"type": "error", "data": str(e)})}

    return EventSourceResponse(event_generator())
