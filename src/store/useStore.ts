import { create } from 'zustand';

interface AppState {
  globalCompanyFilter: string;
  globalProductFilter: string;
  setGlobalCompanyFilter: (id: string) => void;
  setGlobalProductFilter: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  globalCompanyFilter: 'all',
  globalProductFilter: 'all',
  setGlobalCompanyFilter: (id) => set({ globalCompanyFilter: id, globalProductFilter: 'all' }),
  setGlobalProductFilter: (id) => set({ globalProductFilter: id }),
}));