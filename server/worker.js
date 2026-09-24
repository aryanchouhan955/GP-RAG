import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

// Single shared Redis connection — works with rediss:// (TLS) or redis:// (plain)
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'file-upload-queue',
  async (job) => {
    console.log(`Job:`, job.data);
    const data = JSON.parse(job.data);
    /*
    Path: data.path
    read the pdf from path,
    chunk the pdf,
    call the openai embedding model for every chunk,
    store the chunk in qdrant db
    */

    // Load the PDF
    const loader = new PDFLoader(data.path);
    const docs = await loader.load();

    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: 'text-embedding-004',
      apiKey: process.env.GEMINI_API_KEY,
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY || undefined,
        collectionName: 'langchainjs-testing',
      }
    );
    await vectorStore.addDocuments(docs);
    console.log(`All docs are added to vector store`);
  },
  {
    concurrency: 100,
    connection,
  }
);
