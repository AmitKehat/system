import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const useWatchlistStore = create((set, get) => ({
  watchlists: [],
  selectedListId: null,
  loading: false,

  fetchWatchlists: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/watchlists`);
      if (!res.ok) throw new Error(`API returned status: ${res.status}`);
      
      const data = await res.json();
      
      if (Array.isArray(data)) {
        set({ watchlists: data });
        if (data.length > 0 && !get().selectedListId) {
          set({ selectedListId: data[0].id });
        }
      } else {
        throw new Error("Invalid data format received from API");
      }
    } catch (e) {
      console.error("Failed to fetch watchlists:", e);
      set({ watchlists: [] }); 
    } finally {
      set({ loading: false });
    }
  },

  createWatchlist: async (name) => {
    try {
      const res = await fetch(`${API_BASE}/watchlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error("Failed to create");
      
      const newList = await res.json();
      set((s) => ({
        watchlists: [...s.watchlists, newList],
        selectedListId: newList.id
      }));
    } catch (e) {
      console.error("Failed to create watchlist:", e);
    }
  },

  updateWatchlistName: async (id, newName) => {
    try {
      const res = await fetch(`${API_BASE}/watchlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      if (!res.ok) throw new Error("Failed to update name");
      
      const updatedList = await res.json();
      set((s) => ({
        watchlists: s.watchlists.map(w => w.id === id ? { ...w, name: updatedList.name } : w)
      }));
    } catch (e) {
      console.error("Failed to rename watchlist:", e);
    }
  },

  deleteWatchlist: async (id) => {
    try {
      const res = await fetch(`${API_BASE}/watchlists/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete");

      set((s) => {
        const remaining = s.watchlists.filter(w => w.id !== id);
        return {
          watchlists: remaining,
          selectedListId: remaining.length > 0 ? remaining[0].id : null
        };
      });
    } catch (e) {
      console.error("Failed to delete watchlist:", e);
    }
  },

  addSymbol: async (watchlistId, symbol) => {
    try {
      const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      });
      if (!res.ok) throw new Error("Failed to add symbol");

      const newItem = await res.json();
      set((s) => ({
        watchlists: s.watchlists.map(w => {
          if (w.id === watchlistId) {
            return { ...w, items: [...w.items, newItem] };
          }
          return w;
        })
      }));
    } catch (e) {
      console.error("Failed to add symbol:", e);
    }
  },

  removeSymbol: async (watchlistId, itemId) => {
    try {
      const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to remove symbol");

      set((s) => ({
        watchlists: s.watchlists.map(w => {
          if (w.id === watchlistId) {
            return { ...w, items: w.items.filter(i => i.id !== itemId) };
          }
          return w;
        })
      }));
    } catch (e) {
      console.error("Failed to remove symbol:", e);
    }
  },

  reorderSymbols: async (watchlistId, newOrderArray) => {
    set((s) => ({
      watchlists: s.watchlists.map(w => {
        if (w.id === watchlistId) {
          return { ...w, items: newOrderArray };
        }
        return w;
      })
    }));
    
    try {
      const itemIds = newOrderArray.map(item => item.id);
      const res = await fetch(`${API_BASE}/watchlists/${watchlistId}/items/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: itemIds })
      });
      if (!res.ok) throw new Error("Failed to sync reorder");
    } catch (e) {
      console.error("Failed to reorder:", e);
      get().fetchWatchlists();
    }
  },

  setSelectedList: (id) => set({ selectedListId: id })
}));