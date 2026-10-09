# GP-RAG Python Server

A FastAPI server implementing **Retrieval-Augmented Generation (RAG)** — upload PDFs, ask questions, get AI answers grounded in your documents.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **API Framework** | FastAPI | HTTP server, routing, validation |
| **AI / LLM** | Google Gemini (`gemini-2.0-flash`) | Generates answers |
| **Embeddings** | Google Gemini (`text-embedding-004`) | Converts text → vectors |
| **Vector DB** | Qdrant | Stores and searches embeddings |
| **File Storage** | MongoDB GridFS | Stores raw PDF bytes |
| **Document Tracking** | MongoDB | Tracks upload status (processing/ready/failed) |
| **Job Queue** | Redis + RQ | Background PDF processing |
| **Schema Validation** | Pydantic v2 | Request/response validation |
| **Auth** | Clerk (via `x-user-id` header) | Per-user document isolation |

---

## How It Works

```
User uploads PDF
       │
       ▼
POST /upload/pdf
  1. Validate file (size, type)
  2. Store PDF bytes in MongoDB GridFS
  3. Insert doc record (status="processing")
  4. Enqueue job → Redis queue
       │
       ▼
worker.py (separate process)
  1. Fetch PDF from GridFS
  2. Split into chunks (LangChain)
  3. Embed chunks (Google Gemini)
  4. Store vectors in Qdrant
  5. Update doc status → "ready"
       │
       ▼
POST /chat
  1. Embed user question (Gemini)
  2. Search Qdrant for similar chunks (filtered by user_id)
  3. Build prompt: system + context + history + question
  4. Stream Gemini response as SSE tokens
```

---

## Project Structure

```
server_python/
├── main.py                   ← FastAPI app entry point
├── worker.py                 ← Background PDF embedding worker
├── requirements.txt          ← Python dependencies
├── .env                      ← Your secret keys (never commit!)
├── .env.example              ← Template for .env
└── app/
    ├── config.py             ← ALL environment variables (one place)
    ├── connections.py        ← Singleton holders for DB connections
    ├── lifespan.py           ← Opens/closes connections on startup/shutdown
    ├── models/
    │   └── schemas.py        ← Pydantic request/response schemas
    ├── routes/
    │   ├── health.py         ← GET  /
    │   ├── upload.py         ← POST /upload/pdf
    │   ├── documents.py      ← GET  /documents
    │   └── chat.py           ← POST /chat (SSE streaming)
    └── services/
        ├── embeddings.py     ← Gemini embeddings client (cached)
        └── vector_store.py   ← Qdrant search helpers
```

---

## Running Locally

### 1. Install dependencies
```bash
cd server_python
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

### 2. Set up environment variables
```bash
copy .env.example .env
# Edit .env with your API keys
```

### 3. Start the API server
```bash
uvicorn main:app --reload
```

### 4. Start the background worker (separate terminal)
```bash
python worker.py
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Liveness probe |
| `POST` | `/upload/pdf` | Upload a PDF (starts background processing) |
| `GET` | `/documents` | List current user's documents |
| `POST` | `/chat` | RAG chat — streams response as SSE |
| `GET` | `/docs` | Interactive API docs (Swagger UI) |
| `GET` | `/redoc` | API docs (ReDoc) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `QDRANT_URL` | Yes | Qdrant cluster URL |
| `QDRANT_API_KEY` | Yes | Qdrant API key |
| `QDRANT_COLLECTION_NAME` | No | Default: `gp-rag-docs` |
| `REDIS_URL` | Yes | Redis connection URL |
| `MONGO_URI` | Yes | MongoDB connection string |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |
