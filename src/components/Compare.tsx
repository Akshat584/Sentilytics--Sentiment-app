import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SentimentData, Product, Company } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
} from 'recharts';
import { Scale, ArrowRightLeft, Info, Search } from 'lucide-react';

import axios from 'axios';

export const Compare: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [sentiments, setSentiments] = useState<SentimentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<'all' | '7d' | '30d' | '90d'>('all');

  useEffect(() => {
    const fetchStaticData = async () => {
      try {
        const sentimentsRes = await axios.get('/api/sentiments');
        setSentiments(sentimentsRes.data);
      } catch (error) {
        console.error('Error fetching comparison data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStaticData();

    const companiesES = new EventSource('/api/companies');
    companiesES.onmessage = (event) => {
      setCompanies(JSON.parse(event.data));
    };

    const productsES = new EventSource('/api/products');
    productsES.onmessage = (event) => {
      setProducts(JSON.parse(event.data));
    };

    return () => {
      companiesES.close();
      productsES.close();
    };
  }, []);

  const getProductStats = (productId: string) => {
    let filteredSentiments = sentiments.filter((s) => s.productId === productId);

    // Apply time filtering
    if (selectedPeriod !== 'all') {
      const now = new Date();
      const days = selectedPeriod === '7d' ? 7 : selectedPeriod === '30d' ? 30 : 90;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      filteredSentiments = filteredSentiments.filter((s) => {
        const date = s.createdAt?.seconds
          ? new Date(s.createdAt.seconds * 1000)
          : new Date(s.createdAt);
        return date >= cutoff;
      });
    }

    if (filteredSentiments.length === 0) return null;

    const avgScore =
      filteredSentiments.reduce((a, b) => a + b.score, 0) / filteredSentiments.length;

    // Sentiment distribution
    const distribution = filteredSentiments.reduce(
      (acc, curr) => {
        if (curr.score > 0.2) acc.positive++;
        else if (curr.score < -0.2) acc.negative++;
        else acc.neutral++;
        return acc;
      },
      { positive: 0, neutral: 0, negative: 0 }
    );

    const categoryStats = filteredSentiments.reduce(
      (acc, curr) => {
        Object.entries(curr.confidenceScores).forEach(([cat, score]) => {
          if (cat === 'overall') return;
          if (!acc[cat]) acc[cat] = { positiveCount: 0, totalConfidence: 0 };

          const isPositive =
            curr.categorySentiments[cat as keyof typeof curr.categorySentiments] === 'positive' ||
            curr.categorySentiments[cat as keyof typeof curr.categorySentiments] ===
              'extremely_positive';

          if (isPositive) acc[cat].positiveCount++;
          acc[cat].totalConfidence += score;
        });
        return acc;
      },
      {} as Record<string, { positiveCount: number; totalConfidence: number }>
    );

    // Normalize category scores for radar chart
    const radarData = (
      Object.entries(categoryStats) as [
        string,
        { positiveCount: number; totalConfidence: number },
      ][]
    ).map(([subject, stats]) => ({
      subject: subject.toUpperCase(),
      value: (stats.positiveCount / filteredSentiments.length) * 100,
      confidence: (stats.totalConfidence / filteredSentiments.length) * 100,
      fullMark: 100,
    }));

    const product = products.find((p) => p.id === productId);
    const company = companies.find((c) => c.id === product?.companyId);

    // Trend data
    const trendData = filteredSentiments
      .map((s) => ({
        date: s.createdAt?.seconds ? s.createdAt.seconds * 1000 : new Date(s.createdAt).getTime(),
        score: s.score,
      }))
      .sort((a, b) => a.date - b.date);

    return {
      id: productId,
      name: product?.name || 'Unknown',
      companyName: company?.name || 'Unknown',
      companyLogo: company?.logoUrl,
      avgScore,
      count: filteredSentiments.length,
      distribution,
      radarData,
      trendData,
    };
  };

  const filteredProducts = products.filter((p) => {
    const company = companies.find((c) => c.id === p.companyId);
    const searchStr = `${p.name} ${company?.name || ''}`.toLowerCase();
    return searchStr.includes(searchTerm.toLowerCase());
  });

  const comparisonData = selectedProducts.map((id) => getProductStats(id)).filter(Boolean);

  const barData = comparisonData.map((d) => ({
    name: `${d!.name} (${d!.companyName})`,
    score: parseFloat(d!.avgScore.toFixed(2)),
  }));

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-display font-bold text-slate-900 tracking-tighter">
            COMPARATIVE <span className="text-brand font-light italic serif">Matrix</span>
          </h2>
          <p className="text-slate-500 font-mono text-[10px] tracking-widest mt-1 uppercase">
            Cross-entity sentiment correlation engine
          </p>
        </div>

        <div className="flex items-center bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200">
          {(['all', '7d', '30d', '90d'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-6 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all ${
                selectedPeriod === period
                  ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {period === 'all'
                ? 'All Time'
                : period === '7d'
                  ? '7 Days'
                  : period === '30d'
                    ? '30 Days'
                    : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-brand/10" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand/10 rounded-lg">
              <Scale className="w-5 h-5 text-brand" />
            </div>
            <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase">
              Entity Selection
            </h3>
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="SEARCH PRODUCTS OR COMPANIES..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold tracking-widest text-slate-700 uppercase outline-none focus:ring-2 focus:ring-brand/20 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => {
                if (selectedProducts.includes(product.id)) {
                  setSelectedProducts(selectedProducts.filter((id) => id !== product.id));
                } else if (selectedProducts.length < 4) {
                  setSelectedProducts([...selectedProducts, product.id]);
                }
              }}
              className={`p-6 rounded-3xl border text-left transition-all duration-300 relative group ${
                selectedProducts.includes(product.id)
                  ? 'border-brand bg-brand/5 ring-4 ring-brand/5 shadow-lg shadow-brand/5'
                  : 'border-slate-100 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div
                  className={`w-2 h-2 rounded-full ${selectedProducts.includes(product.id) ? 'bg-brand animate-pulse' : 'bg-slate-200'}`}
                />
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">
                  {product.id.substring(0, 8).toUpperCase()}
                </span>
              </div>
              <p
                className={`font-display font-bold text-sm tracking-tight transition-colors ${selectedProducts.includes(product.id) ? 'text-brand' : 'text-slate-900'}`}
              >
                {product.name.toUpperCase()}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {companies.find((c) => c.id === product.companyId)?.logoUrl && (
                  <img
                    src={companies.find((c) => c.id === product.companyId)?.logoUrl}
                    alt=""
                    className="w-3 h-3 rounded-full object-contain bg-white"
                    referrerPolicy="no-referrer"
                  />
                )}
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest truncate">
                  {companies.find((c) => c.id === product.companyId)?.name || 'Unknown'} •{' '}
                  {product.category}
                </p>
              </div>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-400 bg-slate-50/50 rounded-[30px] border border-dashed border-slate-200">
              <p className="text-xs font-bold tracking-widest uppercase">
                No matching entities found
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedProducts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-3 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              Sentiment Index{' '}
              <span className="italic serif lowercase font-normal opacity-60 ml-1">
                Correlation
              </span>
            </h3>
            <div className="h-80 min-h-0 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[-1, 1]}
                    tick={{ fontSize: 10, fontVariant: 'tabular-nums', fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar
                    dataKey="score"
                    fill="var(--color-brand)"
                    radius={[8, 8, 0, 0]}
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="text-xs font-bold tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-3 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              Feature Matrix{' '}
              <span className="italic serif lowercase font-normal opacity-60 ml-1">
                Radar Analysis
              </span>
            </h3>
            <div className="h-80 min-h-0 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  data={comparisonData[0]?.radarData || []}
                >
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fontSize: 9, fontWeight: 800, fill: '#94a3b8' }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  {comparisonData.map((data, idx) => (
                    <Radar
                      key={data!.name}
                      name={data!.name.toUpperCase()}
                      dataKey="value"
                      stroke={['#6366f1', '#10b981', '#f43f5e', '#f59e0b'][idx]}
                      fill={['#6366f1', '#10b981', '#f43f5e', '#f59e0b'][idx]}
                      fillOpacity={0.2}
                      strokeWidth={3}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                      padding: '12px 16px',
                    }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 space-y-3">
                            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase border-b border-slate-50 pb-2">
                              {payload[0].payload.subject}
                            </p>
                            {payload.map((entry, index) => (
                              <div key={index} className="flex items-center justify-between gap-8">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-[10px] font-bold text-slate-600 uppercase">
                                    {entry.name}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-xs font-mono font-bold text-slate-900">
                                    {entry.value.toFixed(1)}% POS
                                  </span>
                                  <span className="text-[8px] font-mono text-slate-400 uppercase">
                                    CONF: {entry.payload.confidence.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
                        {value}
                      </span>
                    )}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mini Sentiment Distribution Charts */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {comparisonData.map((data, idx) => (
              <div
                key={data!.id}
                className="bg-white p-6 rounded-[30px] border border-slate-200 shadow-sm relative overflow-hidden group"
              >
                <div
                  className="absolute top-0 left-0 w-1 h-full"
                  style={{ backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#f59e0b'][idx] }}
                />
                <div className="flex items-center gap-3 mb-4">
                  {data!.companyLogo && (
                    <img
                      src={data!.companyLogo}
                      alt=""
                      className="w-6 h-6 rounded-full object-contain bg-slate-50 p-1"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-tight truncate max-w-[120px]">
                      {data!.name}
                    </h4>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                      {data!.companyName}
                    </p>
                  </div>
                </div>

                <div className="flex items-end gap-1 h-12 mb-2 group/chart relative">
                  {/* Custom Tooltip */}
                  <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-950 text-white text-[9px] font-bold py-2.5 px-3.5 rounded-xl opacity-0 group-hover/chart:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-20 shadow-2xl border border-white/10 scale-90 group-hover/chart:scale-100 origin-bottom">
                    <div className="flex gap-4 items-center">
                      <div className="flex flex-col items-center">
                        <span className="text-emerald-400 mb-0.5">
                          {data!.distribution.positive}
                        </span>
                        <span className="text-[7px] text-slate-500 uppercase tracking-tighter">
                          POS
                        </span>
                      </div>
                      <div className="w-px h-4 bg-white/10" />
                      <div className="flex flex-col items-center">
                        <span className="text-slate-300 mb-0.5">{data!.distribution.neutral}</span>
                        <span className="text-[7px] text-slate-500 uppercase tracking-tighter">
                          NEU
                        </span>
                      </div>
                      <div className="w-px h-4 bg-white/10" />
                      <div className="flex flex-col items-center">
                        <span className="text-rose-400 mb-0.5">{data!.distribution.negative}</span>
                        <span className="text-[7px] text-slate-500 uppercase tracking-tighter">
                          NEG
                        </span>
                      </div>
                    </div>
                    {/* Tooltip Arrow */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-slate-950"></div>
                  </div>

                  <div
                    className="bg-emerald-500 rounded-t-sm transition-all duration-500"
                    style={{
                      height: `${(data!.distribution.positive / data!.count) * 100}%`,
                      width: '33%',
                    }}
                  />
                  <div
                    className="bg-slate-300 rounded-t-sm transition-all duration-500"
                    style={{
                      height: `${(data!.distribution.neutral / data!.count) * 100}%`,
                      width: '33%',
                    }}
                  />
                  <div
                    className="bg-rose-500 rounded-t-sm transition-all duration-500"
                    style={{
                      height: `${(data!.distribution.negative / data!.count) * 100}%`,
                      width: '33%',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase tracking-tighter mb-4">
                  <span>POS</span>
                  <span>NEU</span>
                  <span>NEG</span>
                </div>

                <div className="h-10 w-full opacity-50">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart data={data!.trendData}>
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={['#6366f1', '#10b981', '#f43f5e', '#f59e0b'][idx]}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <YAxis domain={[-1, 1]} hide />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[7px] font-mono text-slate-400 uppercase tracking-widest text-center mt-1">
                  Sentiment Velocity
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 text-slate-300 bg-white rounded-[40px] border border-slate-200 border-dashed">
          <ArrowRightLeft className="w-16 h-16 mb-6 opacity-10" />
          <p className="text-sm font-bold tracking-[0.3em] uppercase">
            Select entities to initialize comparison
          </p>
        </div>
      )}
    </div>
  );
};
