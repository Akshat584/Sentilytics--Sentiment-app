import React from 'react';
import { LayoutDashboard, BarChart2, Upload, Settings, LogOut, Search, Bell } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'DASHBOARD', icon: LayoutDashboard },
    { id: 'compare', label: 'COMPARISON', icon: BarChart2 },
    { id: 'upload', label: 'ANALYZE', icon: Upload },
    { id: 'alerts', label: 'ALERTS', icon: Bell },
    { id: 'settings', label: 'SETTINGS', icon: Settings },
  ];

  return (
    <div className="w-64 bg-slate-950 text-slate-400 h-screen flex flex-col border-r border-slate-800">
      <div className="p-8">
        <h1 className="text-xl font-display font-bold text-white flex items-center gap-3 tracking-tighter">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shadow-lg shadow-brand/20">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          SENTILYTICS
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[11px] font-bold tracking-widest transition-all duration-200 ${
              activeTab === item.id
                ? 'bg-brand text-white shadow-lg shadow-brand/20'
                : 'hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <item.icon
              className={`w-4 h-4 ${activeTab === item.id ? 'text-white' : 'text-slate-500'}`}
            />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export const Navbar: React.FC = () => {
  return (
    <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-10 sticky top-0 z-10">
      <div className="relative w-96 group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-brand transition-colors" />
        <input
          type="text"
          placeholder="SEARCH ANALYTICS..."
          className="w-full pl-12 pr-4 py-2.5 bg-slate-100/50 border border-transparent rounded-xl text-[10px] font-bold tracking-wider focus:outline-none focus:bg-white focus:border-brand/30 focus:ring-4 focus:ring-brand/5 transition-all"
        />
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-xs font-bold text-slate-900 tracking-tight uppercase">
            {auth.currentUser?.displayName || 'GUEST USER'}
          </span>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            {auth.currentUser?.email || 'OFFLINE MODE'}
          </span>
        </div>
        <div className="relative">
          <img
            src={
              auth.currentUser?.photoURL ||
              `https://ui-avatars.com/api/?name=Guest`
            }
            alt="Profile"
            className="w-10 h-10 rounded-xl border-2 border-slate-100 shadow-sm object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
        </div>
      </div>
    </header>
  );
};
