# 📄 GP-RAG — PDF-Powered RAG Chat Application

A full-stack **Retrieval-Augmented Generation (RAG)** application that lets users upload PDF documents and ask natural-language questions against their content. The system extracts text from PDFs, generates vector embeddings, stores them in a vector database, and uses GPT-4.1 to answer queries with context-aware responses.

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT  (Next.js 15)                         │
│                                                                     │
│  ┌─────────────────┐       ┌────────────────────────────────────┐   │
│  │  FileUpload      │       │  ChatComponent                    │   │
│  │  Component        │       │  - Send message → GET /chat       │   │
│  │  - PDF select     │       │  - Display AI response            │   │
│  │  - POST /upload   │       │  - Show source documents          │   │
│  └────────┬──────────┘       └────────────────┬─────────────────┘   │
│           │                                   │                     │
│           │  Clerk Auth (middleware.ts)        │                     │
└───────────┼───────────────────────────────────┼─────────────────────┘
            │ HTTP                              │ HTTP
            ▼                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    SERVER  (Express.js on Node)                      │
│                                                                     │
│  POST /upload/pdf                        GET /chat?message=...      │
│  ┌──────────────────┐               ┌──────────────────────────┐    │
│  │ Multer saves PDF │               │ 1. Embed user query      │    │
│  │ to /uploads      │               │    (OpenAI Embeddings)   │    │
│  │                  │               │ 2. Retrieve top-2 chunks │    │
│  │ Enqueue job to   │               │    from Qdrant           │    │
│  │ BullMQ queue     │               │ 3. Build system prompt   │    │
│  └───────┬──────────┘               │    with context          │    │
│          │                          │ 4. Call GPT-4.1          │    │
│          │                          │ 5. Return answer + docs  │    │
│          │                          └──────────────────────────┘    │
│          ▼                                                          │
│  ┌────────────────────────────────────────────────┐                 │
│  │              WORKER  (worker.js)                │                 │
│  │  BullMQ Worker listens on "file-upload-queue"   │                 │
│  │  1. Load PDF  (PDFLoader from LangChain)        │                 │
│  │  2. Generate embeddings (text-embedding-3-small)│                 │
│  │  3. Store vectors in Qdrant                     │                 │
│  └─────────────────────┬──────────────────────────┘                 │
│                        │                                            │
└────────────────────────┼────────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                                 ▼
┌───────────────┐               ┌─────────────────┐
│    Valkey      │               │    Qdrant        │
│  (Redis-fork)  │               │  Vector Database │
│   Port: 6379   │               │   Port: 6333     │
│                │               │                  │
│  Job queue     │               │  Stores PDF      │
│  backing store │               │  chunk vectors   │
└────────────────┘               └──────────────────┘
```

### Data Flow

1. **Upload Flow** — User selects a PDF → Client `POST`s it to `/upload/pdf` → Multer saves the file to disk → A BullMQ job is enqueued → The Worker picks up the job, loads the PDF, generates embeddings via OpenAI, and stores them in Qdrant.

2. **Chat Flow** — User types a question → Client `GET`s `/chat?message=...` → Server embeds the query, performs a similarity search in Qdrant (top-2 chunks), builds a system prompt with the retrieved context, calls GPT-4.1, and returns the answer along with source document references.

---

## 🛠️ Technology Stack

### Frontend (`/client`)

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 15.3.0 | React framework with App Router & Turbopack |
| **React** | 19.x | UI library |
| **TypeScript** | 5.x | Type-safe JavaScript |
| **Tailwind CSS** | 4.x | Utility-first CSS framework |
| **shadcn/ui** | (new-york style) | Pre-built accessible UI components (Button, Input) |
| **Lucide React** | 0.488.x | Icon library |
| **Clerk** | 6.15.x | Authentication & user management |
| **Geist Font** | — | Typography via `next/font` |

### Backend (`/server`)

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | — | JavaScript runtime |
| **Express.js** | 4.x | HTTP server framework |
| **LangChain.js** | 0.3.x | LLM orchestration framework |
| **@langchain/openai** | 0.5.x | OpenAI embeddings integration |
| **@langchain/qdrant** | 0.1.x | Qdrant vector store integration |
| **@langchain/community** | 0.3.x | PDF document loader |
| **@langchain/textsplitters** | 0.1.x | Text chunking utilities |
| **OpenAI SDK** | 4.94.x | Direct API calls to GPT-4.1 |
| **BullMQ** | 5.49.x | Redis-backed job queue for async PDF processing |
| **Multer** | 1.4.5 | Multipart file upload middleware |
| **pdf-parse** | 1.1.x | PDF text extraction (used by LangChain's PDFLoader) |
| **CORS** | 2.8.x | Cross-origin request handling |

### Infrastructure (Docker)

| Service | Image | Port | Purpose |
|---|---|---|---|
| **Valkey** | `valkey/valkey` | 6379 | Redis-compatible in-memory store for BullMQ job queue |
| **Qdrant** | `qdrant/qdrant` | 6333 | High-performance vector database for storing PDF embeddings |

### AI / ML

| Component | Model | Purpose |
|---|---|---|
| **Embeddings** | `text-embedding-3-small` (OpenAI) | Convert text chunks and queries into vector representations |
| **Chat Completion** | `gpt-4.1` (OpenAI) | Generate natural-language answers from retrieved context |

---

## 📁 Project Structure

```
rag-main/
├── docker-compose.yml          # Valkey + Qdrant containers
├── .gitignore
│
├── client/                     # Frontend (Next.js 15)
│   ├── app/
│   │   ├── layout.tsx          # Root layout with Clerk auth provider
│   │   ├── page.tsx            # Main page — file upload + chat
│   │   ├── globals.css         # Tailwind + shadcn/ui theme tokens
│   │   └── components/
│   │       ├── file-upload.tsx  # PDF upload component
│   │       └── chat.tsx        # Chat interface component
│   ├── components/
│   │   └── ui/
│   │       ├── button.tsx      # shadcn/ui Button
│   │       └── input.tsx       # shadcn/ui Input
│   ├── lib/
│   │   └── utils.ts            # Utility functions (cn helper)
│   ├── middleware.ts           # Clerk authentication middleware
│   ├── next.config.ts          # Next.js configuration
│   ├── components.json         # shadcn/ui configuration
│   ├── tsconfig.json           # TypeScript configuration
│   └── package.json
│
└── server/                     # Backend (Express + LangChain)
    ├── index.js                # Express API server (port 8000)
    ├── worker.js               # BullMQ worker for PDF processing
    ├── uploads/                # Uploaded PDF files (disk storage)
    └── package.json
```

---

## 🔐 Authentication

The application uses [**Clerk**](https://clerk.com/) for authentication:

- The `ClerkProvider` wraps the entire app in `layout.tsx`.
- `middleware.ts` enforces auth on all routes except static assets.
- Unauthenticated users see a **Sign Up** button; authenticated users see the main app with their `UserButton`.

---

## 🚀 Running Locally

### Prerequisites

Make sure you have the following installed on your PC:

| Tool | Download Link |
|---|---|
| **Node.js** (v18+) | [https://nodejs.org](https://nodejs.org) |
| **Docker Desktop** | [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) |
| **pnpm** _(recommended)_ or **npm** | `npm install -g pnpm` |
| **Git** | [https://git-scm.com](https://git-scm.com) |

### Step 1 — Clone the Repository

```bash
git clone https://github.com/aryanchouhan955/GP-RAG.git
cd GP-RAG
```

### Step 2 — Start Infrastructure Services (Docker)

Start Qdrant (vector database) and Valkey (Redis-compatible queue store):

```bash
docker-compose up -d
```

> This starts:
> - **Valkey** on `localhost:6379`
> - **Qdrant** on `localhost:6333`

Verify the containers are running:

```bash
docker ps
```

### Step 3 — Set Up the Server

```bash
cd server
```

#### 3a. Add `"type": "module"` to `package.json`

The server uses ES module `import` syntax, so you need to ensure the `package.json` includes:

```json
{
  "type": "module",
  ...
}
```

> ⚠️ **Without this, Node.js will throw `SyntaxError: Cannot use import statement outside a module`.**

#### 3b. Configure your OpenAI API Key

Open `server/index.js` and `server/worker.js` and add your OpenAI API key in the relevant places:

```js
// index.js — line 10
const client = new OpenAI({
  apiKey: 'sk-your-openai-api-key-here',
});

// index.js — line 55
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
  apiKey: 'sk-your-openai-api-key-here',
});

// worker.js — line 27
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
  apiKey: 'sk-your-openai-api-key-here',
});
```

> 💡 **Tip:** For better security, use environment variables instead of hardcoding:
> ```bash
> # Create a .env file in /server
> OPENAI_API_KEY=sk-your-key-here
> ```
> Then read it with `process.env.OPENAI_API_KEY` (you'll need the `dotenv` package or Node's `--env-file` flag).

#### 3c. Install Dependencies

```bash
npm install --legacy-peer-deps
```

> The `--legacy-peer-deps` flag is needed to resolve peer dependency conflicts between `better-sqlite3` and `typeorm` (transitive dependencies from LangChain).

#### 3d. Start the Server and Worker

You need **two terminal windows** for the server:

**Terminal 1 — API Server:**
```bash
npm run dev
```
> Server starts on [http://localhost:8000](http://localhost:8000)

**Terminal 2 — Background Worker:**
```bash
npm run dev:worker
```
> Worker starts listening on the `file-upload-queue` BullMQ queue.

### Step 4 — Set Up the Client

```bash
cd client
```

#### 4a. Set Up Clerk Authentication

1. Create a free account at [https://clerk.com](https://clerk.com)
2. Create a new application in the Clerk dashboard
3. Copy your API keys
4. Create a `.env.local` file in the `/client` directory:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your-key-here
CLERK_SECRET_KEY=sk_test_your-key-here
```

#### 4b. Install Dependencies

```bash
npm install
```

#### 4c. Start the Development Server

```bash
npm run dev
```

> Client starts on [http://localhost:3000](http://localhost:3000) with Turbopack for fast HMR.

### Step 5 — Use the Application

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. **Sign up / Sign in** via Clerk.
3. **Upload a PDF** using the upload panel on the left.
4. Wait a few seconds for the worker to process and embed the PDF.
5. **Ask questions** in the chat panel on the right — the AI will answer based on the PDF content.

---

## 🧩 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check — returns `{ status: "All Good!" }` |
| `POST` | `/upload/pdf` | Upload a PDF file (multipart form, field: `pdf`) |
| `GET` | `/chat?message=<query>` | Ask a question — returns AI answer + source documents |

### Example Chat Response

```json
{
  "message": "Based on the PDF, the answer is...",
  "docs": [
    {
      "pageContent": "...relevant chunk text...",
      "metadata": {
        "loc": { "pageNumber": 3 },
        "source": "uploads/1744794526335-85423179-sample.pdf"
      }
    }
  ]
}
```

---

## ⚠️ Troubleshooting

| Issue | Solution |
|---|---|
| `npm install` fails with `ERESOLVE` | Use `npm install --legacy-peer-deps` |
| `Cannot use import statement outside a module` | Add `"type": "module"` to `server/package.json` |
| `ECONNREFUSED 127.0.0.1:6379` | Ensure Docker is running and Valkey container is up: `docker-compose up -d` |
| `ECONNREFUSED 127.0.0.1:6333` | Ensure Qdrant container is running: `docker-compose up -d` |
| Chat returns errors about collection | Upload at least one PDF first so the Qdrant collection gets created |
| Clerk auth errors | Ensure `.env.local` has valid Clerk keys |
| OpenAI API errors | Verify your API key is correctly set and has sufficient credits |
| Worker not processing PDFs | Make sure the worker is running in a separate terminal: `npm run dev:worker` |

---

## 📜 License

ISC

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request
