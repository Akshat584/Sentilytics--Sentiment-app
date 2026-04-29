import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sentiment from 'sentiment';

// Mock the modules that the worker would use
vi.mock('./services/sentimentService', () => ({
  analyzeSentiment: vi.fn().mockResolvedValue({
    overallSentiment: 'positive',
    score: 0.8,
    categorySentiments: { price: 'positive', quality: 'positive', delivery: 'neutral', customerService: 'neutral', packaging: 'neutral', usability: 'positive', refund: 'neutral' },
    confidenceScores: { overall: 0.9, price: 0.8, quality: 0.9, delivery: 0.5, customerService: 0.5, packaging: 0.5, usability: 0.8, refund: 0.5 },
    emotion: 'Joy',
    actionableInsight: 'Keep up the good work.'
  })
}));

const mockAdd = vi.fn().mockResolvedValue({ id: 'mock-doc-id' });
vi.mock('firebase-admin', () => ({
  default: {
    firestore: Object.assign(vi.fn().mockReturnValue({
      collection: vi.fn().mockReturnValue({
        add: mockAdd,
        onSnapshot: vi.fn(),
        get: vi.fn().mockResolvedValue({ docs: [] }),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      }),
    }), {
      FieldValue: {
        serverTimestamp: vi.fn().mockReturnValue('mock-timestamp')
      }
    }),
    apps: ['mock-app'],
    credential: { cert: vi.fn() },
    initializeApp: vi.fn(),
  }
}));

describe('AnalyzeQueue Worker Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes text, scores sentiment, and adds to firestore', async () => {
    // Instead of instantiating the actual BullMQ worker (which requires Redis),
    // we simulate the exact worker processor logic mapped to our mocked services.
    const { analyzeSentiment } = await import('./services/sentimentService');
    const admin = (await import('firebase-admin')).default;
    const db = admin.firestore();
    
    const triageNLP = new Sentiment();
    
    const jobData = {
      texts: ['This is an amazing product, I love it!'],
      productId: 'prod-123',
      companyId: 'comp-123',
      userId: 'user-1',
      source: 'csv'
    };
    
    const results = [];
    for (let i = 0; i < jobData.texts.length; i++) {
        const text = jobData.texts[i];
        try {
            // Phase 1: Triage
            const triageResult = triageNLP.analyze(text);
            const triageScore = triageResult.score;
            
            // Phase 2: Gemini Deep Reasoner
            const analysis = await analyzeSentiment(text);
            (analysis as any).isTriaged = true;
            
            // Write to Firestore directly via Admin SDK
            const reviewRef = await db.collection('reviews').add({
                userId: jobData.userId || 'anonymous',
                productId: jobData.productId || 'default-product',
                reviewText: text,
                source: jobData.source || 'api',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            await db.collection('sentiments').add({
                ...analysis,
                reviewId: reviewRef.id,
                productId: jobData.productId || 'default-product',
                companyId: jobData.companyId || 'default-company',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            if (analysis.overallSentiment === 'extremely_negative' || analysis.score <= -0.8) {
                await db.collection('alerts').add({
                  productId: jobData.productId || 'default-product',
                  companyId: jobData.companyId || 'default-company',
                  type: 'anomaly_spike',
                  severity: 'critical',
                  message: `Critical negative sentiment detected for ${jobData.productId || 'product'}. Score: ${analysis.score}`,
                  isRead: false,
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            results.push({ text, status: 'success', triageScore });
        } catch (err: any) {
            results.push({ text, status: 'failed', error: err.message });
        }
    }
    
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('success');
    expect(results[0].triageScore).toBeGreaterThan(0);
    
    expect(analyzeSentiment).toHaveBeenCalledWith('This is an amazing product, I love it!');
    expect(mockAdd).toHaveBeenCalledTimes(2); // One for review, one for sentiment (alert is not triggered)
  });
});