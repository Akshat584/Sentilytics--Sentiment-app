import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SentimentData, SentimentType, Product } from '../types';
import {
  TrendingUp,
  Users,
  MessageSquare,
  Database,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingUp as TrendingUpIcon,
  Activity,
  Download,
} from 'lucide-react';
import { predictProductHealth, PredictionResult } from '../services/predictionService';

const COLORS: Record<SentimentType, string> = {
  extremely_positive: '#059669',
  positive: '#10b981',
  slightly_positive: '#6ee7b7',
  neutral: '#f59e0b',
  slightly_negative: '#fda4af',
  negative: '#f43f5e',
  extremely_negative: '#be123c',
};

const SENTIMENT_LABELS: Record<SentimentType, string> = {
  extremely_positive: 'Extremely Positive',
  positive: 'Positive',
  slightly_positive: 'Slightly Positive',
  neutral: 'Neutral',
  slightly_negative: 'Slightly Negative',
  negative: 'Negative',
  extremely_negative: 'Extremely Negative',
};

import axios from 'axios';

import Papa from 'papaparse';
import { dataService } from '../services/dataService';

import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export const Dashboard: React.FC = () => {
  const [sentiments, setSentiments] = useState<SentimentData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');

  const handleSeed = async () => {
    setLoading(true);
    await dataService.seedRealWorldData();
    await axios.post('/api/clear-cache');
    // No need to reload, onSnapshot will pick up the changes
    setLoading(false);
  };

  const handleExportCSV = () => {
    if (filteredSentiments.length === 0) return;
    
    // Flatten category sentiments and confidence scores for better CSV format
    const exportData = filteredSentiments.map(s => ({
      id: s.id,
      productId: s.productId,
      companyId: s.companyId,
      overallSentiment: s.overallSentiment,
      score: s.score,
      emotion: s.emotion || '',
      actionableInsight: s.actionableInsight || '',
      priceSentiment: s.categorySentiments?.price || '',
      qualitySentiment: s.categorySentiments?.quality || '',
      customerServiceSentiment: s.categorySentiments?.customerService || '',
      overallConfidence: s.confidenceScores?.overall || 0,
      createdAt: s.createdAt?.seconds ? new Date(s.createdAt.seconds * 1000).toISOString() : '',
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sentilytics-export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        const productsRes = await axios.get('/api/products');
        setProducts(productsRes.data);
      } catch (error) {
        console.error('Error fetching static dashboard data:', error);
      }
    };

    fetchStaticData();

    // Real-time companies listener (SSE)
    const companiesES = new EventSource('/api/companies');
    companiesES.onmessage = (event) => {
      setCompanies(JSON.parse(event.data));
    };

    // Real-time products listener (SSE)
    const productsES = new EventSource('/api/products');
    productsES.onmessage = (event) => {
      setProducts(JSON.parse(event.data));
    };

    // Real-time sentiments listener
    const sentimentsQuery = query(
      collection(db, 'sentiments'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      sentimentsQuery,
      (snapshot) => {
        const newSentiments = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SentimentData[];
        setSentiments(newSentiments);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sentiments');
      }
    );

    return () => {
      unsubscribe();
      companiesES.close();
      productsES.close();
    };
  }, []);

  const filteredSentiments = sentiments.filter((s) => {
    const productMatch = filterProduct === 'all' || s.productId === filterProduct;
    const companyMatch = filterCompany === 'all' || s.companyId === filterCompany;
    return productMatch && companyMatch;
  });

  const prediction: PredictionResult = predictProductHealth(filteredSentiments);

  const sentimentCounts = filteredSentiments.reduce(
    (acc, curr) => {
      acc[curr.overallSentiment] = (acc[curr.overallSentiment] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const pieData = Object.entries(SENTIMENT_LABELS)
    .map(([key, label]) => ({
      name: label,
      value: sentimentCounts[key as SentimentType] || 0,
      color: COLORS[key as SentimentType],
    }))
    .filter((d) => d.value > 0);

  const trendData = filteredSentiments
    .slice()
    .reverse()
    .map((s) => ({
      date: s.createdAt?.seconds
        ? new Date(s.createdAt.seconds * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
      score: s.score,
    }));

  const categoryAverages = filteredSentiments.reduce(
    (acc, curr) => {
      Object.entries(curr.categorySentiments).forEach(([cat, sent]) => {
        if (!acc[cat])
          acc[cat] = {
            extremely_positive: 0,
            positive: 0,
            slightly_positive: 0,
            neutral: 0,
            slightly_negative: 0,
            negative: 0,
            extremely_negative: 0,
          };
        acc[cat][sent as SentimentType]++;
      });
      return acc;
    },
    {} as Record<string, Record<SentimentType, number>>
  );

  const barData = (
    Object.entries(categoryAverages) as [string, Record<SentimentType, number>][]
  ).map(([name, counts]) => ({
    name: name.replace(/([A-Z])/g, ' $1').toUpperCase(),
    extremely_positive: counts.extremely_positive,
    positive: counts.positive,
    slightly_positive: counts.slightly_positive,
    neutral: counts.neutral,
    slightly_negative: counts.slightly_negative,
    negative: counts.negative,
    extremely_negative: counts.extremely_negative,
  }));

  if (loading)
    return <div className="flex items-center justify-center h-full">Loading analytics...</div>;

  if (sentiments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-in fade-in duration-700">
        <div className="p-8 bg-indigo-50 rounded-full shadow-inner">
          <Database className="w-16 h-16 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Intelligence Engine Ready</h2>
          <p className="text-slate-500 max-w-md mt-3 text-lg">
            Your sentiment analytics platform is initialized. Upload a CSV or analyze text to
            populate your live dashboard.
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleSeed}
            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
          >
            Seed Real-World Dataset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-display font-bold text-slate-900 tracking-tighter">
            ANALYTICS <span className="text-brand font-light italic serif">Overview</span>
          </h2>
          <p className="text-slate-500 font-mono text-[10px] tracking-widest mt-1 uppercase">
            Real-time sentiment processing engine v2.4.0
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4 text-brand" />
            <span className="text-[11px] font-bold tracking-widest text-slate-700 uppercase">
              EXPORT CSV
            </span>
          </button>
          <div className="flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Users className="w-4 h-4 text-brand" />
            <select
              value={filterCompany}
              onChange={(e) => {
                setFilterCompany(e.target.value);
                setFilterProduct('all'); // Reset product filter when company changes
              }}
              className="bg-transparent outline-none text-[11px] font-bold tracking-widest text-slate-700 uppercase cursor-pointer"
            >
              <option value="all">ALL COMPANIES</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Database className="w-4 h-4 text-brand" />
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="bg-transparent outline-none text-[11px] font-bold tracking-widest text-slate-700 uppercase cursor-pointer"
            >
              <option value="all">ALL ENTITIES</option>
              {products
                .filter((p) => filterCompany === 'all' || p.companyId === filterCompany)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.toUpperCase()}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-[11px] font-bold tracking-widest text-slate-700 uppercase">
              LAST 30 DAYS
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-3xl overflow-hidden shadow-2xl shadow-slate-200/50">
        <StatCard
          title="Total Insights"
          value={filteredSentiments.length}
          icon={MessageSquare}
          color="indigo"
        />
        <StatCard
          title="Sentiment Index"
          value={(
            filteredSentiments.reduce((a, b) => a + b.score, 0) / (filteredSentiments.length || 1)
          ).toFixed(2)}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          title="Positive Ratio"
          value={`${((((sentimentCounts.extremely_positive || 0) + (sentimentCounts.positive || 0) + (sentimentCounts.slightly_positive || 0)) / (filteredSentiments.length || 1)) * 100).toFixed(0)}%`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          title="Entities Tracked"
          value={new Set(filteredSentiments.map((s) => s.productId)).size}
          icon={Users}
          color="orange"
        />
      </div>

      {/* Prediction Engine Section */}
      <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <Activity className="w-48 h-48 text-brand" />
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
              <span className="text-[10px] font-bold text-brand tracking-[0.2em] uppercase">
                Predictive Intelligence Engine
              </span>
            </div>
            <h3 className="text-3xl font-display font-bold text-white tracking-tight">
              MARKET <span className="text-slate-500 font-light italic serif">Forecast</span>
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              Our AI deep-reasoning engine analyzes sentiment vectors to predict near-term revenue
              impact and brand health.
            </p>
          </div>

          <div className="flex flex-col justify-center items-center bg-white/5 rounded-2xl p-6 border border-white/10">
            <div className="text-5xl font-mono font-bold text-white mb-2">
              {prediction.healthScore}
            </div>
            <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-4">
              Product Health Score
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-brand h-full transition-all duration-1000"
                style={{ width: `${prediction.healthScore}%` }}
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              {prediction.forecast === 'profit_growth' ? (
                <TrendingUpIcon className="w-6 h-6 text-emerald-400 mt-1" />
              ) : prediction.forecast === 'loss_risk' ? (
                <AlertTriangle className="w-6 h-6 text-rose-400 mt-1" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-brand mt-1" />
              )}
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                  {prediction.forecast.replace('_', ' ')}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{prediction.summary}</p>
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Confidence
                </span>
                <span className="text-xs font-mono text-white">
                  {(prediction.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Trend
                </span>
                <span
                  className={`text-xs font-bold uppercase ${
                    prediction.trend === 'improving'
                      ? 'text-emerald-400'
                      : prediction.trend === 'declining'
                        ? 'text-rose-400'
                        : 'text-brand'
                  }`}
                >
                  {prediction.trend}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <PieChart className="w-32 h-32" />
          </div>
          <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-3 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            Sentiment Spectrum{' '}
            <span className="italic serif lowercase font-normal opacity-60 ml-1">Distribution</span>
          </h3>
          <div className="h-80 min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={90}
                  outerRadius={120}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                    padding: '12px 16px',
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Legend
                  iconType="rect"
                  formatter={(value) => (
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-3 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            Sentiment Flow{' '}
            <span className="italic serif lowercase font-normal opacity-60 ml-1">
              Temporal Analysis
            </span>
          </h3>
          <div className="h-80 min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" hide />
                <YAxis domain={[-1, 1]} stroke="#94a3b8" fontSize={10} fontVariant="tabular-nums" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                    padding: '12px 16px',
                  }}
                />
                <Line
                  type="step"
                  dataKey="score"
                  stroke="var(--color-brand)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--color-brand)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category Analysis */}
      <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-3 uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
          Category Matrix{' '}
          <span className="italic serif lowercase font-normal opacity-60 ml-1">
            Multi-dimensional
          </span>
        </h3>
        <div className="h-[500px] min-h-0 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={barData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#64748b"
                fontSize={10}
                fontWeight={700}
                width={140}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{
                  borderRadius: '16px',
                  border: 'none',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value) => (
                  <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                    {value}
                  </span>
                )}
              />
              <Bar dataKey="extremely_positive" stackId="a" fill={COLORS.extremely_positive} />
              <Bar dataKey="positive" stackId="a" fill={COLORS.positive} />
              <Bar dataKey="slightly_positive" stackId="a" fill={COLORS.slightly_positive} />
              <Bar dataKey="neutral" stackId="a" fill={COLORS.neutral} />
              <Bar dataKey="slightly_negative" stackId="a" fill={COLORS.slightly_negative} />
              <Bar dataKey="negative" stackId="a" fill={COLORS.negative} />
              <Bar
                dataKey="extremely_negative"
                stackId="a"
                fill={COLORS.extremely_negative}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => {
  const displayId = title.toUpperCase().replace(/\s+/g, '-') + '-' + Math.floor(value).toString().slice(-4);
  return (
    <div className="relative flex flex-col justify-between bg-white p-10 transition-colors hover:bg-slate-50 group">
      <div className="flex items-start justify-between">
        <div className={`p-3 rounded-xl bg-${color}-500/10 text-${color}-600`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-[10px] font-mono text-slate-400 tracking-tighter">ID: {displayId}</div>
      </div>
      <div className="mt-8">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">
          {title}
        </p>
        <p className="text-4xl font-mono font-bold text-slate-900 tracking-tighter">{value}</p>
      </div>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-transparent group-hover:bg-brand/10 transition-colors" />
    </div>
  );
};

