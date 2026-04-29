# SENTILYTICS | AI Sentiment Platform

<div align="center">
<img width="1200" height="475" alt="SENTILYTICS Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

SENTILYTICS is a high-performance sentiment analysis platform designed for consumer electronics and technology products. It leverages a multi-stage analysis pipeline, combining fast triage with deep generative AI reasoning (Google Gemini) to provide granular insights into customer feedback.

## 🚀 Key Features

- **Intelligence Engine:** 7-spectrum sentiment analysis (Extremely Positive to Extremely Negative) across 8 business dimensions.
- **Deep Reasoner (Gemini AI):** Advanced NLP that identifies emotions and provides actionable business insights.
- **Predictive Analytics:** AI-powered "Product Health Score" and "Profit/Loss Forecast" based on temporal sentiment trends.
- **Smart Data Ingestion:** CSV upload with automatic column mapping (detects `review`, `text`, `comment`, etc.).
- **Real-time Dashboard:** Live feeds using Server-Sent Events (SSE) and temporal flow analysis via Recharts.
- **Batch Processing:** Scalable background processing using Redis and BullMQ for high-volume data analysis.
- **Anomaly Detection:** Automatic alert generation for critical negative sentiment spikes.

## 🏗️ Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts, Framer Motion.
- **Backend:** Express.js (BFF / API Gateway), Node.js.
- **Database:** Firebase Firestore (Real-time synchronization).
- **Messaging/Queue:** Redis + BullMQ (Asynchronous batch processing).
- **AI Engine:** Google Gemini 1.5 Flash (Generative AI) + `sentiment` (VADER-based triage).

## 📦 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Docker** (for Redis)
- **Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))
- **Firebase Project** (Firestore enabled)

### Setup Instructions

1.  **Clone the repository and install dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment Variables:**
    Create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    REDIS_URL=redis://localhost:6379
    APP_URL=http://localhost:3000
    ```

3.  **Start Infrastructure:**
    Launch the Redis instance required for background processing:
    ```bash
    docker-compose up -d
    ```

4.  **Run the Application:**
    ```bash
    npm run dev
    ```

5.  **Access the Dashboard:**
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠️ Implementation Highlights

### 1. Deep Sentiment Reasoning (Gemini AI Integration)
Located in `src/services/sentimentService.ts`, this function uses the Gemini 1.5 Flash model with a strict JSON schema to ensure structured, granular analysis.

```typescript
export async function analyzeSentiment(text: string) {
  const prompt = `Analyze the sentiment of the following product review using a 7-level spectrum.
  CATEGORIES: price, quality, delivery, customerService, packaging, usability, refund.
  Review Text: "${text}"`;

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallSentiment: { type: Type.STRING },
          score: { type: Type.NUMBER }, // -1.0 to 1.0
          emotion: { type: Type.STRING },
          actionableInsight: { type: Type.STRING },
          // ... category-specific fields
        },
        required: ['overallSentiment', 'score', 'emotion', 'actionableInsight']
      }
    }
  });

  return JSON.parse(response.text);
}
```

### 2. Multi-Stage Triage Pipeline
In `server.ts`, we implement a two-phase analysis pipeline within a BullMQ worker to balance speed and depth.

```typescript
const analyzeWorker = new Worker('AnalyzeQueue', async (job) => {
  const { texts } = job.data;
  
  for (const text of texts) {
    // Phase 1: Fast Triage (VADER-based)
    const triageResult = triageNLP.analyze(text);
    
    // Phase 2: Deep Reasoner (Gemini AI)
    const analysis = await analyzeSentiment(text);
    
    // Write to Firestore and trigger alerts if critical
    if (analysis.score <= -0.8) {
      await db.collection('alerts').add({ /* ... */ });
    }
  }
});
```

### 3. Predictive Product Health
Located in `src/services/predictionService.ts`, this logic forecasts product performance based on sentiment velocity.

```typescript
export const predictProductHealth = (sentiments: SentimentData[]): PredictionResult => {
  const recent = sentiments.slice(-10);
  const avgScore = recent.reduce((sum, s) => sum + s.score, 0) / recent.length;
  
  // Calculate trend (velocity of sentiment change)
  const healthScore = Math.max(0, Math.min(100, (avgScore + 1) * 50));
  
  return {
    healthScore: Math.round(healthScore),
    trend: trendScore > 0.1 ? 'improving' : 'declining',
    forecast: healthScore > 75 ? 'profit_growth' : 'loss_risk',
    summary: '...'
  };
};
```

## 🧪 Testing & Standards

- **Unit Tests:** `npm test` (Powered by Vitest)
- **Linting:** `npm run lint` (ESLint + Prettier)
- **Type Safety:** `npm run typecheck` (TypeScript)
- **Logging:** Structured JSON logging via Winston.

---

View your app in AI Studio: [https://ai.studio/apps/d5044590-dc90-4d9d-8398-cd64b4f4a3f6](https://ai.studio/apps/d5044590-dc90-4d9d-8398-cd64b4f4a3f6)
# Sentilytics--Sentiment-app
