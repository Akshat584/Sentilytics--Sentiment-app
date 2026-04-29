import { SentimentData } from '../types';

export interface PredictionResult {
  healthScore: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  forecast: 'profit_growth' | 'stable_revenue' | 'loss_risk';
  confidence: number; // 0-1
  summary: string;
}

export const predictProductHealth = (sentiments: SentimentData[]): PredictionResult => {
  if (sentiments.length === 0) {
    return {
      healthScore: 50,
      trend: 'stable',
      forecast: 'stable_revenue',
      confidence: 0,
      summary: 'No data available for prediction.',
    };
  }

  // Sort by date ascending
  const sorted = [...sentiments].sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeA - timeB;
  });

  const recent = sorted.slice(-10); // Look at last 10 sentiments
  const avgScore = recent.reduce((sum, s) => sum + s.score, 0) / (recent.length || 1);
  
  // Calculate trend (simplified)
  let trendScore = 0;
  if (recent.length >= 2) {
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;
    trendScore = secondAvg - firstAvg;
  }

  const healthScore = Math.max(0, Math.min(100, (avgScore + 1) * 50));
  
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (trendScore > 0.1) trend = 'improving';
  else if (trendScore < -0.1) trend = 'declining';

  let forecast: 'profit_growth' | 'stable_revenue' | 'loss_risk' = 'stable_revenue';
  if (healthScore > 75 && trend === 'improving') forecast = 'profit_growth';
  else if (healthScore < 40 || (healthScore < 60 && trend === 'declining')) forecast = 'loss_risk';

  const summaries = {
    profit_growth: 'Strong positive sentiment and improving trends suggest upcoming market share gains.',
    stable_revenue: 'Consistent sentiment levels indicate steady performance and customer retention.',
    loss_risk: 'Declining sentiment or low scores point to potential customer churn and revenue risks.',
  };

  return {
    healthScore: Math.round(healthScore),
    trend,
    forecast,
    confidence: Math.min(0.95, 0.3 + (sentiments.length / 50)), // More data = more confidence
    summary: summaries[forecast],
  };
};
