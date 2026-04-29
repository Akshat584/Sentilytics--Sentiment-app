import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Alert, Product, Company } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { AlertTriangle, Bell, CheckCircle2, ShieldAlert, Zap } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

export const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch products & companies for context
    const fetchData = async () => {
      try {
        const [prodRes, compRes] = await Promise.all([
          axios.get('/api/products'),
          axios.get('/api/companies')
        ]);
        setProducts(prodRes.data);
        setCompanies(compRes.data);
      } catch (err) {
        console.error('Error fetching static data for alerts:', err);
      }
    };
    fetchData();

    // Listen to real-time alerts
    const alertsQuery = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      alertsQuery,
      (snapshot) => {
        const newAlerts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Alert[];
        setAlerts(newAlerts);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'alerts')
    );

    return () => unsubscribe();
  }, []);

  const markAsRead = async (alertId: string) => {
    try {
      const alertRef = doc(db, 'alerts', alertId);
      await updateDoc(alertRef, { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'alerts');
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ShieldAlert className="w-5 h-5 text-rose-500" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'medium': return <Zap className="w-5 h-5 text-amber-500" />;
      default: return <Bell className="w-5 h-5 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string, isRead: boolean) => {
    if (isRead) return 'bg-slate-50 border-slate-200 text-slate-500 opacity-60';
    switch (severity) {
      case 'critical': return 'bg-rose-50 border-rose-200 text-rose-900 shadow-rose-100';
      case 'high': return 'bg-orange-50 border-orange-200 text-orange-900 shadow-orange-100';
      case 'medium': return 'bg-amber-50 border-amber-200 text-amber-900 shadow-amber-100';
      default: return 'bg-blue-50 border-blue-200 text-blue-900 shadow-blue-100';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-display font-bold text-slate-900 tracking-tighter">
            ALERT <span className="text-brand font-light italic serif">Center</span>
          </h2>
          <p className="text-slate-500 font-mono text-[10px] tracking-widest mt-1 uppercase">
            Real-Time System Notifications & Anomalies
          </p>
        </div>
        <div className="bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
            {alerts.filter(a => !a.isRead).length} Unread
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {alerts.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">All clear! No alerts detected.</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const product = products.find(p => p.id === alert.productId);
              const company = companies.find(c => c.id === alert.companyId);
              const isRead = alert.isRead;

              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all shadow-sm hover:shadow-md ${getSeverityColor(alert.severity, isRead)}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">
                          {alert.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-mono opacity-50">•</span>
                        <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                          {company?.name} / {product?.name}
                        </span>
                      </div>
                      <h3 className={`text-lg font-bold ${isRead ? 'line-through opacity-60' : ''}`}>
                        {alert.message}
                      </h3>
                      <p className="text-xs mt-2 opacity-60 font-mono">
                        {alert.createdAt?.seconds ? new Date(alert.createdAt.seconds * 1000).toLocaleString() : 'Just now'}
                      </p>
                    </div>
                  </div>
                  
                  {!isRead && (
                    <button
                      onClick={() => markAsRead(alert.id!)}
                      className="shrink-0 px-5 py-2.5 bg-white/50 hover:bg-white border border-current rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all"
                    >
                      Acknowledge
                    </button>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};