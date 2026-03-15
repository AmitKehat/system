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

          // Intercept parameter updates (INCLUDING SYMBOL CHANGES)
          if (data.param_update) {
              if (data.param_update.symbol) {
                  // Force the main chart to instantly switch to the new symbol
                  useChartStore.getState().setSymbol(data.param_update.symbol);
                  delete data.param_update.symbol;
              }
              // Update any remaining strategy parameters
              if (Object.keys(data.param_update).length > 0) {
                  get().updateParams(data.param_update);
              }
          }

          if (data.status === 'success') {
              set({ 
                  results: data.results,
                  chatHistory: [...newHistory, { role: 'assistant', content: `Simulation complete!\n\nReturn: ${data.results.return_pct.toFixed(2)}%\nWin Rate: ${data.results.win_rate.toFixed(2)}%\nMax DD: ${data.results.max_drawdown.toFixed(2)}%\n\nI have overlaid the trades on your chart.` }]
              });

              // --- Automatically register the strategy as a chart indicator ---
              const chartStore = useChartStore.getState();
              const hasStrategy = chartStore.indicators.some(i => i.type === 'strategy');
              if (!hasStrategy) {
                  chartStore.addIndicator('strategy');
              } else {
                  const strategyInd = chartStore.indicators.find(i => i.type === 'strategy');
                  if (strategyInd && strategyInd.visible === false) {
                      chartStore.toggleIndicatorVisibility(strategyInd.id);
                  }
              }
          } else {
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