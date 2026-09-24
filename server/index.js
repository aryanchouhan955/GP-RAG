import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const chatModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.0-flash',
  apiKey: process.env.GEMINI_API_KEY,
});

// Single shared Redis connection — works with rediss:// (TLS) or redis:// (plain)
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const queue = new Queue('file-upload-queue', { connection });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  return res.json({ status: 'All Good!' });
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  await queue.add(
    'file-ready',
    JSON.stringify({
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    })
  );
  return res.json({ message: 'uploaded' });
});

app.get('/chat', async (req, res) => {
  const userQuery = req.query.message;

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
  const ret = vectorStore.asRetriever({
    k: 2,
  });
  const result = await ret.invoke(userQuery);

  const SYSTEM_PROMPT = `You are a helpful AI Assistant who answers the user query based on the available context from a PDF file.
  Context:
  ${JSON.stringify(result)}
  `;

  const chatResult = await chatModel.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userQuery),
  ]);

  return res.json({
    message: chatResult.content,
    docs: result,
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server started on PORT:${PORT}`));
