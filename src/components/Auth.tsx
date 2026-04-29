import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { BarChart2, AlertCircle } from 'lucide-react';

export const Auth: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getErrorMessage = (code: string): string => {
    switch (code) {
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for sign-in. Please add "localhost" to the Firebase Console → Authentication → Settings → Authorized domains.';
      case 'auth/operation-not-allowed':
      case 'auth/admin-restricted-operation':
        return 'Google Sign-In is not enabled. Please enable the Google provider in Firebase Console → Authentication → Sign-in method.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled. Please try again.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection and try again.';
      case 'auth/cancelled-popup-request':
        return ''; // Silently ignore duplicate popup requests
      default:
        return `Sign-in failed (${code}). Please try again.`;
    }
  };

  // Handle redirect result on mount (for signInWithRedirect fallback)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // User signed in via redirect - onAuthStateChanged in App.tsx will handle it
          setError(null);
        }
      })
      .catch((err: any) => {
        if (err.code && err.code !== 'auth/popup-closed-by-user') {
          setError(getErrorMessage(err.code));
        }
      });
  }, []);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Login failed:', err);
      const code = err?.code || '';

      // If popup was blocked or unauthorized domain, try redirect as fallback
      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
          return; // Page will redirect
        } catch (redirectErr: any) {
          setError(getErrorMessage(redirectErr?.code || 'unknown'));
        }
      } else if (code === 'auth/cancelled-popup-request') {
        // Silently ignore
      } else {
        setError(getErrorMessage(code));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 technical-grid">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 bg-white rounded-[40px] shadow-2xl shadow-slate-200/50 overflow-hidden border border-slate-200">
        {/* Left Side: Branding & Info */}
        <div className="p-12 lg:p-20 bg-slate-950 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand/20 blur-[100px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand/10 blur-[100px] -ml-32 -mb-32" />

          <div className="relative z-10">
            <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center mb-8 shadow-lg shadow-brand/20">
              <BarChart2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-5xl font-display font-bold tracking-tighter leading-none">
              SENTILYTICS <br />
              <span className="text-brand italic serif font-light text-4xl">Intelligence</span>
            </h1>
            <p className="text-slate-400 mt-6 text-lg max-w-xs leading-relaxed">
              Advanced sentiment processing for modern product teams. Turn raw feedback into
              actionable intelligence.
            </p>
          </div>

          <div className="relative z-10 mt-12">
            <div className="flex -space-x-3 mb-4">
              {[1, 2, 3, 4].map((i) => (
                <img
                  key={i}
                  src={`https://picsum.photos/seed/user${i}/100/100`}
                  className="w-10 h-10 rounded-full border-2 border-slate-950 object-cover"
                  alt="User"
                />
              ))}
              <div className="w-10 h-10 rounded-full border-2 border-slate-950 bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                +2k
              </div>
            </div>
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
              Trusted by 2,000+ data scientists
            </p>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="p-12 lg:p-20 flex flex-col justify-center items-center text-center">
          <div className="max-w-sm w-full space-y-10">
            <div>
              <h2 className="text-3xl font-display font-bold text-slate-900 tracking-tight">
                Welcome Back
              </h2>
              <p className="text-slate-500 mt-2 text-sm">Access your enterprise dashboard</p>
            </div>

            <div className="space-y-4">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-left">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 leading-relaxed">{error}</p>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-4 px-6 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 flex items-center justify-center gap-4 hover:bg-slate-50 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                ) : (
                  <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                )}
                {loading ? 'SIGNING IN...' : 'CONTINUE WITH GOOGLE'}
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-bold tracking-[0.2em] uppercase">
                  <span className="bg-white px-4 text-slate-400">Secure Access</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Uptime</p>
                  <p className="text-xl font-mono font-bold text-slate-900">99.9%</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Latency</p>
                  <p className="text-xl font-mono font-bold text-slate-900">&lt;40ms</p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-relaxed">
              By continuing, you agree to our{' '}
              <span className="underline cursor-pointer hover:text-brand">Terms of Service</span>{' '}
              and <span className="underline cursor-pointer hover:text-brand">Privacy Policy</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
