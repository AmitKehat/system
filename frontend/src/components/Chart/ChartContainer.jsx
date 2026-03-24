// src/components/Chart/ChartContainer.jsx
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChartStore, INDICATOR_DEFS } from '../../store/chartStore';
import { useStatusStore } from '../../store/statusStore';
import { useSimulatorStore } from '../../store/simulatorStore';
import { fetchHistBars } from '../../lib/api';
import { calculateIndicator } from '../../lib/indicators';
import OverlayLegend from '../Indicators/OverlayLegend';
import StrategyTesterPane from './StrategyTesterPane';

function getChartOptions(theme, showTimeScale) {
  const isDark = theme === 'dark';
  return {
    layout: {
      background: { type: 'solid', color: isDark ? '#131722' : '#ffffff' },
      textColor: isDark ? '#d1d4dc' : '#131722'
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
      horzLines: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }
    },
    rightPriceScale: {
      borderVisible: true,
      borderColor: isDark ? '#2a2e39' : '#e0e3eb',
      width: 60
    },
    leftPriceScale: {
      visible: false
    },
    timeScale: {
      visible: showTimeScale,
      borderVisible: true,
      borderColor: isDark ? '#2a2e39' : '#e0e3eb',
      timeVisible: true,
      secondsVisible: false,
      barSpacing: 6,
      rightOffset: 12,
    },
    crosshair: {
      mode: 0,
      vertLine: {
        visible: false,
        labelVisible: false
      },
      horzLine: {
        color: isDark ? '#758696' : '#9598a1',
        width: 1,
        style: 2,
        labelBackgroundColor: isDark ? '#2a2e39' : '#f0f3fa',
        labelVisible: true
      }
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true
    }
  };
}

function formatTimeLabel(time) {
  if (time === null || time === undefined) return null;
  
  let date;
  if (typeof time === 'number') {
    date = new Date(time * 1000);
  } else if (typeof time === 'object' && time.year) {
    date = new Date(Date.UTC(time.year, time.month - 1, time.day));
  } else if (typeof time === 'string') {
    return time; 
  } else {
    return null;
  }
  const day = date.getUTCDate();
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

function barSizeToSeconds(barSize) {
  if (!barSize) return 60;
  const match = String(barSize).match(/(\d+)\s*(secs?|mins?|hours?|days?|weeks?|months?)/i);
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

function formatCountdown(diff) {
    if (diff <= 0) return "00:00";
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = Math.floor(diff % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const RESIZER_HEIGHT = 6;
const MIN_PANE_HEIGHT = 80;
const MIN_MAIN_HEIGHT = 150;
const BOTTOM_BAR_HEIGHT = 36;

export default function ChartContainer() {
  const {
    symbol,
    barSize,
    duration,
    useRTH,
    lastReload,
    bars,
    indicators = [], 
    theme,
    toggleIndicatorVisibility,
    openSettings,
    removeIndicator
  } = useChartStore();
  
  const marketSession = useStatusStore((s) => s.marketStatus?.session || 'open');
  
  const simResults = useSimulatorStore((s) => s.results);
  const simMode = useSimulatorStore((s) => s.mode);
  const selectedTradeIndex = useSimulatorStore((s) => s.selectedTradeIndex);
  const clearSelectedTrade = useSimulatorStore((s) => s.clearSelectedTrade);
  const hasSimResults = !!(simResults && simResults.equity_curve && simResults.equity_curve.length > 0);

  // Blinking state for selected trade marker
  const blinkStateRef = useRef(false);
  const blinkIntervalRef = useRef(null);

  // Get all strategy indicators for trade markers
  const strategyIndicators = useMemo(() => {
    return (indicators || []).filter(i => i.type === 'strategy');
  }, [indicators]);
  
  const [showSimPane, setShowSimPane] = useState(() => {
    return localStorage.getItem('optibiz_showSimPane') === 'true';
  });
  
  const [simPaneHeight, setSimPaneHeight] = useState(() => {
    const saved = localStorage.getItem('optibiz_simPaneHeight');
    return saved ? parseInt(saved, 10) : 300;
  });

  useEffect(() => {
    localStorage.setItem('optibiz_showSimPane', showSimPane);
  }, [showSimPane]);

  useEffect(() => {
    localStorage.setItem('optibiz_simPaneHeight', simPaneHeight);
  }, [simPaneHeight]);

  useEffect(() => {
      if (hasSimResults) {
          setShowSimPane(true);
      }
  }, [hasSimResults]);

  const simPaneActualHeight = showSimPane ? simPaneHeight : 0;
  const simPaneResizerOffset = showSimPane ? RESIZER_HEIGHT : 0;
  const totalBottomOffset = BOTTOM_BAR_HEIGHT + simPaneActualHeight + simPaneResizerOffset;

  const containerRef = useRef(null);
  const mainContainerRef = useRef(null);
  const mainChartRef = useRef(null);
  const mainSeriesRef = useRef(new Map());
  const markersPluginRef = useRef(null);  // v5 markers plugin
  const indicatorChartsRef = useRef(new Map());
  const isSyncingRef = useRef(false);
  
  const lastBarTimeRef = useRef(null);
  const lastHistoricalTimeRef = useRef(null);
  const mainPriceLineRef = useRef(new Map()); 
  
  const countdownRef = useRef(null);
  const crosshairLineRef = useRef(null);
  const crosshairLabelRef = useRef(null);
  
  const chartStateRef = useRef({ symbol: null, barSize: null, duration: null, useRTH: null, indHash: null, firstBarTime: null, barsLength: 0, lastHistTime: null });

  const unfilteredChartBars = useMemo(() => {
    if (!bars || !Array.isArray(bars)) return [];
    const validBars = bars.filter(b => b.open !== null && !isNaN(b.open) && b.close !== null && !isNaN(b.close));
    const uniqueMap = new Map();
    for (const b of validBars) {
        uniqueMap.set(b.time, b);
    }
    return Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);
  }, [bars]);

  const displayBars = useMemo(() => {
    const isExtended = marketSession === 'pre-market' || marketSession === 'post-market';
    if (useRTH && isExtended && lastHistoricalTimeRef.current) {
      return unfilteredChartBars.filter(b => b.time <= lastHistoricalTimeRef.current);
    }
    return unfilteredChartBars;
  }, [unfilteredChartBars, useRTH, marketSession]);

  const overlayIndicators = useMemo(() => (indicators || []).filter((i) => i.overlay), [indicators]);
  const separateIndicators = useMemo(() => (indicators || []).filter((i) => !i.overlay), [indicators]);
  const hasIndicatorPanes = separateIndicators.length > 0;

  const [indicatorsTotalHeight, setIndicatorsTotalHeight] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [mainChartReady, setMainChartReady] = useState(false);

  const [paneHeights, setPaneHeights] = useState(() => {
    try {
      const saved = localStorage.getItem('optibiz_paneHeights');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('optibiz_paneHeights', JSON.stringify(paneHeights));
  }, [paneHeights]);

  const isDark = theme === 'dark';
  const crosshairColor = isDark ? '#758696' : '#9598a1';

  useEffect(() => {
    let animationFrameId;
    
    const updateCountdown = () => {
      if (!countdownRef.current) {
        animationFrameId = requestAnimationFrame(updateCountdown);
        return;
      }
      
      const currentBarSize = useChartStore.getState().barSize;
      const session = useStatusStore.getState().marketStatus?.session || 'open';
    
      if (session !== 'open' || !displayBars || displayBars.length === 0 || !mainChartRef.current || !mainSeriesRef.current.has('candles')) {
        countdownRef.current.style.opacity = '0';
        countdownRef.current.style.top = '-100px';
        animationFrameId = requestAnimationFrame(updateCountdown);
        return;
      }
      
      const lastBar = displayBars[displayBars.length - 1];
      const barSizeSeconds = barSizeToSeconds(currentBarSize);
      const isMainUp = lastBar.close >= lastBar.open;
   
      const closesAt = lastBar.time + barSizeSeconds;
      const now = Math.floor(Date.now() / 1000);
      const diff = closesAt - now;
      
      const series = mainSeriesRef.current.get('candles');
      const mainY = series.priceToCoordinate(lastBar.close);
      const mainHeight = mainContainerRef.current?.clientHeight || 0;
      
      if (mainY !== null && mainY >= 0 && mainY <= mainHeight) {
        countdownRef.current.style.opacity = '1';
        countdownRef.current.style.top = `${mainY + 11}px`;
        countdownRef.current.style.backgroundColor = isMainUp ? '#089981' : '#f23645';
        countdownRef.current.innerText = diff >= 0 ? formatCountdown(diff) : "00:00";
      } else {
        countdownRef.current.style.opacity = '0';
      }
      
      animationFrameId = requestAnimationFrame(updateCountdown);
    };

    animationFrameId = requestAnimationFrame(updateCountdown);
    return () => cancelAnimationFrame(animationFrameId);
  }, [displayBars]); 

  const updateCrosshairLine = useCallback((x, timeLabel) => {
    if (crosshairLineRef.current && crosshairLabelRef.current) {
      if (x !== null && x !== undefined && timeLabel) {
        crosshairLineRef.current.style.display = 'block';
        crosshairLineRef.current.style.left = `${x}px`;
        
        crosshairLabelRef.current.style.display = 'block';
        crosshairLabelRef.current.style.left = `${x}px`;
        crosshairLabelRef.current.innerText = timeLabel;
      } else {
        crosshairLineRef.current.style.display = 'none';
        crosshairLabelRef.current.style.display = 'none';
      }
    }
  }, []);

  const hideCrosshairLine = useCallback(() => {
    if (crosshairLineRef.current && crosshairLabelRef.current) {
      crosshairLineRef.current.style.display = 'none';
      crosshairLabelRef.current.style.display = 'none';
    }
  }, []);

  const syncIndicatorChartsFromMain = useCallback((logicalRange) => {
    if (!logicalRange || isSyncingRef.current) return;
    isSyncingRef.current = true;
    indicatorChartsRef.current.forEach((chart) => {
      try { chart.timeScale().setVisibleLogicalRange(logicalRange); } catch (e) {}
    });
    setTimeout(() => { isSyncingRef.current = false; }, 0);
  }, []);

  const syncMainChartFromIndicator = useCallback((logicalRange) => {
    if (!logicalRange || !mainChartRef.current || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      mainChartRef.current.timeScale().setVisibleLogicalRange(logicalRange);
      indicatorChartsRef.current.forEach((chart) => {
        try { chart.timeScale().setVisibleLogicalRange(logicalRange); } catch (e) {}
      });
    } catch (e) {}
    setTimeout(() => { isSyncingRef.current = false; }, 0);
  }, []);

  const registerIndicatorChart = useCallback((id, chart) => { indicatorChartsRef.current.set(id, chart); }, []);
  const unregisterIndicatorChart = useCallback((id) => { indicatorChartsRef.current.delete(id); }, []);

  useEffect(() => {
    if (separateIndicators.length === 0) {
      setIndicatorsTotalHeight(0);
      return;
    }
    
    setPaneHeights(prev => {
      const newHeights = { ...prev };
      let changed = false;
      separateIndicators.forEach(ind => {
        if (newHeights[ind.id] === undefined) {
          newHeights[ind.id] = 150;
          changed = true;
        }
      });
      Object.keys(newHeights).forEach(key => {
        if (!separateIndicators.find(ind => ind.id === key)) {
          delete newHeights[key];
          changed = true;
        }
      });
      return changed ? newHeights : prev;
    });
  }, [separateIndicators]);

  useEffect(() => {
    const total = separateIndicators.reduce((sum, ind) => sum + (paneHeights[ind.id] || 150) + RESIZER_HEIGHT, 0);
    setIndicatorsTotalHeight(total);
  }, [paneHeights, separateIndicators]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!symbol) return;

      const store = useChartStore.getState();
      store.setLoading(true);
      store.setError(null);

      try {
        const fetchedBars = await fetchHistBars({
          symbol, bar_size: barSize, duration, useRTH: useRTH ? 1 : 0
        });

        if (!cancelled) {
          if (fetchedBars && fetchedBars.length > 0) {
            lastHistoricalTimeRef.current = fetchedBars[fetchedBars.length - 1].time;
          }
          store.setBars(fetchedBars);
        }
      } catch (err) {
        if (!cancelled) {
          store.setError(err.message || 'Failed to load data');
          store.setBars([]);
        }
      } finally {
        if (!cancelled) {
          store.setLoading(false);
        }
      }
    };

    const debounce = setTimeout(loadData, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [symbol, barSize, duration, useRTH, lastReload]);

  useEffect(() => {
    if (!mainContainerRef.current) return;
    
    const showTimeScaleOnMain = !hasIndicatorPanes; 
    const chart = createChart(mainContainerRef.current, {
      ...getChartOptions(theme, showTimeScaleOnMain),
      width: mainContainerRef.current.clientWidth || 800,
      height: mainContainerRef.current.clientHeight || 400
    });

    mainChartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.point) {
        hideCrosshairLine();
        return;
      }
   
      const timeLabel = formatTimeLabel(param.time);
      updateCrosshairLine(param.point.x, timeLabel);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      syncIndicatorChartsFromMain(logicalRange);
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (isResizing) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0 && mainChartRef.current) {
        mainChartRef.current.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(mainContainerRef.current);

    setMainChartReady(true);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      mainChartRef.current = null;
      mainSeriesRef.current.clear();
      mainPriceLineRef.current.clear();
      markersPluginRef.current = null;
      setMainChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mainChartRef.current) return;
    const showTimeScaleOnMain = !hasIndicatorPanes; 
    mainChartRef.current.applyOptions(getChartOptions(theme, showTimeScaleOnMain));
  }, [theme, hasIndicatorPanes]);

  useEffect(() => {
    if (!isResizing && mainChartRef.current && mainContainerRef.current) {
      requestAnimationFrame(() => {
        if (!mainContainerRef.current || !mainChartRef.current) return;
        const rect = mainContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          mainChartRef.current.applyOptions({ width: rect.width, height: rect.height });
        }
      });
    }
  }, [isResizing, indicatorsTotalHeight, totalBottomOffset]);

  useEffect(() => {
    if (mainChartRef.current) {
      mainChartRef.current.applyOptions({
        timeScale: { visible: !hasIndicatorPanes }
      });
    }
  }, [hasIndicatorPanes]);

  useEffect(() => {
    if (!mainChartRef.current) return;

    const chart = mainChartRef.current;

    if (!mainSeriesRef.current.has('candles')) {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#089981', downColor: '#f23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645', lastValueVisible: false
      });
      mainSeriesRef.current.set('candles', series);

      // Create v5 markers plugin for this series
      markersPluginRef.current = createSeriesMarkers(series, []);
      console.log('[MARKERS] Created markers plugin for candles series');
    }

    // EXPLICITLY CLEAR THE CHART IF THERE IS NO DATA YET
    if (!displayBars || displayBars.length === 0) {
        mainSeriesRef.current.get('candles').setData([]);
        if (mainSeriesRef.current.has('volume')) {
            mainSeriesRef.current.get('volume').setData([]);
        }
        overlayIndicators.forEach((ind) => {
            if (ind.type === 'volume' || ind.type === 'strategy') return;
            if (mainSeriesRef.current.has(ind.id)) {
                mainSeriesRef.current.get(ind.id).setData([]);
            }
        });
        // Clear markers using v5 plugin API
        if (markersPluginRef.current) {
            try { markersPluginRef.current.setMarkers([]); } catch(e) {}
        }
        chartStateRef.current.barsLength = 0;
        return;
    }

    const indHash = JSON.stringify(indicators);
    const firstBarTime = displayBars[0].time;
    const lengthDiff = Math.abs(displayBars.length - chartStateRef.current.barsLength);
    const isNewSymbol = chartStateRef.current.symbol !== symbol;
    const isNewParams = chartStateRef.current.barSize !== barSize || chartStateRef.current.duration !== duration || chartStateRef.current.useRTH !== useRTH;
    
    const isInitialLoad = chartStateRef.current.barsLength <= 1; 
    const isDataPrepend = !isNewSymbol && !isNewParams && !isInitialLoad && chartStateRef.current.firstBarTime !== firstBarTime;
    const isDataShrink = displayBars.length < chartStateRef.current.barsLength; 
    const isHistChange = chartStateRef.current.lastHistTime !== lastHistoricalTimeRef.current;
    
    const isMainDataChange = isNewSymbol || isNewParams || isInitialLoad || isDataPrepend || isDataShrink || isHistChange || lengthDiff > 1;
    const isIndChange = chartStateRef.current.indHash !== indHash;

    if (isMainDataChange) {
      let targetScrollTime = null;
      let savedLogicalRange = null;
      let wasAtRightEdge = true;

      if (!isNewSymbol && !isNewParams && !isInitialLoad) {
          try {
              const scrollPos = chart.timeScale().scrollPosition();
              wasAtRightEdge = scrollPos > -5;
              savedLogicalRange = chart.timeScale().getVisibleLogicalRange();

              if (!wasAtRightEdge && savedLogicalRange) {
                  const centerLogical = (savedLogicalRange.from + savedLogicalRange.to) / 2;
                  const validIdx = Math.max(0, Math.min(displayBars.length - 1, Math.floor(centerLogical)));
                  if (displayBars[validIdx]) targetScrollTime = displayBars[validIdx].time;
              }
          } catch(e) {}
      }

      mainSeriesRef.current.get('candles').setData(displayBars);
      
      const volumeInd = indicators.find((i) => i.type === 'volume');
      if (volumeInd) {
        if (!mainSeriesRef.current.has('volume')) {
          const series = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
          chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
          mainSeriesRef.current.set('volume', series);
        }
        const volumeData = displayBars.map((bar) => ({
          time: bar.time, value: bar.volume, color: bar.close >= bar.open ? 'rgba(8,153,129,0.5)' : 'rgba(242,54,69,0.5)'
        }));
        mainSeriesRef.current.get('volume').setData(volumeData);
      } else if (mainSeriesRef.current.has('volume')) {
        try { chart.removeSeries(mainSeriesRef.current.get('volume')); } catch(e) {}
        mainSeriesRef.current.delete('volume');
      }

      if (isNewSymbol || isNewParams || isInitialLoad) {
         setTimeout(() => {
             try { chart.timeScale().fitContent(); } catch(e) {}
         }, 100);
      } else {
         if (wasAtRightEdge && !isDataPrepend) {
             chart.timeScale().scrollToRealTime();
         } else if (targetScrollTime !== null) {
             const newIdx = displayBars.findIndex(b => b.time >= targetScrollTime);
             if (newIdx !== -1) {
                 const barsFromRight = newIdx - (displayBars.length - 1);
                 chart.timeScale().scrollToPosition(barsFromRight, false); 
             }
         } else if (savedLogicalRange) {
             chart.timeScale().setVisibleLogicalRange(savedLogicalRange);
         }
      }
    }

    if (isMainDataChange || isIndChange) {
      const activeOverlayIds = new Set(overlayIndicators.map(i => i.id));
      for (const [key, series] of mainSeriesRef.current.entries()) {
        if (key !== 'candles' && key !== 'volume' && !activeOverlayIds.has(key)) {
          try { chart.removeSeries(series); } catch (e) {}
          mainSeriesRef.current.delete(key);
        }
      }
      
      const closes = displayBars.map((b) => b.close);
      const highs = displayBars.map((b) => b.high);
      const lows = displayBars.map((b) => b.low);
      const volumes = displayBars.map((b) => b.volume);
      const times = displayBars.map((b) => b.time);
      
      overlayIndicators.forEach((ind) => {
        if (ind.type === 'volume' || ind.type === 'strategy') return;
        const color = ind.params?.color || '#2962FF';
        const result = calculateIndicator(ind.type, { closes, highs, lows, volumes, times }, ind.params);
        if (result && result.data) {
          if (!mainSeriesRef.current.has(ind.id)) {
            const series = chart.addSeries(LineSeries, { color: color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
            mainSeriesRef.current.set(ind.id, series);
          }
          mainSeriesRef.current.get(ind.id).setData(result.data);
          mainSeriesRef.current.get(ind.id).applyOptions({ visible: ind.visible !== false });
        }
      });
    }

    chartStateRef.current = { symbol, barSize, duration, useRTH, indHash, firstBarTime, barsLength: displayBars.length, lastHistTime: lastHistoricalTimeRef.current };
  }, [displayBars, indicators, useRTH, symbol, barSize, duration, overlayIndicators]);

  // --- STRATEGY OVERLAY INDICATORS (EMA, SMA, etc. from strategies) ---
  useEffect(() => {
    if (!mainChartRef.current || !displayBars || displayBars.length === 0) return;

    const chart = mainChartRef.current;
    const closes = displayBars.map((b) => b.close);
    const highs = displayBars.map((b) => b.high);
    const lows = displayBars.map((b) => b.low);
    const volumes = displayBars.map((b) => b.volume);
    const times = displayBars.map((b) => b.time);

    // Collect all active strategy overlay series keys
    const activeStrategyOverlayKeys = new Set();

    // Render overlay indicators from each visible strategy
    for (const stratInd of strategyIndicators) {
      // Skip hidden strategies or strategies for different symbols
      if (stratInd.visible === false) continue;
      if (stratInd.symbol && stratInd.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
      if (!stratInd.overlayIndicators || stratInd.overlayIndicators.length === 0) continue;

      for (const ovInd of stratInd.overlayIndicators) {
        const seriesKey = `strategy-${stratInd.id}-${ovInd.type}-${ovInd.params?.period || 0}`;
        activeStrategyOverlayKeys.add(seriesKey);

        const color = ovInd.params?.color || '#2962FF';
        const result = calculateIndicator(ovInd.type, { closes, highs, lows, volumes, times }, ovInd.params);

        if (result && result.data) {
          if (!mainSeriesRef.current.has(seriesKey)) {
            const series = chart.addSeries(LineSeries, {
              color: color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false
            });
            mainSeriesRef.current.set(seriesKey, series);
            console.log(`[STRATEGY OVERLAY] Created series for ${seriesKey}`);
          }
          mainSeriesRef.current.get(seriesKey).setData(result.data);
          mainSeriesRef.current.get(seriesKey).applyOptions({ visible: true, color });
        }
      }
    }

    // Remove stale strategy overlay series
    for (const [key, series] of mainSeriesRef.current.entries()) {
      if (key.startsWith('strategy-') && !activeStrategyOverlayKeys.has(key)) {
        try { chart.removeSeries(series); } catch (e) {}
        mainSeriesRef.current.delete(key);
        console.log(`[STRATEGY OVERLAY] Removed stale series: ${key}`);
      }
    }
  }, [strategyIndicators, displayBars, symbol]);

  // --- TRADES/MARKERS LOGIC (RENDERS FROM ALL VISIBLE STRATEGY INDICATORS) ---
  // Get selected trade's entry/exit times for highlighting
  const selectedTradeTimes = useMemo(() => {
      if (selectedTradeIndex === null || !simResults?.trades_detailed) return null;
      const trade = simResults.trades_detailed[selectedTradeIndex];
      if (!trade) return null;
      return {
          entryTime: trade.entry_time,
          exitTime: trade.exit_time
      };
  }, [selectedTradeIndex, simResults]);

  // Blinking effect for selected trade
  useEffect(() => {
      // Clear any existing interval
      if (blinkIntervalRef.current) {
          clearInterval(blinkIntervalRef.current);
          blinkIntervalRef.current = null;
      }

      if (selectedTradeIndex === null || !selectedTradeTimes) {
          blinkStateRef.current = false;
          return;
      }

      // Start blinking
      blinkStateRef.current = true;
      let blinkCount = 0;
      const maxBlinks = 10; // Blink 5 times (on/off = 2 counts per blink)

      blinkIntervalRef.current = setInterval(() => {
          blinkStateRef.current = !blinkStateRef.current;
          blinkCount++;

          // Force re-render of markers
          if (markersPluginRef.current && mainSeriesRef.current.has('candles')) {
              updateMarkersWithHighlight();
          }

          // Stop blinking after maxBlinks
          if (blinkCount >= maxBlinks) {
              clearInterval(blinkIntervalRef.current);
              blinkIntervalRef.current = null;
              blinkStateRef.current = true; // Keep highlighted
          }
      }, 300);

      return () => {
          if (blinkIntervalRef.current) {
              clearInterval(blinkIntervalRef.current);
              blinkIntervalRef.current = null;
          }
      };
  }, [selectedTradeIndex, selectedTradeTimes]);

  // Function to update markers with highlight
  const updateMarkersWithHighlight = useCallback(() => {
      if (!mainChartRef.current || !mainSeriesRef.current.has('candles')) return;
      if (!markersPluginRef.current) return;

      const allMarkers = [];

      for (const stratInd of strategyIndicators) {
          if (stratInd.visible === false) continue;
          if (stratInd.symbol && stratInd.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
          if (!stratInd.trades || !Array.isArray(stratInd.trades) || stratInd.trades.length === 0) continue;
          if (displayBars.length === 0) continue;

          const barTimes = displayBars.map(b => b.time);
          const barTimeSet = new Set(barTimes);

          const getClosestTime = (targetTs) => {
              if (barTimeSet.has(targetTs)) return targetTs;
              let closest = barTimes[0];
              let minDiff = Math.abs(targetTs - closest);
              for (let i = 1; i < barTimes.length; i++) {
                  const diff = Math.abs(targetTs - barTimes[i]);
                  if (diff < minDiff) {
                      minDiff = diff;
                      closest = barTimes[i];
                  }
              }
              return minDiff < 86400 * 7 ? closest : null;
          };

          const rawMarkers = stratInd.trades.map(t => {
              const snappedTime = getClosestTime(t.time);
              if (snappedTime === null) return null;

              const isEntry = t.type !== 'Exit';
              const isOpenPosition = t.open === true;

              // Check if this marker belongs to the selected trade
              const isSelectedEntry = selectedTradeTimes &&
                  Math.abs(t.time - selectedTradeTimes.entryTime) < 86400;
              const isSelectedExit = selectedTradeTimes && selectedTradeTimes.exitTime &&
                  Math.abs(t.time - selectedTradeTimes.exitTime) < 86400;
              const isSelected = isSelectedEntry || isSelectedExit;

              // Determine marker appearance based on selection and blink state
              let markerColor = isOpenPosition ? '#ff9800' : (isEntry ? '#089981' : '#f23645');
              let markerSize = 1;

              if (isSelected) {
                  // Make selected marker larger and use highlight color when blinking
                  markerSize = blinkStateRef.current ? 3 : 1.5;
                  if (blinkStateRef.current) {
                      markerColor = '#ffeb3b'; // Yellow highlight when blinking "on"
                  }
              }

              return {
                  time: snappedTime,
                  position: isEntry ? 'belowBar' : 'aboveBar',
                  color: markerColor,
                  shape: isEntry ? 'arrowUp' : 'arrowDown',
                  size: markerSize,
                  text: isOpenPosition
                      ? `${t.type} ${t.size} (OPEN)`
                      : (isEntry ? `${t.type} ${t.size}` : `Exit ${t.size} (${t.pnl > 0 ? '+' : ''}${t.pnl?.toFixed(2)})`)
              };
          }).filter(m => m !== null);

          allMarkers.push(...rawMarkers);
      }

      const validMarkers = allMarkers.filter(m => m.time != null && !isNaN(m.time));
      validMarkers.sort((a, b) => a.time - b.time);

      const uniqueMarkers = [];
      const timeSet = new Set();
      for (const m of validMarkers) {
          if (!timeSet.has(m.time)) {
              uniqueMarkers.push(m);
              timeSet.add(m.time);
          } else {
              const existing = uniqueMarkers.find(um => um.time === m.time);
              if (existing) {
                  existing.text += ` & ${m.text}`;
                  // If any marker at this time is selected, keep the highlight
                  if (m.size > existing.size) {
                      existing.size = m.size;
                      existing.color = m.color;
                  }
              }
          }
      }

      try {
          markersPluginRef.current.setMarkers(uniqueMarkers);
      } catch (e) {
          console.error('[MARKERS] Error setting markers:', e);
      }
  }, [strategyIndicators, displayBars, symbol, selectedTradeTimes]);

  useEffect(() => {
      if (!mainChartRef.current || !mainSeriesRef.current.has('candles')) {
          return;
      }

      // Use the updateMarkersWithHighlight function for initial render and updates
      updateMarkersWithHighlight();

      // Single summary log
      if (strategyIndicators.some(s => s.trades?.length > 0)) {
          console.log(`[MARKERS] Updated markers for ${symbol}`);
      }
  }, [strategyIndicators, displayBars, symbol, barSize, selectedTradeIndex, updateMarkersWithHighlight]);

  useEffect(() => {
    if (!mainChartRef.current) return;
    const candleSeries = mainSeriesRef.current.get('candles');
    if (!candleSeries) return;
    
    // EXPLICITLY CLEAR THE OLD PRICE LINES IF THERE IS NO DATA
    if (!unfilteredChartBars || unfilteredChartBars.length === 0) {
        if (mainPriceLineRef.current.has('main')) {
            candleSeries.removePriceLine(mainPriceLineRef.current.get('main'));
            mainPriceLineRef.current.delete('main');
        }
        if (mainPriceLineRef.current.has('ext')) {
            candleSeries.removePriceLine(mainPriceLineRef.current.get('ext'));
            mainPriceLineRef.current.delete('ext');
        }
        lastBarTimeRef.current = null;
        return;
    }
    
    const lastBar = unfilteredChartBars[unfilteredChartBars.length - 1]; 
    if (lastBar.open === null || isNaN(lastBar.open)) return;
    if (lastBarTimeRef.current === null) lastBarTimeRef.current = lastBar.time;
    
    try {
      const session = useStatusStore.getState().marketStatus?.session || 'open';
      const isExtended = session === 'pre-market' || session === 'post-market';
   
      const shouldShowExtLines = isExtended && useRTH;
      
      let mainPrice = lastBar.close; 
      let mainColor = lastBar.close >= lastBar.open ? '#089981' : '#f23645';

      if (shouldShowExtLines && lastHistoricalTimeRef.current) {
         const rthBars = displayBars.filter(b => b.time <= lastHistoricalTimeRef.current);
         if (rthBars.length > 0) {
          const rthLast = rthBars[rthBars.length - 1];
          mainPrice = rthLast.close;
          mainColor = rthLast.close >= rthLast.open ? '#089981' : '#f23645';
        }
      }

      if (!mainPriceLineRef.current.has('main')) {
        const line = candleSeries.createPriceLine({
          price: mainPrice, color: mainColor, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: symbol, 
        });
        mainPriceLineRef.current.set('main', line);
      } else {
        mainPriceLineRef.current.get('main').applyOptions({ price: mainPrice, color: mainColor, title: symbol });
      }

      if (shouldShowExtLines) {
        const extColor = session === 'pre-market' ? '#ff9800' : '#2196f3';
        const extTitle = session === 'pre-market' ? 'PRE' : 'POST';
        
        if (!mainPriceLineRef.current.has('ext')) {
          const line = candleSeries.createPriceLine({
            price: lastBar.close, color: extColor, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: extTitle, 
          });
          mainPriceLineRef.current.set('ext', line);
        } else {
          mainPriceLineRef.current.get('ext').applyOptions({ price: lastBar.close, color: extColor, title: extTitle });
        }
        lastBarTimeRef.current = lastBar.time;
      } else {
        if (mainPriceLineRef.current.has('ext')) {
          candleSeries.removePriceLine(mainPriceLineRef.current.get('ext'));
          mainPriceLineRef.current.delete('ext');
        }
        
        try {
            candleSeries.update(lastBar);
            const volumeSeries = mainSeriesRef.current.get('volume');
            if (volumeSeries && lastBar.volume !== null) {
              volumeSeries.update({
                time: lastBar.time, value: lastBar.volume, color: lastBar.close >= lastBar.open ? 'rgba(8,153,129,0.5)' : 'rgba(242,54,69,0.5)'
              });
            }
        } catch (updateError) {}
        lastBarTimeRef.current = lastBar.time;
      }
    } catch (e) {}
  }, [unfilteredChartBars, displayBars, useRTH, symbol]);

  const handleResizeStart = useCallback((e, indicatorId) => {
    e.preventDefault(); e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = paneHeights[indicatorId] || 150;
    const containerHeight = containerRef.current?.clientHeight || 600;

    const otherIndicatorsHeight = separateIndicators.filter(ind => ind.id !== indicatorId).reduce((sum, ind) => sum + (paneHeights[ind.id] || 150) + RESIZER_HEIGHT, 0);
    const maxHeight = containerHeight - MIN_MAIN_HEIGHT - otherIndicatorsHeight - RESIZER_HEIGHT - totalBottomOffset;

    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaY = startY - moveEvent.clientY;
      const newHeight = Math.max(MIN_PANE_HEIGHT, Math.min(maxHeight, startHeight + deltaY));
      setPaneHeights(prev => ({ ...prev, [indicatorId]: newHeight }));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [paneHeights, separateIndicators, totalBottomOffset]);

  const handleSimPaneResizeStart = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = simPaneHeight;
    const containerHeight = containerRef.current?.clientHeight || 600;

    const otherIndicatorsHeight = separateIndicators.reduce((sum, ind) => sum + (paneHeights[ind.id] || 150) + RESIZER_HEIGHT, 0);
    const maxHeight = containerHeight - MIN_MAIN_HEIGHT - otherIndicatorsHeight - BOTTOM_BAR_HEIGHT - RESIZER_HEIGHT;

    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const deltaY = startY - moveEvent.clientY;
 
      const newHeight = Math.max(MIN_PANE_HEIGHT, Math.min(maxHeight, startHeight + deltaY));
      setSimPaneHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [simPaneHeight, separateIndicators, paneHeights]);

  const getIndicatorTitle = (ind) => {
    const def = INDICATOR_DEFS.find((d) => d.type === ind.type);
    const params = ind.params || {};
    switch (ind.type) {
      case 'rsi': case 'atr': case 'cci': case 'adx': return `${def?.name || ind.type} (${params.period || 14})`;
      case 'macd': return `MACD (${params.fast || 12}, ${params.slow || 26}, ${params.signal || 9})`;
      case 'stoch': return `Stoch (${params.kPeriod || 14}, ${params.dPeriod || 3})`;
      case 'obv': return 'OBV';
      default: return def?.name || ind.type;
    }
  };

  const getIndicatorBottomPosition = (index) => {
    let bottom = totalBottomOffset;
    for (let i = separateIndicators.length - 1; i > index; i--) {
      bottom += (paneHeights[separateIndicators[i].id] || 150) + RESIZER_HEIGHT;
    }
    return bottom;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onMouseLeave={hideCrosshairLine}>
      <div ref={crosshairLineRef} style={{ position: 'absolute', display: 'none', top: 0, bottom: `${totalBottomOffset}px`, width: 1, backgroundColor: crosshairColor, pointerEvents: 'none', zIndex: 100 }} />
      <div ref={crosshairLabelRef} style={{ position: 'absolute', display: 'none', bottom: `${totalBottomOffset}px`, transform: 'translateX(-50%)', backgroundColor: isDark ? '#2a2e39' : '#f0f3fa', color: isDark ? '#d1d4dc' : '#131722', padding: '2px 6px', fontSize: '11px', borderRadius: '2px', pointerEvents: 'none', zIndex: 101, whiteSpace: 'nowrap' }} />
     
      <div ref={countdownRef} style={{ position: 'absolute', right: 0, top: '-100px', opacity: 0, width: '60px', color: '#ffffff', fontSize: '11px', fontWeight: '600', textAlign: 'center', padding: '3px 0', zIndex: 20, pointerEvents: 'none', boxSizing: 'border-box', transition: 'opacity 0.15s ease' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: `${indicatorsTotalHeight + totalBottomOffset}px`, minHeight: `${MIN_MAIN_HEIGHT}px` }}>
        <div ref={mainContainerRef} style={{ width: '100%', height: '100%' }} />
        <OverlayLegend indicators={overlayIndicators} />
      </div>

      {mainChartReady && separateIndicators.map((ind, idx) => {
        const height = paneHeights[ind.id] || 150;
        const bottomPosition = getIndicatorBottomPosition(idx);
        return (
          <React.Fragment key={ind.id}>
            <div onMouseDown={(e) => handleResizeStart(e, ind.id)} style={{ position: 'absolute', left: 0, right: 0, bottom: `${bottomPosition + height}px`, height: `${RESIZER_HEIGHT}px`, cursor: 'ns-resize', background: 'var(--tv-color-border, #2a2e39)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <div style={{ width: '40px', height: '3px', borderRadius: '2px', background: 'var(--tv-color-text-tertiary, #434651)' }} />
            </div>
       
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${bottomPosition}px`, height: `${height}px` }}>
              <IndicatorPane
                indicator={ind} bars={displayBars} theme={theme} title={getIndicatorTitle(ind)}
                isLast={idx === separateIndicators.length - 1} 
                lastHistTime={lastHistoricalTimeRef.current}
                onToggleVisibility={() => toggleIndicatorVisibility(ind.id)}
                onOpenSettings={() => openSettings(ind.id)}
                onRemove={() => removeIndicator(ind.id)}
                mainChart={mainChartRef.current} isResizing={isResizing} onCrosshairMove={updateCrosshairLine}
                registerChart={registerIndicatorChart} unregisterChart={unregisterIndicatorChart} syncMainChart={syncMainChartFromIndicator}
              />
            </div>
          </React.Fragment>
        );
      })}

      {/* --- DEDICATED STRATEGY TESTER PANE WITH RESIZER --- */}
      {showSimPane && (
        <React.Fragment>
          <div onMouseDown={handleSimPaneResizeStart} style={{ position: 'absolute', left: 0, right: 0, bottom: `${BOTTOM_BAR_HEIGHT + simPaneHeight}px`, height: `${RESIZER_HEIGHT}px`, cursor: 'ns-resize', background: 'var(--tv-color-border, #2a2e39)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12 }}>
            <div style={{ width: '40px', height: '3px', borderRadius: '2px', background: 'var(--tv-color-text-tertiary, #434651)' }} />
          </div>

          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${BOTTOM_BAR_HEIGHT}px`, height: `${simPaneHeight}px`, zIndex: 11, background: 'var(--tv-color-pane-background, #131722)', display: 'flex', flexDirection: 'column' }}>
            <StrategyTesterPane
              results={simResults}
              theme={theme}
              onClose={() => setShowSimPane(false)}
              mainChart={mainChartRef.current}
            />
          </div>
        </React.Fragment>
      )}

      {/* --- TRADINGVIEW STYLE BOTTOM BAR --- */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${BOTTOM_BAR_HEIGHT}px`, display: 'flex', alignItems: 'center', background: 'var(--tv-color-pane-background, #131722)', borderTop: '1px solid var(--tv-color-border, #2a2e39)', padding: '0 16px', zIndex: 15 }}>
         <button onClick={() => setShowSimPane(!showSimPane)} title="Strategy Tester" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: showSimPane ? 'var(--tv-color-border, rgba(41, 98, 255, 0.15))' : 'transparent', border: 'none', color: showSimPane ? '#2962ff' : 'var(--tv-color-text-secondary, #787b86)', cursor: 'pointer', height: '100%', padding: '0 16px', borderTop: showSimPane ? '2px solid #2962ff' : '2px solid transparent', transition: 'all 0.2s ease' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M9 3H15M10 3V8L3 19C2.4 19.9 3.1 21 4.2 21H19.8C20.9 21 21.6 19.9 21 19L14 8V3M10 14H14" />
            </svg>
         </button>
      </div>
    </div>
  );
}

function IndicatorPaneHeader({ title, indicator, onToggleVisibility, onOpenSettings, onRemove }) {
  const [isHovered, setIsHovered] = useState(false);
  const buttonStyle = { background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: 'var(--tv-color-popup-element-text, #d1d4dc)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', width: '24px', height: '24px' };
  const iconStyle = { width: '16px', height: '16px' };

  return (
    <div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} style={{ position: 'absolute', top: '8px', left: '12px', zIndex: 20, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: isHovered ? 'var(--tv-color-popup-background, #1e222d)' : 'transparent', transition: 'background 0.15s', pointerEvents: 'auto' }}>
      <span style={{ fontWeight: 500, color: '#2962FF', opacity: indicator.visible === false ? 0.5 : 1 }}>{title}</span>
      <div style={{ display: 'flex', gap: '2px', marginLeft: '4px', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleVisibility(); }} title={indicator.visible === false ? 'Show' : 'Hide'} style={buttonStyle}>
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {indicator.visible === false ? ( <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></> ) : ( <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></> )}
          </svg>
        </button>
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenSettings(); }} title="Settings" style={buttonStyle}>
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }} title="Remove" style={buttonStyle}>
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function IndicatorPane({ 
  indicator, bars, theme, title, isLast, onToggleVisibility, onOpenSettings, onRemove, mainChart, isResizing, onCrosshairMove, registerChart, unregisterChart, syncMainChart, lastHistTime 
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(new Map());
  const isSyncingRef = useRef(false);
  const isReadyToBroadcast = useRef(false);
  const indStateRef = useRef({ indHash: null, firstBarTime: null, barsLength: 0, lastHistTime: null });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const chart = createChart(containerRef.current, { 
      ...getChartOptions(theme, isLast), 
      width: containerRef.current.clientWidth || 800, 
      height: containerRef.current.clientHeight || 150
    });
    
    chartRef.current = chart;
    registerChart(indicator.id, chart);
    
    chart.subscribeCrosshairMove((param) => { 
      if (!param || !param.point) return; 
      const timeLabel = formatTimeLabel(param.time); 
      onCrosshairMove?.(param.point.x, timeLabel); 
    });
    
    const rangeChangeHandler = (logicalRange) => { 
      if (!logicalRange || isSyncingRef.current || !isReadyToBroadcast.current) return;
      syncMainChart(logicalRange); 
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeChangeHandler);
    
    const resizeObserver = new ResizeObserver((entries) => { 
      if (isResizing) return; 
      const { width, height } = entries[0].contentRect; 
      if (width > 0 && height > 0 && chartRef.current) {
        chartRef.current.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);
    
    return () => { 
      unregisterChart(indicator.id); 
      resizeObserver.disconnect(); 
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeChangeHandler);
      chart.remove();
      chartRef.current = null; 
      seriesRef.current.clear(); 
    };
  }, [indicator.id, registerChart, unregisterChart, syncMainChart, onCrosshairMove, theme, isLast]);

  useEffect(() => {
    if (!isResizing && chartRef.current && containerRef.current) {
      requestAnimationFrame(() => { 
        if (!containerRef.current || !chartRef.current) return; 
        const rect = containerRef.current.getBoundingClientRect(); 
        if (rect.width > 0 && rect.height > 0) {
          chartRef.current.applyOptions({ width: rect.width, height: rect.height }); 
        }
      });
    }
  }, [isResizing]);

  useEffect(() => {
    if (!chartRef.current || !bars || !Array.isArray(bars) || bars.length === 0) return;
    
    const chart = chartRef.current;
    const indHash = JSON.stringify(indicator.params);
    const firstBarTime = bars[0].time;
    const lengthDiff = Math.abs(bars.length - indStateRef.current.barsLength);
    
    const isDataShrink = bars.length < indStateRef.current.barsLength;
    const isHistChange = indStateRef.current.lastHistTime !== lastHistTime;
    const isNewSetup = indStateRef.current.indHash !== indHash || indStateRef.current.firstBarTime !== firstBarTime || isDataShrink || isHistChange || lengthDiff > 1;
    
    const closes = bars.map((b) => b.close); 
    const highs = bars.map((b) => b.high); 
    const lows = bars.map((b) => b.low); 
    const volumes = bars.map((b) => b.volume); 
    const times = bars.map((b) => b.time);
    
    const result = calculateIndicator(indicator.type, { closes, highs, lows, volumes, times }, indicator.params);

    if (!result) return;

    const visible = indicator.visible !== false;
    const isLiveTick = !isNewSetup && lengthDiff <= 1;
    let isNewSeries = false;

    if (indicator.type === 'macd' && result.histogram) {
      if (!seriesRef.current.has('hist')) {
        seriesRef.current.set('hist', chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }));
        seriesRef.current.set('macd', chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }));
        seriesRef.current.set('signal', chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }));
        isNewSeries = true;
      }
      if (isLiveTick && !isNewSeries && result.histogram.length > 0) {
         try { 
           seriesRef.current.get('hist').update(result.histogram[result.histogram.length - 1]);
           seriesRef.current.get('macd').update(result.macdLine[result.macdLine.length - 1]); 
           seriesRef.current.get('signal').update(result.signalLine[result.signalLine.length - 1]); 
         } catch(e) {}
      } else {
         seriesRef.current.get('hist').setData(result.histogram);
         seriesRef.current.get('macd').setData(result.macdLine); 
         seriesRef.current.get('signal').setData(result.signalLine);
      }
      seriesRef.current.forEach((s) => s.applyOptions({ visible }));
    } else if (indicator.type === 'stoch' && result.kLine) {
      if (!seriesRef.current.has('k')) {
        seriesRef.current.set('k', chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }));
        seriesRef.current.set('d', chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }));
        isNewSeries = true;
      }
      if (isLiveTick && !isNewSeries && result.kLine.length > 0) {
         try { 
           seriesRef.current.get('k').update(result.kLine[result.kLine.length - 1]);
           seriesRef.current.get('d').update(result.dLine[result.dLine.length - 1]); 
         } catch(e) {}
      } else {
         seriesRef.current.get('k').setData(result.kLine);
         seriesRef.current.get('d').setData(result.dLine);
      }
      seriesRef.current.forEach((s) => s.applyOptions({ visible }));
    } else if (result.data) {
      if (!seriesRef.current.has('main')) {
        seriesRef.current.set('main', chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }));
        isNewSeries = true;
      }
      if (isLiveTick && !isNewSeries && result.data.length > 0) {
         try { seriesRef.current.get('main').update(result.data[result.data.length - 1]);
         } catch(e) {}
      } else {
         seriesRef.current.get('main').setData(result.data);
      }
      seriesRef.current.get('main').applyOptions({ visible });
    }

    if ((isNewSetup || isNewSeries) && mainChart) {
      isReadyToBroadcast.current = false;
      setTimeout(() => {
        try {
          const logicalRange = mainChart.timeScale().getVisibleLogicalRange();
          if (logicalRange && chartRef.current) {
            chartRef.current.timeScale().setVisibleLogicalRange(logicalRange);
          } else {
              chartRef.current.timeScale().fitContent();
          }
        } catch(e) {}
        
        setTimeout(() => {
            isReadyToBroadcast.current = true;
        }, 50);
      }, 50); 
    } else {
        isReadyToBroadcast.current = true;
    }
    
    indStateRef.current = { indHash, firstBarTime, barsLength: bars.length, lastHistTime };
  }, [bars, indicator, mainChart, lastHistTime]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <IndicatorPaneHeader title={title} indicator={indicator} onToggleVisibility={onToggleVisibility} onOpenSettings={onOpenSettings} onRemove={onRemove} />
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}