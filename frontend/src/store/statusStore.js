import { create } from 'zustand';

export const useStatusStore = create((set, get) => ({
  isAuthenticated: false,
  sessionId: null,
  mode: 'live', // Defaulting to live for the backend session creation
  isLoggingIn: false,
  loginError: null,
  ibStatusLive: { connected: null, error: null },
  ibStatusPaper: { connected: null, error: null },
  wsConnected: false,
  symbol: null,
  subscribedSymbols: [], // CRITICAL FIX: Track bulk subscriptions for the watchlist

  login: async (username, password) => {
    set({ isLoggingIn: true, loginError: null });
    try {
      const host = window.location.hostname || 'localhost';
      const apiUrl = import.meta.env.VITE_API_URL || `http://${host}:8000`;
      
      const response = await fetch(`${apiUrl}/ib/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, mode: 'live' })
      });
      const data = await response.json();
      
      if (data.status === 'OK') {
        set({ isAuthenticated: true, sessionId: data.session_id, mode: data.mode, isLoggingIn: false });
        get().connectWebSocket();
        return { success: true };
      } else {
        set({ isLoggingIn: false, loginError: data.error });
        return { success: false, error: data.error };
      }
    } catch (e) {
      set({ isLoggingIn: false, loginError: e.message });
      return { success: false, error: e.message };
    }
  },

  logout: () => {
    get().disconnectWebSocket();
    set({ 
      isAuthenticated: false, 
      sessionId: null, 
      ibStatusLive: { connected: null, error: null },
      ibStatusPaper: { connected: null, error: null },
      subscribedSymbols: []
    });
  },

  connectWebSocket: () => {
    const { sessionId, isAuthenticated } = get();
    if (!isAuthenticated || !sessionId) return;

    const host = window.location.hostname || 'localhost';
    const apiUrl = import.meta.env.VITE_API_URL || `http://${host}:8000`;
    const wsUrl = `${apiUrl.replace(/^http/, 'ws')}/ws/status?session_id=${sessionId}`;
    
    let socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      set({ ws: socket, wsConnected: true });
      
      const { symbol, subscribedSymbols } = get();
      
      // Resubscribe to main chart
      if (symbol) socket.send(JSON.stringify({ action: 'subscribe', symbol }));
      
      // CRITICAL FIX: Bulk resubscribe to all watchlist items on reconnect
      subscribedSymbols.forEach(sym => {
        if (sym !== symbol) socket.send(JSON.stringify({ action: 'subscribe', symbol: sym }));
      });
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data.replace(/:\s?NaN/g, ": null"));
      if (data.type === 'ib_status_live') set({ ibStatusLive: data.payload });
      if (data.type === 'ib_status_paper') set({ ibStatusPaper: data.payload });
      if (data.type === 'market_status') set({ marketStatus: data.payload });
      if (data.type === 'bar_update') window.dispatchEvent(new CustomEvent('liveBarUpdate', { detail: data.payload }));
    };

    socket.onclose = () => {
      set({ wsConnected: false });
      if (get().isAuthenticated) {
        setTimeout(get().connectWebSocket, 3000);
      }
    };
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    set({ ws: null, wsConnected: false });
  },
  
  subscribeToSymbol: (symbol) => {
    const { ws, wsConnected, subscribedSymbols } = get();
    console.log(`📡 [UI] Requesting Live Data for: ${symbol} | WS Connected: ${wsConnected}`);
    if (ws && wsConnected) ws.send(JSON.stringify({ action: 'subscribe', symbol }));
    
    set({ 
      symbol,
      subscribedSymbols: subscribedSymbols.includes(symbol) ? subscribedSymbols : [...subscribedSymbols, symbol]
    });
  },

  // CRITICAL FIX: New bulk subscription method specifically for Watchlists
  subscribeMultiple: (symbols) => {
    const { ws, wsConnected, subscribedSymbols } = get();
    const newSubs = new Set(subscribedSymbols);
    let updated = false;

    symbols.forEach(sym => {
        if (!newSubs.has(sym)) {
            newSubs.add(sym);
            updated = true;
            if (ws && wsConnected) ws.send(JSON.stringify({ action: 'subscribe', symbol: sym }));
        }
    });

    if (updated) {
        set({ subscribedSymbols: Array.from(newSubs) });
    }
  },

  unsubscribeFromSymbol: (symbol) => {
    const { ws, wsConnected, subscribedSymbols } = get();
    if (ws && wsConnected) {
        ws.send(JSON.stringify({ action: 'unsubscribe', symbol }));
    }
    set({ subscribedSymbols: subscribedSymbols.filter(s => s !== symbol) });
  },

  reconnectIB: async (targetMode = 'live') => {
    try {
        const host = window.location.hostname || 'localhost';
        const apiUrl = import.meta.env.VITE_API_URL || `http://${host}:8000`;

        await fetch(`${apiUrl}/ib/reconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: targetMode })
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
  }
}));