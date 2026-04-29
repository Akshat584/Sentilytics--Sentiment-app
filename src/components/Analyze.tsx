import React, { useState, useRef, useEffect } from 'react';
import { analyzeSentiment } from '../services/sentimentService';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Zap,
  FileText,
  Info,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { Product, SentimentType, Company } from '../types';
import { motion } from 'motion/react';
import axios from 'axios';
import { dataService } from '../services/dataService';

const SENTIMENT_COLORS: Record<string, string> = {
  extremely_positive: 'bg-emerald-200 text-emerald-900',
  positive: 'bg-emerald-100 text-emerald-700',
  slightly_positive: 'bg-emerald-50 text-emerald-600',
  neutral: 'bg-slate-100 text-slate-700',
  slightly_negative: 'bg-rose-50 text-rose-600',
  negative: 'bg-rose-100 text-rose-700',
  extremely_negative: 'bg-rose-200 text-rose-900',
};

export const Analyze: React.FC = () => {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [newProductName, setNewProductName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const companiesES = new EventSource('/api/companies');
    companiesES.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setCompanies(data);
      if (data.length > 0 && !selectedCompanyId) setSelectedCompanyId(data[0].id);
    };

    const productsES = new EventSource('/api/products');
    productsES.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProducts(data);
      if (data.length > 0 && !selectedProductId) setSelectedProductId(data[0].id);
    };

    return () => {
      companiesES.close();
      productsES.close();
    };
  }, [selectedProductId, selectedCompanyId]);

  const createProduct = async () => {
    if (!newProductName.trim() || !selectedCompanyId) return;
    try {
      const docRef = await addDoc(collection(db, 'products'), {
        name: newProductName,
        companyId: selectedCompanyId,
        category: 'General',
        createdAt: serverTimestamp(),
      });
      setSelectedProductId(docRef.id);
      setNewProductName('');
      const res = await axios.get('/api/products');
      setProducts(res.data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'products');
    }
  };

  const saveToFirestore = async (analysis: any, reviewText: string, source: 'manual' | 'csv') => {
    try {
      const product = products.find((p) => p.id === selectedProductId);
      const companyId = product?.companyId || 'default-company';

      const reviewRef = await addDoc(collection(db, 'reviews'), {
        userId: auth.currentUser?.uid,
        productId: selectedProductId || 'default-product',
        reviewText,
        source,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'sentiments'), {
        ...analysis,
        reviewId: reviewRef.id,
        productId: selectedProductId || 'default-product',
        companyId,
        createdAt: serverTimestamp(),
      });

      if (analysis.overallSentiment === 'extremely_negative' || analysis.score <= -0.8) {
        await addDoc(collection(db, 'alerts'), {
          productId: selectedProductId || 'default-product',
          companyId,
          type: 'health_drop',
          severity: 'high',
          message: `Manual input flagged as high risk. Score: ${analysis.score.toFixed(2)}`,
          isRead: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sentiments/reviews');
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const analysis = await analyzeSentiment(text);
      await saveToFirestore(analysis, text, 'manual');
      setResult(analysis);
      setText('');
    } catch (err) {
      console.error(err);
      setError('Failed to analyze sentiment. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedProductId) {
      setError('Please select or create a product first.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    const companyId = product?.companyId || 'default-company';

    try {
      const { data, reviewColumn } = await dataService.parseAndValidateCSV(file);
      const texts = data
        .map((row) => row[reviewColumn]?.toString().trim())
        .filter((text) => text && text.length > 5);

      if (texts.length === 0) {
        setError('No valid review texts found in the CSV.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setAnalyzing(true);
      setError(null);
      setUploadProgress({ current: 0, total: texts.length });

      const response = await axios.post('/api/analyze/batch', {
        texts,
        productId: selectedProductId,
        companyId,
        userId: auth.currentUser?.uid,
        source: 'csv',
      });

      const { jobId } = response.data;

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await axios.get(`/api/analyze/status/${jobId}`);
          const { state, progress, failedReason } = statusRes.data;

          if (state === 'completed') {
            clearInterval(pollInterval);
            setAnalyzing(false);
            setUploadProgress(null);
            setResult({
              message: `Successfully processed ${texts.length} reviews via background queue.`,
            });
            if (fileInputRef.current) fileInputRef.current.value = '';
          } else if (state === 'failed') {
            clearInterval(pollInterval);
            setAnalyzing(false);
            setUploadProgress(null);
            setError(`Batch processing failed: ${failedReason}`);
            if (fileInputRef.current) fileInputRef.current.value = '';
          } else {
            const processedCount = Math.floor((progress / 100) * texts.length);
            setUploadProgress({ current: processedCount, total: texts.length });
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to process CSV');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-display font-bold text-slate-900 tracking-tighter">
            INTELLIGENCE <span className="text-brand font-light italic serif">Engine</span>
          </h2>
          <p className="text-slate-500 font-mono text-[10px] tracking-widest mt-1 uppercase">
            Neural sentiment processing unit v4.1
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand/10 group-focus-within:bg-brand transition-colors" />
            <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-400 mb-6 uppercase flex items-center gap-2">
              <MessageSquare className="w-3 h-3" />
              Input Stream
            </h3>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste customer feedback, reviews, or raw text here for instant neural analysis..."
              className="w-full h-64 p-0 bg-transparent border-none focus:ring-0 text-lg text-slate-700 placeholder:text-slate-300 resize-none font-medium leading-relaxed"
            />
            <div className="flex items-center justify-between mt-8 pt-8 border-t border-slate-50">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[11px] font-bold tracking-widest hover:bg-slate-200 transition-all uppercase"
                >
                  <FileText className="w-4 h-4" />
                  Batch Upload
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv"
                  className="hidden"
                />
              </div>
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !text.trim()}
                className="flex items-center gap-3 px-8 py-3.5 bg-brand text-white rounded-2xl font-bold text-sm tracking-tight hover:bg-brand-dark transition-all shadow-xl shadow-brand/20 disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
              >
                {analyzing && !uploadProgress ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    PROCESSING...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    RUN ANALYSIS
                  </>
                )}
              </button>
            </div>
          </div>

          {uploadProgress && (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  Batch Progress
                </span>
                <span className="text-xs font-mono font-bold text-brand">
                  {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <motion.div
                  className="bg-brand h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-3 font-mono">
                Processing record {uploadProgress.current} of {uploadProgress.total}...
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 p-6 rounded-3xl flex items-center gap-4 text-red-700 animate-in shake-1 duration-300">
              <AlertCircle className="w-6 h-6" />
              <span className="text-sm font-bold tracking-tight">{error}</span>
            </div>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl"
            >
              {result.message ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="p-4 bg-emerald-50 rounded-full mb-4">
                    <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Bulk Processing Complete</h3>
                  <p className="text-slate-500 mt-2">{result.message}</p>
                  <button
                    onClick={() => setResult(null)}
                    className="mt-6 px-8 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs tracking-widest hover:bg-slate-200 transition-all uppercase"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-10">
                    <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase flex items-center gap-2">
                      <TrendingUp className="w-3 h-3" />
                      Neural Output
                    </h3>
                    <div
                      className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase ${SENTIMENT_COLORS[result.overallSentiment as SentimentType] || 'bg-slate-100 text-slate-700'}`}
                    >
                      {(result.overallSentiment || 'neutral').replace('_', ' ')}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">
                        Sentiment Score
                      </p>
                      <p className="text-4xl font-mono font-bold text-slate-900 tracking-tighter">
                        {(result.score * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">
                        Confidence
                      </p>
                      <p className="text-4xl font-mono font-bold text-slate-900 tracking-tighter">
                        {(result.confidenceScores.overall * 100).toFixed(0)}%
                      </p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">
                        Latency
                      </p>
                      <p className="text-4xl font-mono font-bold text-slate-900 tracking-tighter">
                        1.2s
                      </p>
                    </div>
                  </div>

                  {result.categorySentiments && (
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
                        Category Breakdown
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(result.categorySentiments).map(([cat, sent]: any) => (
                          <div
                            key={cat}
                            className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100"
                          >
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">
                              {cat.replace(/([A-Z])/g, ' $1')}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-3 py-1 rounded-lg uppercase tracking-widest ${SENTIMENT_COLORS[sent as SentimentType] || 'bg-slate-100 text-slate-700'}`}
                            >
                              {sent.replace('_', ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(result.emotion || result.actionableInsight) && (
                    <div className="mt-8 space-y-6 border-t border-slate-100 pt-8">
                      <h4 className="text-[10px] font-bold tracking-[0.2em] text-brand uppercase">
                        Deep Reasoner Insights
                      </h4>
                      <div className="grid grid-cols-1 gap-4">
                        {result.emotion && (
                          <div className="p-5 bg-brand/5 rounded-2xl border border-brand/10">
                            <span className="text-[10px] font-bold text-brand uppercase tracking-widest mb-1 block">
                              Primary Emotion Detected
                            </span>
                            <span className="text-lg font-bold text-slate-900 tracking-tight">
                              {result.emotion}
                            </span>
                          </div>
                        )}
                        {result.actionableInsight && (
                          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                              Actionable Recommendation
                            </span>
                            <p className="text-sm font-medium text-slate-700 leading-relaxed">
                              {result.actionableInsight}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-slate-950 p-8 rounded-[40px] text-white shadow-2xl shadow-slate-950/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand/20 blur-[60px] -mr-16 -mt-16" />
            <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-500 mb-8 uppercase">
              Entity Context
            </h3>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                  Target Product
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3.5 text-sm font-bold text-white focus:ring-2 focus:ring-brand/50 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">SELECT PRODUCT...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name.toUpperCase()} (
                      {companies.find((c) => c.id === p.companyId)?.name || 'UNKNOWN'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800"></div>
                </div>
                <div className="relative flex justify-center text-[9px] font-bold tracking-[0.3em] uppercase">
                  <span className="bg-slate-950 px-4 text-slate-600">OR CREATE NEW</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                  Select Company
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3.5 text-sm font-bold text-white focus:ring-2 focus:ring-brand/50 outline-none transition-all appearance-none cursor-pointer mb-4"
                >
                  <option value="">SELECT COMPANY...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.toUpperCase()}
                    </option>
                  ))}
                </select>

                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                  New Entity Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="E.G. PIXEL 9 PRO"
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3.5 text-sm font-bold text-white focus:ring-2 focus:ring-brand/50 outline-none transition-all placeholder:text-slate-700"
                  />
                  <button
                    onClick={createProduct}
                    disabled={!newProductName.trim() || !selectedCompanyId}
                    className="p-3.5 bg-brand text-white rounded-2xl hover:bg-brand-dark transition-all disabled:opacity-30 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-400 mb-6 uppercase flex items-center gap-2">
              <Info className="w-3 h-3" />
              Processing Specs
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400 uppercase">Model</span>
                <span className="text-slate-900 font-bold">GEMINI-1.5-FLASH</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400 uppercase">Categories</span>
                <span className="text-slate-900 font-bold">7-SPECTRUM</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400 uppercase">Dimensions</span>
                <span className="text-slate-900 font-bold">8-AXIS</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
