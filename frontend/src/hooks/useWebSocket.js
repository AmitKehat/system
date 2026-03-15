// src/hooks/useWebSocket.js
import { useEffect, useRef, useCallback } from 'react';
import { useStatusStore } from '../store/statusStore';
import { useChartStore } from '../store/chartStore';

export function useWebSocket() {
  const connectWebSocket = useStatusStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useStatusStore((s) => s.disconnectWebSocket);

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);
}

export function useSymbolSubscription() {
  const symbol = useChartStore((s) => s.symbol);
  const subscribeToSymbol = useStatusStore((s) => s.subscribeToSymbol);
  const unsubscribeFromSymbol = useStatusStore((s) => s.unsubscribeFromSymbol);
  
  // FIX: Watch the connected status of the LIVE Data Master gateway
  const ibLiveConnected = useStatusStore((s) => s.ibStatusLive.connected);

  useEffect(() => {
    // Only subscribe when we have a symbol AND the Live gateway is actually connected
    if (symbol && ibLiveConnected) {
      subscribeToSymbol(symbol);
      
      return () => {
        unsubscribeFromSymbol(symbol);
      };
    }
  }, [symbol, ibLiveConnected, subscribeToSymbol, unsubscribeFromSymbol]);
}

// Helper to parse bar size string to seconds
function barSizeToSeconds(barSize) {
  const match = barSize.match(/(\d+)\s*(secs?|mins?|hours?|days?|weeks?|months?)/i);
  if (!match) return 60;
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  if (unit.startsWith('sec')) return value;
  if (unit.startsWith('min')) return value * 60;
  if (unit.startsWith('hour')) return value * 3600;
  if (unit.startsWith('day')) return value * 86400;
  if (unit.startsWith('week')) return value * 604800;
  
  return 60;
}

// Align timestamp to bar boundary
function alignToBarBoundary(timestamp, barSizeSeconds) {
  return Math.floor(timestamp / barSizeSeconds) * barSizeSeconds;
}

export function useLiveBarUpdates() {
  const symbol = useChartStore((s) => s.symbol);
  const barSize = useChartStore((s) => s.barSize);
  const updateLastBar = useChartStore((s) => s.updateLastBar);
  const addNewBar = useChartStore((s) => s.addNewBar);
  
  const barSizeSecondsRef = useRef(60);

  useEffect(() => {
    barSizeSecondsRef.current = barSizeToSeconds(barSize);
  }, [barSize]);

  useEffect(() => {
    const handleBarUpdate = (event) => {
      const { symbol: updateSymbol, bar } = event.detail;
      
      if (updateSymbol.toUpperCase() !== symbol?.toUpperCase()) {
        return;
      }

      const barSizeSeconds = barSizeSecondsRef.current;
      const barBoundary = alignToBarBoundary(bar.time, barSizeSeconds);
      
      const currentBars = useChartStore.getState().bars;
      
      if (!currentBars || currentBars.length === 0) {
        addNewBar({
          time: barBoundary,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume
        });
        return;
      }

      const lastBar = currentBars[currentBars.length - 1];
      
      if (barBoundary === lastBar.time) {
        // Update existing bar
        updateLastBar({
          time: lastBar.time,
          open: lastBar.open,
          high: Math.max(lastBar.high, bar.high),
          low: Math.min(lastBar.low, bar.low),
          close: bar.close,
          volume: Math.max(lastBar.volume, bar.volume)
        });
      } else if (barBoundary > lastBar.time) {
        // New bar
        addNewBar({
          time: barBoundary,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume
        });
      }
    };

    window.addEventListener('liveBarUpdate', handleBarUpdate);
    
    return () => {
      window.removeEventListener('liveBarUpdate', handleBarUpdate);
    };
  }, [symbol, updateLastBar, addNewBar]);
}