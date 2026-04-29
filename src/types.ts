export type SentimentType =
  | 'extremely_positive'
  | 'positive'
  | 'slightly_positive'
  | 'neutral'
  | 'slightly_negative'
  | 'negative'
  | 'extremely_negative';

export interface CategorySentiments {
  price: SentimentType;
  quality: SentimentType;
  delivery: SentimentType;
  customerService: SentimentType;
  packaging: SentimentType;
  usability: SentimentType;
  refund: SentimentType;
}

export interface ConfidenceScores {
  price: number;
  quality: number;
  delivery: number;
  customerService: number;
  packaging: number;
  usability: number;
  refund: number;
  overall: number;
}

export interface SentimentData {
  id: string;
  reviewId: string;
  productId: string;
  companyId: string;
  overallSentiment: SentimentType;
  categorySentiments: CategorySentiments;
  confidenceScores: ConfidenceScores;
  score: number; // -1 to 1
  emotion?: string;
  actionableInsight?: string;
  isTriaged?: boolean;
  createdAt: any; // Firestore Timestamp
}

export interface Review {
  id?: string;
  userId: string;
  productId: string;
  reviewText: string;
  source: 'manual' | 'csv' | 'api' | 'amazon' | 'playstore' | 'appstore';
  createdAt: any;
}

export interface Alert {
  id?: string;
  productId: string;
  companyId: string;
  type: 'health_drop' | 'anomaly_spike' | 'competitor_gain';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  isRead: boolean;
  createdAt: any;
}

export interface Product {
  id: string;
  companyId: string;
  name: string;
  category: string;
}

export interface Company {
  id: string;
  name: string;
  industry?: string;
  logoUrl?: string;
}

export interface Profile {
  uid: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
}
