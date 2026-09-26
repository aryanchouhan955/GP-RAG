import os
import json
import pymongo
import gridfs
import tempfile
from bson.objectid import ObjectId
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from rq import SimpleWorker as Worker, Queue
from redis import Redis
from langchain_community.document_loaders import PyPDFLoader
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_conn = Redis.from_url(redis_url)

mongo_client = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
db = mongo_client.get_database("gp_rag")
fs = gridfs.GridFS(db)

def process_pdf(job_data_str):
    data = json.loads(job_data_str)
    file_id_str = data.get("file_id")
    api_key = data.get("apiKey") or os.getenv("GEMINI_API_KEY")
    
    print(f"Processing Job: {data}")
    
    # Retrieve PDF from MongoDB GridFS
    try:
        grid_out = fs.get(ObjectId(file_id_str))
    except Exception as e:
        print(f"Error fetching from GridFS: {e}")
        db.documents.update_one({"file_id": ObjectId(file_id_str)}, {"$set": {"status": "failed"}})
        return

    # Write GridFS binary to a temporary file so PyPDFLoader can read it
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(grid_out.read())
        temp_path = tmp.name
        
    try:
        # Load the PDF
        loader = PyPDFLoader(temp_path)
        docs = loader.load()
        
        # Fix metadata: use original filename instead of temporary file path
        original_filename = data.get("filename", "Uploaded PDF")
        for doc in docs:
            doc.metadata["source"] = original_filename
            
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
        
        vector_store.add_documents(docs)
        print("All docs are added to vector store")
        
        # Update MongoDB status to ready
        db.documents.update_one({"file_id": ObjectId(file_id_str)}, {"$set": {"status": "ready"}})
    except Exception as e:
        print(f"Error during AI embedding process: {e}")
        db.documents.update_one({"file_id": ObjectId(file_id_str)}, {"$set": {"status": "failed", "error": str(e)}})
    finally:
        # Always clean up the temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == '__main__':
    worker = Worker(['file-upload-queue'], connection=redis_conn)
    print("Worker is listening for jobs on 'file-upload-queue'...")
    worker.work()
