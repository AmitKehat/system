// src/store/portfolioStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const usePortfolioStore = create(
  persist(
    (set, get) => ({
      // State
      portfolioMode: 'paper', // 'paper' or 'live'
      accounts: [],
      selectedAccount: null,
      accountSummary: null,
      positions: [],
      orders: [],
      trades: [],
      
      // Loading states
      loading: { accounts: false, summary: false, positions: false, orders: false, trades: false },
      
      // Errors
      errors: { accounts: null, summary: null, positions: null, orders: null, trades: null },
      
      // UI State
      activePanel: 'positions',
      sidebarOpen: false,
      
      // Actions
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setActivePanel: (panel) => set({ activePanel: panel }),
      
      setPortfolioMode: (mode) => {
        set({ 
          portfolioMode: mode,
          accounts: [],
          selectedAccount: null,
          accountSummary: null,
          positions: [],
          orders: [],
          trades: [],
          errors: { accounts: null, summary: null, positions: null, orders: null, trades: null }
        });
        get().fetchAccounts();
      },
      
      setSelectedAccount: (accountId) => {
        set({ selectedAccount: accountId });
        const state = get();
        if (accountId) {
          state.fetchAccountSummary(accountId);
          state.fetchPositions(accountId);
          state.fetchOrders(accountId);
          state.fetchTrades(accountId);
        }
      },
      
      // API Calls
      fetchAccounts: async () => {
        const mode = get().portfolioMode;
        set((s) => ({ loading: { ...s.loading, accounts: true }, errors: { ...s.errors, accounts: null } }));
        try {
          const res = await fetch(`${API_BASE}/portfolio/accounts?mode=${mode}`);
          const data = await res.json();
          if (data.status === 'OK') {
            set({ accounts: data.accounts });
            const { selectedAccount } = get();
            if (!selectedAccount && data.accounts.length > 0) {
              get().setSelectedAccount(data.accounts[0]);
            }
          } else {
            throw new Error(data.detail || data.error || 'Failed to fetch accounts');
          }
        } catch (e) {
          set((s) => ({ errors: { ...s.errors, accounts: e.message } }));
        } finally {
          set((s) => ({ loading: { ...s.loading, accounts: false } }));
        }
      },
      
      fetchAccountSummary: async (accountId) => {
        if (!accountId) return;
        const mode = get().portfolioMode;
        set((s) => ({ loading: { ...s.loading, summary: true }, errors: { ...s.errors, summary: null } }));
        try {
          const res = await fetch(`${API_BASE}/portfolio/accounts/${accountId}/summary?mode=${mode}`);
          const data = await res.json();
          if (data.status === 'OK') set({ accountSummary: data.payload });
          else throw new Error(data.detail || data.error || 'Failed to fetch summary');
        } catch (e) {
          set((s) => ({ errors: { ...s.errors, summary: e.message } }));
        } finally {
          set((s) => ({ loading: { ...s.loading, summary: false } }));
        }
      },
      
      fetchPositions: async (accountId) => {
        if (!accountId) return;
        const mode = get().portfolioMode;
        set((s) => ({ loading: { ...s.loading, positions: true }, errors: { ...s.errors, positions: null } }));
        try {
          const res = await fetch(`${API_BASE}/portfolio/accounts/${accountId}/positions?mode=${mode}`);
          const data = await res.json();
          if (data.status === 'OK') set({ positions: data.payload });
          else throw new Error(data.detail || data.error || 'Failed to fetch positions');
        } catch (e) {
          set((s) => ({ errors: { ...s.errors, positions: e.message } }));
        } finally {
          set((s) => ({ loading: { ...s.loading, positions: false } }));
        }
      },
      
      fetchOrders: async (accountId, status = null) => {
        if (!accountId) return;
        const mode = get().portfolioMode;
        set((s) => ({ loading: { ...s.loading, orders: true }, errors: { ...s.errors, orders: null } }));
        try {
          const url = new URL(`${API_BASE}/portfolio/accounts/${accountId}/orders`);
          url.searchParams.set('mode', mode);
          if (status) url.searchParams.set('status', status);
          const res = await fetch(url.toString());
          const data = await res.json();
          if (data.status === 'OK') set({ orders: data.payload });
          else throw new Error(data.detail || data.error || 'Failed to fetch orders');
        } catch (e) {
          set((s) => ({ errors: { ...s.errors, orders: e.message } }));
        } finally {
          set((s) => ({ loading: { ...s.loading, orders: false } }));
        }
      },
      
      fetchTrades: async (accountId, days = 1) => {
        if (!accountId) return;
        const mode = get().portfolioMode;
        set((s) => ({ loading: { ...s.loading, trades: true }, errors: { ...s.errors, trades: null } }));
        try {
          const res = await fetch(`${API_BASE}/portfolio/accounts/${accountId}/trades?days=${days}&mode=${mode}`);
          const data = await res.json();
          if (data.status === 'OK') set({ trades: data.payload });
          else throw new Error(data.detail || data.error || 'Failed to fetch trades');
        } catch (e) {
          set((s) => ({ errors: { ...s.errors, trades: e.message } }));
        } finally {
          set((s) => ({ loading: { ...s.loading, trades: false } }));
        }
      },
      
      refreshAll: () => {
        const { selectedAccount } = get();
        if (selectedAccount) {
          get().fetchAccountSummary(selectedAccount);
          get().fetchPositions(selectedAccount);
          get().fetchOrders(selectedAccount);
          get().fetchTrades(selectedAccount);
        }
      }
    }),
    {
      name: 'optibiz-portfolio-storage',
      // ONLY save the UI states. Do NOT save old trading data!
      partialize: (state) => ({
        portfolioMode: state.portfolioMode,
        sidebarOpen: state.sidebarOpen,
        activePanel: state.activePanel,
        selectedAccount: state.selectedAccount
      }),
      // When the user refreshes, immediately refetch data for their saved account
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.fetchAccounts();
          if (state.selectedAccount) {
             state.fetchAccountSummary(state.selectedAccount);
             state.fetchPositions(state.selectedAccount);
             state.fetchOrders(state.selectedAccount);
             state.fetchTrades(state.selectedAccount);
          }
        }
      }
    }
  )
);