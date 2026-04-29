import { z } from 'zod';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import Papa from 'papaparse';

const COMPANIES = [
  { name: 'Apple', industry: 'Technology', logoUrl: 'https://logo.clearbit.com/apple.com' },
  { name: 'Samsung', industry: 'Electronics', logoUrl: 'https://logo.clearbit.com/samsung.com' },
  { name: 'Google', industry: 'Technology', logoUrl: 'https://logo.clearbit.com/google.com' },
  { name: 'Sony', industry: 'Electronics', logoUrl: 'https://logo.clearbit.com/sony.com' },
  { name: 'Tesla', industry: 'Automotive', logoUrl: 'https://logo.clearbit.com/tesla.com' },
];

const PRODUCTS = [
  { name: 'iPhone 15 Pro', category: 'Smartphones', company: 'Apple' },
  { name: 'MacBook Pro M3', category: 'Laptops', company: 'Apple' },
  { name: 'Galaxy S24 Ultra', category: 'Smartphones', company: 'Samsung' },
  { name: 'Galaxy Watch 6', category: 'Wearables', company: 'Samsung' },
  { name: 'Pixel 8 Pro', category: 'Smartphones', company: 'Google' },
  { name: 'Pixel Buds Pro', category: 'Audio', company: 'Google' },
  { name: 'Sony WH-1000XM5', category: 'Audio', company: 'Sony' },
  { name: 'PlayStation 5', category: 'Gaming', company: 'Sony' },
  { name: 'Model 3', category: 'Automotive', company: 'Tesla' },
  { name: 'Model Y', category: 'Automotive', company: 'Tesla' },
];

const SENTIMENT_TEMPLATES = [
  {
    overallSentiment: 'extremely_positive',
    score: 0.9,
    categorySentiments: {
      price: 'positive',
      quality: 'extremely_positive',
      delivery: 'positive',
      customerService: 'extremely_positive',
      packaging: 'positive',
      usability: 'extremely_positive',
      refund: 'neutral',
    },
  },
  {
    overallSentiment: 'positive',
    score: 0.7,
    categorySentiments: {
      price: 'neutral',
      quality: 'positive',
      delivery: 'positive',
      customerService: 'positive',
      packaging: 'positive',
      usability: 'positive',
      refund: 'neutral',
    },
  },
  {
    overallSentiment: 'neutral',
    score: 0.0,
    categorySentiments: {
      price: 'neutral',
      quality: 'neutral',
      delivery: 'neutral',
      customerService: 'neutral',
      packaging: 'neutral',
      usability: 'neutral',
      refund: 'neutral',
    },
  },
  {
    overallSentiment: 'negative',
    score: -0.6,
    categorySentiments: {
      price: 'negative',
      quality: 'negative',
      delivery: 'neutral',
      customerService: 'negative',
      packaging: 'neutral',
      usability: 'negative',
      refund: 'negative',
    },
  },
  {
    overallSentiment: 'extremely_negative',
    score: -0.9,
    categorySentiments: {
      price: 'extremely_negative',
      quality: 'negative',
      delivery: 'negative',
      customerService: 'extremely_negative',
      packaging: 'negative',
      usability: 'negative',
      refund: 'extremely_negative',
    },
  },
];

export const dataService = {
  async seedRealWorldData() {
    try {
      const batch = writeBatch(db);

      // 1. Seed Companies
      const companyMap: Record<string, string> = {};
      for (const c of COMPANIES) {
        const companyRef = doc(collection(db, 'companies'));
        batch.set(companyRef, {
          ...c,
          createdAt: serverTimestamp(),
        });
        companyMap[c.name] = companyRef.id;
      }

      // 2. Seed Products
      const productMap: Record<string, { id: string; companyId: string }> = {};
      for (const p of PRODUCTS) {
        const productRef = doc(collection(db, 'products'));
        const companyId = companyMap[p.company];
        batch.set(productRef, {
          name: p.name,
          category: p.category,
          companyId,
          createdAt: serverTimestamp(),
        });
        productMap[p.name] = { id: productRef.id, companyId };
      }

      // 3. Seed Sentiments (more volume for realism)
      for (let i = 0; i < 100; i++) {
        const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
        const { id: productId, companyId } = productMap[product.name];
        const template =
          SENTIMENT_TEMPLATES[Math.floor(Math.random() * SENTIMENT_TEMPLATES.length)];

        // Add some noise to scores
        const score = Math.max(-1, Math.min(1, template.score + (Math.random() * 0.2 - 0.1)));

        const sentimentRef = doc(collection(db, 'sentiments'));
        batch.set(sentimentRef, {
          ...template,
          score,
          productId,
          companyId,
          reviewId: `demo-${i}`,
          confidenceScores: {
            overall: 0.85 + Math.random() * 0.1,
            price: 0.7 + Math.random() * 0.2,
            quality: 0.8 + Math.random() * 0.15,
            delivery: 0.6 + Math.random() * 0.3,
            customerService: 0.75 + Math.random() * 0.2,
            packaging: 0.65 + Math.random() * 0.25,
            usability: 0.8 + Math.random() * 0.15,
            refund: 0.5 + Math.random() * 0.4,
          },
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      console.log('Real-world data seeded successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'batch-seed');
    }
  },

  async clearAllData() {
    try {
      const collections = ['companies', 'products', 'sentiments', 'reviews'];
      for (const coll of collections) {
        const snapshot = await getDocs(collection(db, coll));
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'clear-all');
    }
  },

  async parseAndValidateCSV(file: File): Promise<{
    data: any[];
    reviewColumn: string;
    preview: any[];
    totalRows: number;
  }> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[];
          if (rows.length === 0) {
            reject(new Error('The CSV file is empty.'));
            return;
          }

          const columns = Object.keys(rows[0]);
          const reviewCol = columns.find((col) => {
            const c = col.toLowerCase().trim();
            return [
              'review',
              'text',
              'content',
              'feedback',
              'comment',
              'body',
              'review_text',
              'message',
            ].includes(c);
          });

          if (!reviewCol) {
            reject(
              new Error(
                'Could not find a review column. Please ensure your CSV has a column named "review" or "text".'
              )
            );
            return;
          }

          // Strict Zod Validation
          const RowSchema = z.object({
            [reviewCol]: z.string().min(1, 'Review text cannot be empty'),
          }).passthrough(); // Allow other columns but require review text

          const validRows = [];
          for (const row of rows) {
            const result = RowSchema.safeParse(row);
            if (result.success) {
              validRows.push(row);
            }
          }

          if (validRows.length === 0) {
            reject(new Error('No valid rows found. Ensure the review column contains text.'));
            return;
          }

          resolve({
            data: validRows,
            reviewColumn: reviewCol,
            preview: validRows.slice(0, 5),
            totalRows: validRows.length,
          });
        },
        error: (err) => {
          reject(err);
        },
      });
    });
  },
};
