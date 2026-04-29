# SENTILYTICS Technical Overview

This document describes the architecture, engineering standards, and features of the SENTILYTICS Sentiment Analysis Platform.

## 🏗️ Architecture

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, , Recharts.
- **Backend:** Express.js (serving as a BFF and API Gateway), Node.js.
- **Database:** Firebase Firestore (Real-time data sync).
- **Messaging/Queue:** Redis + BullMQ (Background batch processing).
- **AI/NLP:** Google Gemini (Generative AI) + `sentiment` (VADER-based triage).

## 🛠️ Engineering Standards

- **Linting:** ESLint (TS recommended) + Prettier for code consistency.
- **Testing:** Vitest + React Testing Library (Unit & Integration tests).
- **Observability:** Winston structured logging (JSON format) with console and file transports.
- **Security:**
  - `helmet` for security headers.
  - `express-rate-limit` for API protection.
  - Rate limiting on Gemini AI inference to prevent cost spikes.

## 🚀 Key Features

- **Intelligence Engine:** 7-spectrum sentiment analysis across 8 dimensions (Price, Qua      lity, etc.).
- **Predictive Analytics:** AI-powered "Product Health Score" and "Profit/Loss Forecast" based on sentiment trends.
- **Smart Data Ingestion:** CSV upload with automatic column mapping (detects `review`, `text`, `comment`, etc.).
- **Real-time Dashboard:** Live sentiment feeds and temporal flow analysis.

## 📦 Getting Started

1.  **Install:** `npm install`
2.  **Environment:** Set `GEMINI_API_KEY` in `.env.local`.
3.  **Infrastructure:** Run `docker-compose up -d` to start the Redis instance required for background batch processing.
4.  **Run:** `npm run dev`
5.  **Test:** `npm test`
6.  **Lint:** `npm run lint`
7.  **Format:** `npm run format`
