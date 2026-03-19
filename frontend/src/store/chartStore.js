// src/store/chartStore.js
import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';

const generateId = () => 
  crypto?.randomUUID?.() || `id-${Math.random().toString(36).slice(2)}${Date.now()}`;

// Indicator definitions
export const INDICATOR_DEFS = [
  { 
    type: 'volume', 
    name: 'Volume', 
    overlay: true, 
    defaultParams: {},
    description: 'Trading volume histogram',
    category: 'volume'
  },
  { 
    type: 'sma', 
    name: 'SMA', 
    fullName: 'Simple Moving Average',
    overlay: true, 
    defaultParams: { period: 20, color: '#2962FF' },
    description: 'Simple Moving Average',
    category: 'moving-averages'
  },
  { 
    type: 'ema', 
    name: 'EMA', 
    fullName: 'Exponential Moving Average',
    overlay: true, 
    defaultParams: { period: 20, color: '#FF6D00' },
    description: 'Exponential Moving Average',
    category: 'moving-averages'
  },
  { 
    type: 'bb', 
    name: 'BB', 
    fullName: 'Bollinger Bands',
    overlay: true, 
    defaultParams: { period: 20, stdDev: 2, color: '#7B1FA2' },
    description: 'Bollinger Bands with standard deviation',
    category: 'moving-averages'
  },
  { 
    type: 'vwap', 
    name: 'VWAP', 
    fullName: 'Volume Weighted Average Price',
    overlay: true, 
    defaultParams: { color: '#00BCD4' },
    description: 'Volume Weighted Average Price',
    category: 'moving-averages'
  },
  {
    type: 'strategy',
    name: 'Strategy Trades',
    fullName: 'Strategy Backtest Trades',
    overlay: true,
    defaultParams: { color: '#089981' },
    description: 'Displays entry and exit arrows from your active strategy',
    category: 'trades',
    allowMultiple: true  // Strategy indicators can have multiple instances
  },
  { 
    type: 'rsi', 
    name: 'RSI', 
    fullName: 'Relative Strength Index',
    overlay: false, 
    defaultParams: { period: 14, overbought: 70, oversold: 30 },
    description: 'Relative Strength Index oscillator',
    category: 'oscillators'
  },
  { 
    type: 'macd', 
    name: 'MACD', 
    fullName: 'Moving Average Convergence Divergence',
    overlay: false, 
    defaultParams: { fast: 12, slow: 26, signal: 9 },
    description: 'MACD with histogram and signal line',
    category: 'oscillators'
  },
  { 
    type: 'stoch', 
    name: 'Stochastic', 
    fullName: 'Stochastic Oscillator',
    overlay: false, 
    defaultParams: { kPeriod: 14, dPeriod: 3, smooth: 3 },
    description: 'Stochastic %K and %D lines',
    category: 'oscillators'
  },
  { 
    type: 'atr', 
    name: 'ATR', 
    fullName: 'Average True Range',
    overlay: false, 
    defaultParams: { period: 14 },
    description: 'Average True Range volatility indicator',
    category: 'volatility'
  },
  { 
    type: 'adx', 
    name: 'ADX', 
    fullName: 'Average Directional Index',
    overlay: false, 
    defaultParams: { period: 14 },
    description: 'Trend strength indicator',
    category: 'trend'
  },
  { 
    type: 'cci', 
    name: 'CCI', 
    fullName: 'Commodity Channel Index',
    overlay: false, 
    defaultParams: { period: 20 },
    description: 'Momentum oscillator',
    category: 'oscillators'
  },
  { 
    type: 'obv', 
    name: 'OBV', 
    fullName: 'On Balance Volume',
    overlay: false, 
    defaultParams: {},
    description: 'Cumulative volume indicator',
    category: 'volume'
  }
];

export const useChartStore = create(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Chart state
        symbol: 'AAPL',
        barSize: '15 mins',
        duration: '1 W',
        useRTH: true,
        theme: 'dark',
        
        // Data
        bars: [],
        loading: false,
        error: null,
        
        // Indicators
        indicators: [
          { id: 'volume-main', type: 'volume', overlay: true, visible: true, params: {} }
        ],
        favorites: ['sma', 'ema', 'rsi', 'macd'],
        
        // Pane layout (heights as fractions)
        paneHeights: {},
        
        // UI state
        indicatorDialogOpen: false,
        settingsDialogOpen: false,
        activeSettingsIndicator: null,

        // Actions
        setSymbol: (symbol) => set({
            symbol: symbol.toUpperCase().trim(),
            bars: [], // INSTANTLY clear old chart data to prevent old candles from lingering
            loading: true,
            error: null
        }),
        setBarSize: (barSize) => set({ barSize }),
        setDuration: (duration) => set({ duration }),
        setUseRTH: (useRTH) => set({ useRTH }),
        toggleTheme: () => set((state) => ({ 
          theme: state.theme === 'dark' ? 'light' : 'dark' 
        })),
        
        setBars: (barsOrUpdater) => {
          if (typeof barsOrUpdater === 'function') {
            const currentBars = get().bars;
            const newBars = barsOrUpdater(currentBars);
            set({ bars: newBars, loading: false, error: null });
          } else {
            set({ bars: barsOrUpdater, loading: false, error: null });
          }
        },   

        // Real-time updates
        updateLastBar: (updatedBar) => {
          const bars = get().bars;
          if (!bars || bars.length === 0) return;
          
          const newBars = [...bars.slice(0, -1), updatedBar];
          set({ bars: newBars });
        },

        addNewBar: (newBar) => {
          const bars = get().bars || [];
          set({ bars: [...bars, newBar] });
        },
    
        setLoading: (loading) => set({ loading }),
        setError: (error) => set({ error, loading: false }),
        
        addIndicator: (type, params = {}) => {
          const { indicators } = get();
          const def = INDICATOR_DEFS.find(d => d.type === type);
          if (!def) return null;

          // Volume is unique (only 1 instance allowed)
          // Strategy indicators now allow multiple instances via addOrUpdateStrategyIndicator
          if (type === 'volume') {
            const existing = indicators.find(i => i.type === type);
            if (existing) {
              set({
                indicators: indicators.map(i =>
                  i.type === type ? { ...i, visible: true } : i
                )
              });
              return existing.id;
            }
          }

          const newIndicator = {
            id: generateId(),
            type: def.type,
            overlay: def.overlay,
            visible: true,
            params: { ...def.defaultParams, ...params }
          };

          set((state) => {
            const newIndicators = [...state.indicators, newIndicator];
            const newPaneHeights = { ...state.paneHeights };

            if (!newIndicator.overlay) {
              // Calculate default height for new pane
              const defaultHeight = 0.2;
              newPaneHeights[newIndicator.id] = defaultHeight;

              // Adjust main pane height
              const currentMainHeight = newPaneHeights.main ?? 0.7;
              newPaneHeights.main = Math.max(0.3, currentMainHeight - defaultHeight);
            }

            return {
              indicators: newIndicators,
              paneHeights: newPaneHeights
            };
          });

          return newIndicator.id;
        },

        // Special function to add or update strategy indicators
        // Matches by code hash - same strategy logic = same indicator
        addOrUpdateStrategyIndicator: ({ codeHash, strategyName, trades, symbol }) => {
          const { indicators } = get();

          // Find existing strategy with same code hash
          const existingIdx = indicators.findIndex(
            i => i.type === 'strategy' && i.codeHash === codeHash
          );

          if (existingIdx !== -1) {
            // Update existing strategy indicator
            set((state) => ({
              indicators: state.indicators.map((ind, idx) =>
                idx === existingIdx
                  ? { ...ind, trades, symbol, visible: true }
                  : ind
              )
            }));
            return indicators[existingIdx].id;
          } else {
            // Create new strategy indicator
            const newId = generateId();
            const newIndicator = {
              id: newId,
              type: 'strategy',
              overlay: true,
              visible: true,
              name: strategyName,
              codeHash,
              trades,
              symbol,
              params: { color: '#089981' }
            };

            set((state) => ({
              indicators: [...state.indicators, newIndicator]
            }));

            return newId;
          }
        },

        // Get all strategy indicators
        getStrategyIndicators: () => {
          return get().indicators.filter(i => i.type === 'strategy');
        },
        
        removeIndicator: (id) => {
          set((state) => {
            const ind = state.indicators.find(i => i.id === id);
            const newIndicators = state.indicators.filter(i => i.id !== id);
            const newPaneHeights = { ...state.paneHeights };
            
            // If removing a non-overlay, redistribute its height to main
            if (ind && !ind.overlay) {
              const removedHeight = newPaneHeights[id] ?? 0.2;
              delete newPaneHeights[id];
              newPaneHeights.main = (newPaneHeights.main ?? 0.7) + removedHeight;
            }
            
            return {
              indicators: newIndicators,
              paneHeights: newPaneHeights,
              settingsDialogOpen: state.activeSettingsIndicator === id 
                ? false 
                : state.settingsDialogOpen,
              activeSettingsIndicator: state.activeSettingsIndicator === id 
                ? null 
                : state.activeSettingsIndicator
            };
          });
        },
        
        toggleIndicatorVisibility: (id) => {
          set((state) => ({
            indicators: state.indicators.map(i => 
              i.id === id ? { ...i, visible: !i.visible } : i
            )
          }));
        },
        
        updateIndicatorParams: (id, params) => {
          set((state) => ({
            indicators: state.indicators.map(i =>
              i.id === id ? { ...i, params: { ...i.params, ...params } } : i
            )
          }));
        },
        
        toggleFavorite: (type) => {
          set((state) => ({
            favorites: state.favorites.includes(type)
              ? state.favorites.filter(f => f !== type)
              : [...state.favorites, type]
          }));
        },
        
        setPaneHeights: (heightsOrFn) => {
            if (typeof heightsOrFn === 'function') {
              set((state) => ({ paneHeights: heightsOrFn(state.paneHeights) }));
            } else {
              set({ paneHeights: heightsOrFn });
            }
        },
          
        openIndicatorDialog: () => set({ indicatorDialogOpen: true }),
        closeIndicatorDialog: () => set({ indicatorDialogOpen: false }),
        
        openSettings: (id) => set({ 
          settingsDialogOpen: true, 
          activeSettingsIndicator: id 
        }),
        closeSettings: () => set({ 
          settingsDialogOpen: false, 
          activeSettingsIndicator: null 
        }),

        reloadChart: () => {
          const { symbol } = get();
          if (symbol) {
            // Clear bars to show loading state
            set({ bars: [], loading: true, error: null });
            // Trigger reload by updating a timestamp
            set({ lastReload: Date.now() });
          }
        },

        // Legacy compatibility functions (safe-guards in case they are called elsewhere)
        loadPersistedState: () => {}, 
        persistState: () => {} 
      }),
      {
        name: 'optibiz-chart-storage',
        // Only save UI layout and user settings, DO NOT save market data (bars/loading state)
        partialize: (state) => ({
          symbol: state.symbol,
          barSize: state.barSize,
          duration: state.duration,
          useRTH: state.useRTH,
          theme: state.theme,
          indicators: state.indicators,
          favorites: state.favorites,
          paneHeights: state.paneHeights
        })
      }
    )
  )
);