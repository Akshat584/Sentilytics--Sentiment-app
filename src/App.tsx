import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Auth } from './components/Auth';
import { Sidebar, Navbar } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Analyze } from './components/Analyze';
import { Compare } from './components/Compare';
import { Settings } from './components/Settings';
import { Alerts } from './components/Alerts';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Sync profile
        const profileRef = doc(db, 'profiles', user.uid);
        try {
          // Check if profile exists
          const profileSnap = await getDoc(profileRef);

          const profileData: any = {
            displayName: user.displayName || 'Anonymous',
            email: user.email,
            photoURL: user.photoURL,
            role: 'user',
            updatedAt: serverTimestamp(),
          };

          if (!profileSnap.exists()) {
            profileData.createdAt = serverTimestamp();
          }

          await setDoc(profileRef, profileData, { merge: true });
        } catch (err) {
          console.error('Error syncing profile:', err);
        }
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />

        <main className="flex-1 p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'dashboard' && <Dashboard />}
              {activeTab === 'upload' && <Analyze />}
              {activeTab === 'compare' && <Compare />}
              {activeTab === 'alerts' && <Alerts />}
              {activeTab === 'settings' && <Settings />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
  }
