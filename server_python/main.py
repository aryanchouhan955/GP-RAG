import os
import json
import uuid
from fastapi import FastAPI, UploadFile, File, Request, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from rq import Queue
from redis import Redis
from dotenv import load_dotenv

from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from langchain_core.messages import SystemMessage, HumanMessage

from worker import process_pdf

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_conn = Redis.from_url(redis_url)
task_queue = Queue('file-upload-queue', connection=redis_conn)

import pymongo
import gridfs

mongo_client = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
db = mongo_client.get_database("gp_rag")
fs = gridfs.GridFS(db)

@app.get("/")
def read_root():
    return {"status": "All Good!"}

@app.post("/upload/pdf")
async def upload_pdf(pdf: UploadFile = File(...), x_gemini_api_key: str = Header(default=None)):
    content = await pdf.read()
    
    # Store directly in MongoDB GridFS
    file_id = fs.put(content, filename=pdf.filename)
    
    # Store document status in MongoDB
    db.documents.insert_one({
        "file_id": file_id,
        "filename": pdf.filename,
        "status": "processing"
    })
        
    api_key = x_gemini_api_key or os.getenv("GEMINI_API_KEY")
    
    job_data = {
        "file_id": str(file_id),
        "filename": pdf.filename,
        "apiKey": api_key
    }
    
    task_queue.enqueue(process_pdf, json.dumps(job_data))
    
    return {"message": "uploaded", "file_id": str(file_id)}

@app.get("/documents")
async def get_documents():
    # Fetch all documents, returning stringified ObjectIds
    docs = []
    for doc in db.documents.find().sort("_id", -1):
        doc["_id"] = str(doc["_id"])
        doc["file_id"] = str(doc["file_id"])
        docs.append(doc)
    return {"documents": docs}

@app.post("/chat")
async def chat_endpoint(request: Request):
    body = await request.json()
    user_query = body.get("message")
    api_key = request.headers.get('x-gemini-api-key') or os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key is required")
        
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=api_key
    )
    
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    qdrant_api_key = os.getenv("QDRANT_API_KEY")
    
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
    vector_store = QdrantVectorStore(
        client=client,
        collection_name="langchainjs-testing",
        embedding=embeddings,
    )
    
    retriever = vector_store.as_retriever(search_kwargs={"k": 2})
    result = retriever.invoke(user_query)
    
    # Format docs for frontend citations
    formatted_docs = []
    for doc in result:
        formatted_docs.append({
            "pageContent": doc.page_content,
            "metadata": {
                "loc": {
                    "pageNumber": doc.metadata.get("page", 0) + 1 if "page" in doc.metadata else "Unknown"
                },
                "source": doc.metadata.get("source", "Unknown")
            }
        })
    
    system_prompt = f"""You are a helpful AI Assistant who answers the user query based on the available context from a PDF file.
    Context:
    {json.dumps([doc.page_content for doc in result])}
    """
    
    chat_model = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=api_key
    )
    
    async def event_generator():
        yield {
            "data": json.dumps({"type": "docs", "data": formatted_docs})
        }
        
        try:
            async for chunk in chat_model.astream([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_query)
            ]):
                if chunk.content:
                    yield {
                        "data": json.dumps({"type": "chunk", "data": chunk.content})
                    }
            yield {
                "data": json.dumps({"type": "done"})
            }
        except Exception as e:
            print(f"Chat error: {e}")
            yield {
                "data": json.dumps({"type": "error", "data": str(e)})
            }
            
    return EventSourceResponse(event_generator())
