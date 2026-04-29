import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { User, Shield, Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

export const Settings: React.FC = () => {
  const [clearing, setClearing] = useState(false);
  const [success, setSuccess] = useState(false);

  const clearAllData = async () => {
    if (
      !window.confirm('Are you sure you want to delete all sentiment data? This cannot be undone.')
    )
      return;

    setClearing(true);
    try {
      const collections = ['sentiments', 'reviews', 'products', 'companies'];
      for (const colName of collections) {
        const snapshot = await getDocs(collection(db, colName));
        const deletePromises = snapshot.docs.map((d) => deleteDoc(doc(db, colName, d.id)));
        await Promise.all(deletePromises);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Failed to clear data. Check console for details.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
          <User className="w-7 h-7 text-indigo-600" />
          Profile Settings
        </h2>

        <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
          <img
            src={auth.currentUser?.photoURL || ''}
            alt="Profile"
            className="w-20 h-20 rounded-full border-4 border-white shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div>
            <h3 className="text-xl font-bold text-slate-900">{auth.currentUser?.displayName}</h3>
            <p className="text-slate-500">{auth.currentUser?.email}</p>
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full uppercase">
              <Shield className="w-3 h-3" />
              Standard User
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 text-red-600">
          <AlertTriangle className="w-7 h-7" />
          Danger Zone
        </h2>

        <div className="p-6 border border-red-100 bg-red-50/50 rounded-2xl space-y-4">
          <div>
            <h3 className="font-bold text-red-900">Reset All Analytics Data</h3>
            <p className="text-sm text-red-700 mt-1">
              This will permanently delete all companies, products, reviews, and sentiment analysis
              results from your database.
            </p>
          </div>

          <button
            onClick={clearAllData}
            disabled={clearing}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all disabled:opacity-50 shadow-lg shadow-red-500/20"
          >
            {clearing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : success ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
            {clearing ? 'Clearing Database...' : success ? 'Data Cleared' : 'Clear All Data'}
          </button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-2xl font-bold mb-4">Platform Information</h2>
        <div className="space-y-4 text-slate-600 text-sm">
          <div className="flex justify-between py-3 border-b border-slate-100">
            <span>Version</span>
            <span className="font-mono font-bold">2.1.0-stable</span>
          </div>
          <div className="flex justify-between py-3 border-b border-slate-100">
            <span>AI Model</span>
            <span className="font-mono font-bold">Gemini 3 Flash Preview</span>
          </div>
          <div className="flex justify-between py-3 border-b border-slate-100">
            <span>Database Region</span>
            <span className="font-mono font-bold">asia-south1</span>
          </div>
        </div>
      </div>
    </div>
  );
};
