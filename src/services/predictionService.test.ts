import { describe, it, expect } from 'vitest';
import { predictProductHealth } from './predictionService';
import { SentimentData } from '../types';

describe('predictProductHealth', () => {
  it('returns default stable result for empty sentiments', () => {
    const result = predictProductHealth([]);
    expect(result.healthScore).toBe(50);
    expect(result.trend).toBe('stable');
    expect(result.forecast).toBe('stable_revenue');
    expect(result.confidence).toBe(0);
  });

  it('predicts profit_growth for improving strong sentiments', () => {
    const sentiments = [
      { score: 0.5, createdAt: { seconds: 1000 } },
      { score: 0.6, createdAt: { seconds: 2000 } },
      { score: 0.8, createdAt: { seconds: 3000 } },
      { score: 0.9, createdAt: { seconds: 4000 } },
    ] as any as SentimentData[];

    const result = predictProductHealth(sentiments);
    expect(result.trend).toBe('improving');
    expect(result.healthScore).toBeGreaterThan(75);
    expect(result.forecast).toBe('profit_growth');
  });

  it('predicts loss_risk for declining weak sentiments', () => {
    const sentiments = [
      { score: 0.5, createdAt: { seconds: 1000 } },
      { score: 0.2, createdAt: { seconds: 2000 } },
      { score: -0.5, createdAt: { seconds: 3000 } },
      { score: -0.8, createdAt: { seconds: 4000 } },
    ] as any as SentimentData[];

    const result = predictProductHealth(sentiments);
    expect(result.trend).toBe('declining');
    expect(result.healthScore).toBeLessThan(60);
    expect(result.forecast).toBe('loss_risk');
  });

  it('calculates health score correctly based on recent sentiments', () => {
    const sentiments = Array.from({ length: 10 }).map((_, i) => ({
      score: 0.5,
      createdAt: { seconds: i * 1000 },
    })) as any as SentimentData[];

    const result = predictProductHealth(sentiments);
    // avgScore = 0.5. healthScore = (0.5 + 1) * 50 = 75
    expect(result.healthScore).toBe(75);
    expect(result.trend).toBe('stable');
    expect(result.forecast).toBe('stable_revenue');
  });
});
