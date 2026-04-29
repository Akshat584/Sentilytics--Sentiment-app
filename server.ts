import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';
import fs from 'fs';
import { Queue, Worker } from 'bullmq';
import Sentiment from 'sentiment';
import { analyzeSentiment } from './src/services/sentimentService';
import logger from './src/lib/logger';

// Use Client SDK as a workaround for Admin SDK permission issues
import * as admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(__filename); // rename to _dirname if not used, or just remove

// Initialize Firebase Client SDK
let db: admin.firestore.Firestore;
let isAuthReady = true;
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');

// Global state for real-time companies (SSE)
let companySseClients: { id: number; res: express.Response }[] = [];
let currentCompanies: any[] = [];

// Global state for real-time products (SSE)
let productSseClients: { id: number; res: express.Response }[] = [];
let currentProducts: any[] = [];

const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');

async function initFirebase() {
  if (admin.apps.length === 0) {
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      logger.info('Firebase Admin SDK initialized with service account.');
    } else if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
      logger.info('Firebase Admin SDK initialized with project ID.');
    } else {
      logger.warn('No firebase config found.');
      return;
    }
  }

  db = admin.firestore();

  try {
    db.collection('companies').onSnapshot(
      (snapshot) => {
        currentCompanies = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const data = JSON.stringify(currentCompanies);

        companySseClients.forEach((client) => {
          client.res.write(`data: ${data}\n\n`);
        });
      },
      (error) => {
        console.error('Firestore Companies Listener Error:', error);
      }
    );

    db.collection('products').onSnapshot(
      (snapshot) => {
        currentProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const data = JSON.stringify(currentProducts);

        productSseClients.forEach((client) => {
          client.res.write(`data: ${data}\n\n`);
        });
      },
      (error) => {
        console.error('Firestore Products Listener Error:', error);
      }
    );
  } catch (initError) {
    console.error('Firebase Admin SDK Initialization Error:', initError);
  }
}

// Initialize Redis with resilience
let redis: Redis | null = null;
if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        if (times > 10) {
          // If it fails too many times, back off significantly
          return 30000;
        }
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redis.on('error', (err: any) => {
      if (err.code === 'EAI_AGAIN' || err.code === 'ENOTFOUND') {
        logger.warn(`Redis Connection Warning: Host unreachable (${err.code}). Caching disabled.`);
      } else {
        console.error('Redis Error:', err);
      }
    });

    redis.on('connect', () => {
      logger.info('Successfully connected to Redis');
    });
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    redis = null;
  }
}

// Initialize NLP Triage
const triageNLP = new Sentiment();

// Initialize BullMQ Queue
let analyzeQueue: Queue | null = null;

if (redis) {
  analyzeQueue = new Queue('AnalyzeQueue', { connection: redis });

  const analyzeWorker = new Worker(
    'AnalyzeQueue',
    async (job) => {
      const { texts, productId, companyId, userId, source } = job.data;
      const results = [];

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        try {
          // Phase 1: Triage
          const triageResult = triageNLP.analyze(text);
          const triageScore = triageResult.score; // Simple integer score

          // Phase 2: Deep Reasoner (Gemini)
          const analysis = await analyzeSentiment(text);

          // Enhance with Triage Metadata
          analysis.isTriaged = true;

          // Write to Firestore directly
          const reviewRef = await db.collection('reviews').add({
            userId: userId || 'anonymous',
            productId: productId || 'default-product',
            reviewText: text,
            source: source || 'api',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await db.collection('sentiments').add({
            ...analysis,
            reviewId: reviewRef.id,
            productId: productId || 'default-product',
            companyId: companyId || 'default-company',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Mock Alerting System: Generate an alert if sentiment is extremely negative
          if (analysis.overallSentiment === 'extremely_negative' || analysis.score <= -0.8) {
            await db.collection('alerts').add({
              productId: productId || 'default-product',
              companyId: companyId || 'default-company',
              type: 'anomaly_spike',
              severity: 'critical',
              message: `Critical negative sentiment detected for ${productId || 'product'}. Score: ${analysis.score}`,
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.warn(`Alert generated for ${productId}`);
          }

          results.push({ text, status: 'success', triageScore });

          // Update job progress
          await job.updateProgress(Math.floor(((i + 1) / texts.length) * 100));

          // Small delay to prevent rate limiting
          await new Promise((r) => setTimeout(r, 200));
        } catch (err: any) {
          console.error(`Job ${job.id} failed on item ${i}:`, err);
          results.push({ text, status: 'failed', error: err.message });
        }
      }

      return results;
    },
    { connection: redis }
  );

  analyzeWorker.on('completed', (job) => {
    logger.info(`Job ${job.id} has completed!`);
  });

  analyzeWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} has failed with ${err.message}`);
  });
}

async function startServer() {
  await initFirebase();

  const app = express();
  // Read port from APP_URL env var, fallback to 3000
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const PORT = parseInt(new URL(appUrl).port, 10) || 3000;

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable for Vite dev
    })
  );

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  });

  app.use('/api/', limiter);

  app.use(express.json({ limit: '50mb' }));

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      redis: !!redis,
      queue: !!analyzeQueue,
      firebaseAuth: isAuthReady,
      serverUid: 'admin-sdk',
    });
  });

  // Batch Analyze Endpoint (Job Submission)
  app.post('/api/analyze/batch', async (req, res) => {
    if (!analyzeQueue) {
      return res.status(503).json({ error: 'Background queue is not available (Redis disabled).' });
    }

    try {
      const { texts, productId, companyId, userId, source } = req.body;
      if (!Array.isArray(texts) || texts.length === 0) {
        return res
          .status(400)
          .json({ error: "Invalid payload: 'texts' must be a non-empty array." });
      }

      const job = await analyzeQueue.add('batchAnalyze', {
        texts,
        productId,
        companyId,
        userId,
        source,
      });

      res.json({ jobId: job.id, message: 'Batch processing started' });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to queue batch', details: error.message });
    }
  });

  // Job Status Endpoint
  app.get('/api/analyze/status/:jobId', async (req, res) => {
    if (!analyzeQueue) return res.status(503).json({ error: 'Queue not available' });

    try {
      const job = await analyzeQueue.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const state = await job.getState();
      const progress = job.progress;
      const result = job.returnvalue;
      const failedReason = job.failedReason;

      res.json({ id: job.id, state, progress, result, failedReason });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to check job status', details: error.message });
    }
  });

  // Cached Products Endpoint with SSE support
  app.get('/api/products', async (req, res) => {
    if (req.headers.accept === 'text/event-stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial data
      res.write(`data: ${JSON.stringify(currentProducts)}\n\n`);

      const clientId = Date.now();
      const newClient = { id: clientId, res };
      productSseClients.push(newClient);

      req.on('close', () => {
        productSseClients = productSseClients.filter((client) => client.id !== clientId);
      });
      return;
    }

    const cacheKey = 'products_list';

    try {
      if (redis && redis.status === 'ready') {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }

      const snapshot = await db.collection('products').get();
      const products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (redis && redis.status === 'ready') {
        await redis.set(cacheKey, JSON.stringify(products), 'EX', 300); // Cache for 5 mins
      }

      res.json(products);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      res.status(500).json({
        error: 'Failed to fetch products',
        details: error.message,
        code: error.code,
      });
    }
  });

  // Cached Companies Endpoint with SSE support
  app.get('/api/companies', async (req, res) => {
    if (req.headers.accept === 'text/event-stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial data
      res.write(`data: ${JSON.stringify(currentCompanies)}\n\n`);

      const clientId = Date.now();
      const newClient = { id: clientId, res };
      companySseClients.push(newClient);

      req.on('close', () => {
        companySseClients = companySseClients.filter((client) => client.id !== clientId);
      });
      return;
    }

    const cacheKey = 'companies_list';

    try {
      if (redis && redis.status === 'ready') {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }

      const snapshot = await db.collection('companies').get();
      const companies = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (redis && redis.status === 'ready') {
        await redis.set(cacheKey, JSON.stringify(companies), 'EX', 600); // Cache for 10 mins
      }

      res.json(companies);
    } catch (error: any) {
      console.error('Error fetching companies:', error);
      res.status(500).json({
        error: 'Failed to fetch companies',
        details: error.message,
        code: error.code,
      });
    }
  });

  // Clear Cache Endpoint (for seeding)
  app.post('/api/clear-cache', async (req, res) => {
    try {
      if (redis && redis.status === 'ready') {
        await redis.flushdb();
        return res.json({ status: 'cache cleared' });
      }
      res.json({ status: 'redis not available' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  // Cached Dashboard Stats Endpoint
  app.get('/api/dashboard-stats', async (req, res) => {
    const cacheKey = 'dashboard_stats';

    try {
      if (redis && redis.status === 'ready') {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }

      const snapshot = await db.collection('sentiments').orderBy('createdAt', 'desc').limit(100).get();
      const sentiments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (redis && redis.status === 'ready') {
        await redis.set(cacheKey, JSON.stringify(sentiments), 'EX', 60); // Cache for 1 min
      }

      res.json(sentiments);
    } catch (error: any) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        error: 'Failed to fetch stats',
        details: error.message,
        code: error.code,
      });
    }
  });

  // Cached Full Sentiments Endpoint (for comparison)
  app.get('/api/sentiments', async (req, res) => {
    const cacheKey = 'all_sentiments';

    try {
      if (redis && redis.status === 'ready') {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      }

      const snapshot = await db.collection('sentiments').orderBy('createdAt', 'desc').get();
      const sentiments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (redis && redis.status === 'ready') {
        await redis.set(cacheKey, JSON.stringify(sentiments), 'EX', 300); // Cache for 5 mins
      }

      res.json(sentiments);
    } catch (error: any) {
      console.error('Error fetching all sentiments:', error);
      res.status(500).json({
        error: 'Failed to fetch sentiments',
        details: error.message,
        code: error.code,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
