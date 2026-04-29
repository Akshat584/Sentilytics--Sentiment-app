import { GoogleGenAI, Type } from '@google/genai';
import { SentimentType, CategorySentiments, ConfidenceScores } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function analyzeSentiment(text: string) {
  const prompt = `You are an expert sentiment analyst specializing in consumer electronics and technology products. 
  Analyze the sentiment of the following product review using a 7-level spectrum for maximum granularity.
  
  SENTIMENT LEVELS (STRICT):
  - extremely_positive: (Score: 0.9 to 1.0) Overwhelmingly positive, "best ever", "flawless".
  - positive: (Score: 0.6 to 0.89) Very good, solid recommendation, minor or no complaints.
  - slightly_positive: (Score: 0.1 to 0.59) Generally good, but has noticeable minor issues.
  - neutral: (Score: -0.09 to 0.09) Factual, balanced, or indifferent.
  - slightly_negative: (Score: -0.1 to -0.49) Disappointing, annoying issues, but still usable.
  - negative: (Score: -0.5 to -0.89) Poor experience, would not recommend, significant flaws.
  - extremely_negative: (Score: -0.9 to -1.0) Total failure, broken, "waste of money", angry.

  CATEGORIES TO ANALYZE:
  1. price: Value for money, affordability.
  2. quality: Build quality, durability, materials.
  3. delivery: Shipping speed, tracking, arrival condition.
  4. customerService: Support quality, responsiveness, helpfulness.
  5. packaging: Unboxing experience, protection.
  6. usability: Ease of use, software UX, ergonomics.
  7. refund: Ease of return, warranty process.

  ADVANCED ENGINE TASKS:
  - emotion: Identify the primary human emotion felt by the user (e.g., Frustration, Joy, Anger, Surprise, Indifference).
  - actionableInsight: Provide a concise, business-focused recommendation or "so what" based on this review. If the review is neutral, suggest how to delight them next time.

  GUIDELINES:
  - If a category isn't mentioned, default to "neutral" with a confidence of 0.5.
  - Be critical. Don't default to "positive" unless the text clearly supports it.
  - The "score" field must be a float between -1.0 and 1.0.

  Review Text: "${text}"`;

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallSentiment: {
            type: Type.STRING,
            enum: [
              'extremely_positive',
              'positive',
              'slightly_positive',
              'neutral',
              'slightly_negative',
              'negative',
              'extremely_negative',
            ],
          },
          categorySentiments: {
            type: Type.OBJECT,
            properties: {
              price: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
              quality: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
              delivery: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
              customerService: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
              packaging: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
              usability: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
              refund: {
                type: Type.STRING,
                enum: [
                  'extremely_positive',
                  'positive',
                  'slightly_positive',
                  'neutral',
                  'slightly_negative',
                  'negative',
                  'extremely_negative',
                ],
              },
            },
            required: [
              'price',
              'quality',
              'delivery',
              'customerService',
              'packaging',
              'usability',
              'refund',
            ],
          },
          confidenceScores: {
            type: Type.OBJECT,
            properties: {
              price: { type: Type.NUMBER },
              quality: { type: Type.NUMBER },
              delivery: { type: Type.NUMBER },
              customerService: { type: Type.NUMBER },
              packaging: { type: Type.NUMBER },
              usability: { type: Type.NUMBER },
              refund: { type: Type.NUMBER },
              overall: { type: Type.NUMBER },
            },
            required: [
              'price',
              'quality',
              'delivery',
              'customerService',
              'packaging',
              'usability',
              'refund',
              'overall',
            ],
          },
          score: {
            type: Type.NUMBER,
            description: 'A normalized score from -1 (very negative) to 1 (very positive)',
          },
          emotion: { type: Type.STRING, description: 'The primary emotion detected in the text' },
          actionableInsight: {
            type: Type.STRING,
            description: 'A business-focused recommendation based on this review',
          },
        },
        required: [
          'overallSentiment',
          'categorySentiments',
          'confidenceScores',
          'score',
          'emotion',
          'actionableInsight',
        ],
      },
    },
  });

  return JSON.parse(response.text);
}
