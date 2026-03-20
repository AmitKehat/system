// src/store/simulatorStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useChartStore } from './chartStore';

const STORAGE_KEY = 'quant_simulator_settings';

export const useSimulatorStore = create(
  persist(
    (set, get) => ({
      mode: 'single',
      provider: 'openai',
      apiKeys: { openai: '', anthropic: '', gemini: '' },
      parameters: {
        startDate: '2023-01-01',
        endDate: new Date().toISOString().split('T')[0],
        initialCapital: 100000,
        commission: 0.001,
      },
      chatHistory: [],
      isProcessing: false,
      results: null,

      setMode: (mode) => set({ mode }),
      setProvider: (provider) => set({ provider }),
      setApiKey: (provider, key) => set((state) => ({ apiKeys: { ...state.apiKeys, [provider]: key } })),
      updateParams: (updates) => set((state) => ({ parameters: { ...state.parameters, ...updates } })),

      clearChat: () => set({ chatHistory: [], results: null }),

      sendMessage: async (prompt, symbol) => {
        const { provider, apiKeys, chatHistory, parameters, mode } = get();
        const apiKey = apiKeys[provider];

        if (!apiKey) {
            set({ chatHistory: [...chatHistory, { role: 'user', content: prompt }, { role: 'system', content: `Please configure your ${provider.toUpperCase()} API key in the settings tab first.` }]});
            return;
        }

        const newHistory = [...chatHistory, { role: 'user', content: prompt }];
        set({ chatHistory: newHistory, isProcessing: true });

        try {
          const host = window.location.hostname || 'localhost';
          const apiUrl = import.meta.env.VITE_API_URL || `http://${host}:8000`;

          const res = await fetch(`${apiUrl}/api/simulator/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, mode, prompt, chat_history: chatHistory, parameters, llm_provider: provider, api_key: apiKey })
          });

          if (!res.ok) {
              throw new Error(`Server returned ${res.status}`);
          }

          const data = await res.json();

          if (data.status === 'success') {
              console.log(`[SIMULATOR] Backtest SUCCESS - Full response:`, data);
              console.log(`[SIMULATOR] Results symbol: ${data.results?.symbol}, Equity curve length: ${data.results?.equity_curve?.length}`);
              console.log(`[SIMULATOR] Code hash: ${data.code_hash}, Strategy name: ${data.strategy_name}`);

              // Backtest completed - sync chart to backtest symbol AND timeframe
              const backtestSymbol = data.results?.symbol || data.param_update?.symbol;
              const chartStore = useChartStore.getState();

              // Calculate duration needed to show full backtest period
              const startDate = data.param_update?.startDate || parameters.startDate;
              const endDate = data.param_update?.endDate || parameters.endDate;
              const start = new Date(startDate);
              const end = new Date(endDate);
              const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

              // Choose appropriate duration for the backtest period
              let targetDuration = '1 Y';
              if (daysDiff <= 7) targetDuration = '1 W';
              else if (daysDiff <= 30) targetDuration = '1 M';
              else if (daysDiff <= 90) targetDuration = '3 M';
              else if (daysDiff <= 180) targetDuration = '6 M';
              else if (daysDiff <= 365) targetDuration = '1 Y';
              else if (daysDiff <= 730) targetDuration = '2 Y';
              else targetDuration = '5 Y';

              console.log(`[SIMULATOR] Backtest period: ${startDate} to ${endDate} (${daysDiff} days) -> duration: ${targetDuration}`);

              // Switch chart to daily bars and appropriate duration for backtest view
              const needsUpdate = chartStore.barSize !== '1 day' || chartStore.duration !== targetDuration;
              if (needsUpdate) {
                  console.log(`[SIMULATOR] Switching chart to daily bars with ${targetDuration} duration`);
                  chartStore.setBarSize('1 day');
                  chartStore.setDuration(targetDuration);
              }

              if (backtestSymbol) {
                  const currentSymbol = chartStore.symbol;
                  console.log(`[SIMULATOR] Backtest symbol: ${backtestSymbol}, Current chart: ${currentSymbol}`);
                  if (backtestSymbol.toUpperCase() !== currentSymbol.toUpperCase()) {
                      console.log(`[SIMULATOR] Calling setSymbol to change chart from ${currentSymbol} to ${backtestSymbol}`);
                      chartStore.setSymbol(backtestSymbol);
                  } else if (needsUpdate) {
                      // Same symbol but different timeframe - trigger reload
                      chartStore.reloadChart();
                  }
              } else {
                  console.log(`[SIMULATOR] WARNING: No symbol in results or param_update!`, data);
              }

              // Update date parameters if they were changed
              if (data.param_update) {
                  const paramUpdates = {};
                  if (data.param_update.startDate) paramUpdates.startDate = data.param_update.startDate;
                  if (data.param_update.endDate) paramUpdates.endDate = data.param_update.endDate;
                  if (data.param_update.initialCapital) paramUpdates.initialCapital = data.param_update.initialCapital;
                  if (data.param_update.commission) paramUpdates.commission = data.param_update.commission;
                  if (Object.keys(paramUpdates).length > 0) {
                      get().updateParams(paramUpdates);
                  }
              }

              set({
                  results: data.results,
                  // Store the code in a hidden format so it can be found by history search
                  // The backend searches for ```python...``` blocks in history
                  chatHistory: [...newHistory, {
                      role: 'assistant',
                      content: `Simulation complete!\n\nSymbol: ${data.results.symbol}\nReturn: ${data.results.return_pct.toFixed(2)}%\nWin Rate: ${data.results.win_rate.toFixed(2)}%\nMax DD: ${data.results.max_drawdown.toFixed(2)}%\nTrades: ${data.results.total_trades}\n\nI have overlaid the trades on your chart.${data.code ? `\n\n\`\`\`python\n${data.code}\n\`\`\`` : ''}`
                  }]
              });

              // --- Register strategy indicator using the new hash-based system ---
              console.log('[SIMULATOR] About to call addOrUpdateStrategyIndicator with:');
              console.log('[SIMULATOR] - codeHash:', data.code_hash);
              console.log('[SIMULATOR] - strategyName:', data.strategy_name);
              console.log('[SIMULATOR] - trades count:', data.results.trades?.length);
              console.log('[SIMULATOR] - symbol:', backtestSymbol);
              console.log('[SIMULATOR] - strategy_indicators:', data.strategy_indicators);

              const indicatorId = chartStore.addOrUpdateStrategyIndicator({
                  codeHash: data.code_hash,
                  strategyName: data.strategy_name || 'Custom Strategy',
                  trades: data.results.trades,
                  symbol: backtestSymbol,
                  strategyIndicators: data.strategy_indicators || []
              });
              console.log('[SIMULATOR] Strategy indicator registered with id:', indicatorId);
              console.log('[SIMULATOR] Current indicators:', chartStore.indicators.filter(i => i.type === 'strategy'));
          } else if (data.status === 'chat_reply') {
              // Conversation continues - do NOT change the chart yet
              // Store the assistant's message (which includes the summary)
              set({ chatHistory: [...newHistory, { role: 'assistant', content: data.message }] });
          } else {
              // Error status
              set({ chatHistory: [...newHistory, { role: 'assistant', content: data.message }] });
          }
        } catch (e) {
          set({ chatHistory: [...newHistory, { role: 'assistant', content: `Connection dropped or failed to load. Please ensure the backend is running. (${e.message})` }] });
        } finally {
          set({ isProcessing: false });
        }
      },

      // Legacy compatibility functions
      persistState: () => {},
      loadPersistedState: () => {}
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        mode: state.mode,
        provider: state.provider,
        apiKeys: state.apiKeys,
        parameters: state.parameters,
        chatHistory: state.chatHistory,
        results: state.results
      })
    }
  )
);