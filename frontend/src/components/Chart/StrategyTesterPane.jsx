// src/components/Chart/StrategyTesterPane.jsx
import { createChart, LineSeries } from 'lightweight-charts';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSimulatorStore } from '../../store/simulatorStore';
import { useChartStore } from '../../store/chartStore';

function getChartOptions(theme) {
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
    timeScale: {
      visible: true,
      borderVisible: true,
      borderColor: isDark ? '#2a2e39' : '#e0e3eb',
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      mode: 1,
      vertLine: {
        visible: true,
        color: isDark ? '#758696' : '#9598a1',
        width: 1,
        style: 2,
        labelVisible: true,
        labelBackgroundColor: isDark ? '#2a2e39' : '#f0f3fa',
      },
      horzLine: {
        visible: true,
        color: isDark ? '#758696' : '#9598a1',
        width: 1,
        style: 2,
        labelVisible: true,
        labelBackgroundColor: isDark ? '#2a2e39' : '#f0f3fa',
      }
    }
  };
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatUSD(value) {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// --- Header Component ---
function StrategyHeader({ strategyName, results, onClose }) {
  const { dateRangeMode, setDateRangeMode, rerunStrategy, isProcessing, parameters } = useSimulatorStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [customStart, setCustomStart] = useState(results?.start_date || parameters.startDate);
  const [customEnd, setCustomEnd] = useState(results?.end_date || parameters.endDate);

  const dateOptions = [
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
    { label: 'Last 365 days', value: '365d' },
    { label: 'Custom range', value: 'custom' },
  ];

  const handleDateRangeChange = useCallback((value) => {
    setDateRangeMode(value);
    setShowDropdown(false);

    if (value === 'custom') return;

    const today = new Date();
    let startDate;

    switch (value) {
      case '7d':
        startDate = new Date(today.setDate(today.getDate() - 7));
        break;
      case '30d':
        startDate = new Date(today.setDate(today.getDate() - 30));
        break;
      case '90d':
        startDate = new Date(today.setDate(today.getDate() - 90));
        break;
      case '365d':
        startDate = new Date(today.setFullYear(today.getFullYear() - 1));
        break;
      default:
        return;
    }

    const endDateStr = new Date().toISOString().split('T')[0];
    const startDateStr = startDate.toISOString().split('T')[0];
    rerunStrategy(startDateStr, endDateStr);
  }, [setDateRangeMode, rerunStrategy]);

  const handleCustomRangeApply = useCallback(() => {
    if (customStart && customEnd) {
      rerunStrategy(customStart, customEnd);
      setShowDropdown(false);
    }
  }, [customStart, customEnd, rerunStrategy]);

  const currentLabel = useMemo(() => {
    if (results?.start_date && results?.end_date) {
      return `${results.start_date} — ${results.end_date}`;
    }
    return dateOptions.find(o => o.value === dateRangeMode)?.label || 'Select range';
  }, [dateRangeMode, results]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      borderBottom: '1px solid var(--tv-color-border, #2a2e39)',
      background: 'var(--tv-color-pane-background, #131722)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontWeight: 600, color: 'var(--tv-color-text-primary, #d1d4dc)', fontSize: '14px' }}>
          {strategyName || 'Strategy Tester'}
        </span>
        {isProcessing && (
          <span style={{ fontSize: '12px', color: '#2962ff' }}>Running...</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'var(--tv-color-toolbar-button-background, #2a2e39)',
              border: '1px solid var(--tv-color-border, #363a45)',
              borderRadius: '4px',
              color: 'var(--tv-color-text-primary, #d1d4dc)',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {currentLabel}
            <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            </svg>
          </button>

          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: 'var(--tv-color-popup-background, #1e222d)',
              border: '1px solid var(--tv-color-border, #363a45)',
              borderRadius: '4px',
              zIndex: 100,
              minWidth: '200px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}>
              {dateOptions.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => handleDateRangeChange(opt.value)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--tv-color-text-primary, #d1d4dc)',
                    background: dateRangeMode === opt.value ? 'rgba(41, 98, 255, 0.2)' : 'transparent'
                  }}
                  onMouseEnter={e => e.target.style.background = 'rgba(41, 98, 255, 0.1)'}
                  onMouseLeave={e => e.target.style.background = dateRangeMode === opt.value ? 'rgba(41, 98, 255, 0.2)' : 'transparent'}
                >
                  {opt.label}
                </div>
              ))}

              {dateRangeMode === 'custom' && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--tv-color-border, #363a45)' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px',
                        background: 'var(--tv-color-input-background, #131722)',
                        border: '1px solid var(--tv-color-border, #363a45)',
                        borderRadius: '4px',
                        color: 'var(--tv-color-text-primary, #d1d4dc)',
                        fontSize: '11px'
                      }}
                    />
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '4px',
                        background: 'var(--tv-color-input-background, #131722)',
                        border: '1px solid var(--tv-color-border, #363a45)',
                        borderRadius: '4px',
                        color: 'var(--tv-color-text-primary, #d1d4dc)',
                        fontSize: '11px'
                      }}
                    />
                  </div>
                  <button
                    onClick={handleCustomRangeApply}
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: '#2962ff',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--tv-color-text-secondary, #787b86)',
            cursor: 'pointer',
            padding: '4px',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// --- Tab Bar Component ---
function TabBar() {
  const { activeTab, setActiveTab } = useSimulatorStore();

  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      padding: '8px 16px',
      borderBottom: '1px solid var(--tv-color-border, #2a2e39)'
    }}>
      {['metrics', 'trades'].map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            padding: '6px 16px',
            background: activeTab === tab ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
            border: activeTab === tab ? '1px solid #2962ff' : '1px solid transparent',
            borderRadius: '4px',
            color: activeTab === tab ? '#2962ff' : 'var(--tv-color-text-secondary, #787b86)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            textTransform: 'capitalize'
          }}
        >
          {tab === 'metrics' ? 'Metrics' : 'List of Trades'}
        </button>
      ))}
    </div>
  );
}

// --- Metrics Panel Component ---
function MetricsPanel({ results }) {
  const isUp = results.return_pct >= 0;
  const pnlColor = isUp ? '#089981' : '#f23645';
  const maxDdPct = results.max_drawdown_pct || results.max_drawdown || 0;

  return (
    <div style={{
      display: 'flex',
      gap: '32px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--tv-color-border, #2a2e39)',
      overflowX: 'auto'
    }}>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)', marginBottom: '4px' }}>Total P&L</div>
        <div style={{ fontSize: '14px', color: pnlColor, fontWeight: 'bold' }}>
          {formatUSD(results.total_pnl_usd)}
        </div>
        <div style={{ fontSize: '12px', color: pnlColor }}>
          {formatPercent(results.return_pct)}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)', marginBottom: '4px' }}>Max Drawdown</div>
        <div style={{ fontSize: '14px', color: 'var(--tv-color-text-primary, #d1d4dc)', fontWeight: 'bold' }}>
          ${Math.abs(results.max_drawdown_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div style={{ fontSize: '12px', color: '#f23645' }}>
          {Math.abs(maxDdPct).toFixed(2)}%
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)', marginBottom: '4px' }}>Total Trades</div>
        <div style={{ fontSize: '14px', color: 'var(--tv-color-text-primary, #d1d4dc)', fontWeight: 'bold' }}>
          {results.total_trades || 0}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)', marginBottom: '4px' }}>Profitable</div>
        <div style={{ fontSize: '14px', color: 'var(--tv-color-text-primary, #d1d4dc)', fontWeight: 'bold' }}>
          {results.win_rate?.toFixed(1) || '0'}%
        </div>
        <div style={{ fontSize: '12px', color: 'var(--tv-color-text-secondary, #787b86)' }}>
          ({results.profitable_trades || 0}/{results.total_trades || 0})
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)', marginBottom: '4px' }}>Profit Factor</div>
        <div style={{ fontSize: '14px', color: 'var(--tv-color-text-primary, #d1d4dc)', fontWeight: 'bold' }}>
          {results.profit_factor ? results.profit_factor.toFixed(3) : 'N/A'}
        </div>
      </div>
    </div>
  );
}

// --- Trades Table Component ---
function TradesTable({ trades, onTradeClick }) {
  const { selectedTradeIndex } = useSimulatorStore();

  if (!trades || trades.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--tv-color-text-secondary, #787b86)' }}>
        No trades to display
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: 'var(--tv-color-toolbar-button-background, #1e222d)' }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Date/Time</th>
            <th style={thStyle}>Signal</th>
            <th style={thStyle}>Price</th>
            <th style={thStyle}>Position</th>
            <th style={thStyle}>Net P&L</th>
            <th style={thStyle}>MFE</th>
            <th style={thStyle}>MAE</th>
            <th style={thStyle}>Cumul. P&L</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, idx) => (
            <React.Fragment key={idx}>
              {/* Entry Row */}
              <tr
                onClick={() => onTradeClick(idx)}
                style={{
                  cursor: 'pointer',
                  background: selectedTradeIndex === idx ? 'rgba(41, 98, 255, 0.2)' : 'transparent'
                }}
                onMouseEnter={e => { if (selectedTradeIndex !== idx) e.currentTarget.style.background = 'rgba(41, 98, 255, 0.1)'; }}
                onMouseLeave={e => { if (selectedTradeIndex !== idx) e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={tdStyle}>{trade.trade_num}</td>
                <td style={tdStyle}>Entry</td>
                <td style={tdStyle}>{formatDateTime(trade.entry_time)}</td>
                <td style={{ ...tdStyle, color: trade.is_long ? '#089981' : '#f23645' }}>
                  {trade.is_long ? 'Long' : 'Short'}
                </td>
                <td style={tdStyle}>${trade.entry_price?.toFixed(2)}</td>
                <td style={tdStyle}>{trade.size} (${trade.position_value?.toLocaleString()})</td>
                <td style={tdStyle}>-</td>
                <td style={tdStyle}>-</td>
                <td style={tdStyle}>-</td>
                <td style={tdStyle}>-</td>
              </tr>
              {/* Exit Row */}
              <tr
                onClick={() => onTradeClick(idx)}
                style={{
                  cursor: 'pointer',
                  background: selectedTradeIndex === idx ? 'rgba(41, 98, 255, 0.15)' : 'transparent'
                }}
                onMouseEnter={e => { if (selectedTradeIndex !== idx) e.currentTarget.style.background = 'rgba(41, 98, 255, 0.08)'; }}
                onMouseLeave={e => { if (selectedTradeIndex !== idx) e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={tdStyle}></td>
                <td style={tdStyle}>Exit</td>
                <td style={tdStyle}>{formatDateTime(trade.exit_time)}</td>
                <td style={tdStyle}>Close {trade.is_long ? 'Long' : 'Short'}</td>
                <td style={tdStyle}>${trade.exit_price?.toFixed(2)}</td>
                <td style={tdStyle}>{trade.size} (${(trade.size * trade.exit_price)?.toLocaleString()})</td>
                <td style={{ ...tdStyle, color: trade.pnl_usd >= 0 ? '#089981' : '#f23645' }}>
                  {formatUSD(trade.pnl_usd)} ({formatPercent(trade.pnl_pct)})
                </td>
                <td style={{ ...tdStyle, color: '#089981' }}>
                  {formatUSD(trade.mfe_usd)} ({trade.mfe_pct?.toFixed(2)}%)
                </td>
                <td style={{ ...tdStyle, color: '#f23645' }}>
                  {formatUSD(trade.mae_usd)} ({trade.mae_pct?.toFixed(2)}%)
                </td>
                <td style={{ ...tdStyle, color: trade.cumulative_pnl_usd >= 0 ? '#089981' : '#f23645' }}>
                  {formatUSD(trade.cumulative_pnl_usd)} ({trade.cumulative_pnl_pct?.toFixed(2)}%)
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid var(--tv-color-border, #2a2e39)',
  color: 'var(--tv-color-text-secondary, #787b86)',
  fontWeight: 500,
  whiteSpace: 'nowrap'
};

const tdStyle = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--tv-color-border, #2a2e39)',
  color: 'var(--tv-color-text-primary, #d1d4dc)',
  whiteSpace: 'nowrap'
};

// --- Equity Chart Component ---
function EquityChart({ results, theme, onTradeClick }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const equitySeriesRef = useRef(null);
  const buyHoldSeriesRef = useRef(null);

  const { showBuyHoldComparison, toggleBuyHoldComparison, selectedTradeIndex } = useSimulatorStore();

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...getChartOptions(theme),
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    // Equity line
    equitySeriesRef.current = chart.addSeries(LineSeries, {
      color: '#2962ff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Buy & Hold line
    buyHoldSeriesRef.current = chart.addSeries(LineSeries, {
      color: '#787b86',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0 && chartRef.current) {
        chartRef.current.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      equitySeriesRef.current = null;
      buyHoldSeriesRef.current = null;
    };
  }, [theme]);

  // Update data
  useEffect(() => {
    if (!chartRef.current || !results?.equity_curve) return;

    // Process equity curve
    const eqData = results.equity_curve
      .filter(pt => pt.time && pt.value !== undefined)
      .map(pt => ({ time: pt.time, value: pt.value }))
      .sort((a, b) => a.time.localeCompare(b.time));

    // Deduplicate
    const uniqueEq = [];
    let lastTime = null;
    for (const pt of eqData) {
      if (pt.time !== lastTime) {
        uniqueEq.push(pt);
        lastTime = pt.time;
      }
    }

    if (uniqueEq.length > 0) {
      equitySeriesRef.current?.setData(uniqueEq);
    }

    // Buy & Hold
    if (results.buy_hold_equity_curve && results.buy_hold_equity_curve.length > 0) {
      const bhData = results.buy_hold_equity_curve
        .filter(pt => pt.time && pt.value !== undefined)
        .map(pt => ({ time: pt.time, value: pt.value }))
        .sort((a, b) => a.time.localeCompare(b.time));

      const uniqueBh = [];
      lastTime = null;
      for (const pt of bhData) {
        if (pt.time !== lastTime) {
          uniqueBh.push(pt);
          lastTime = pt.time;
        }
      }

      if (uniqueBh.length > 0) {
        buyHoldSeriesRef.current?.setData(uniqueBh);
      }
    }

    setTimeout(() => {
      chartRef.current?.timeScale().fitContent();
    }, 50);
  }, [results]);

  // Toggle Buy & Hold visibility
  useEffect(() => {
    if (buyHoldSeriesRef.current) {
      buyHoldSeriesRef.current.applyOptions({ visible: showBuyHoldComparison });
    }
  }, [showBuyHoldComparison]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '150px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid var(--tv-color-border, #2a2e39)'
      }}>
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--tv-color-text-primary, #d1d4dc)' }}>
          Equity Curve
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--tv-color-text-secondary, #787b86)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showBuyHoldComparison}
            onChange={toggleBuyHoldComparison}
            style={{ cursor: 'pointer' }}
          />
          Buy & Hold ({results.buy_hold_return_pct?.toFixed(2) || 0}%)
        </label>
      </div>
      <div ref={containerRef} style={{ flex: 1, width: '100%' }} />
    </div>
  );
}

// --- Main Component ---
export default function StrategyTesterPane({ results, theme, onClose, onTradeClick, mainChart }) {
  const { activeTab, selectTrade } = useSimulatorStore();
  const { lastStrategyName } = useSimulatorStore();

  const handleTradeClick = useCallback((tradeIndex) => {
    selectTrade(tradeIndex);

    if (onTradeClick) {
      onTradeClick(tradeIndex);
    }

    // Scroll main chart to trade
    if (mainChart && results?.trades_detailed?.[tradeIndex]) {
      const trade = results.trades_detailed[tradeIndex];
      try {
        const exitTime = trade.exit_time;
        // Convert to lightweight-charts format
        const date = new Date(exitTime * 1000);
        const dateStr = date.toISOString().split('T')[0];

        // Scroll chart to show this date
        mainChart.timeScale().scrollToPosition(-5, true);
      } catch (e) {
        console.error('[STRATEGY TESTER] Error scrolling to trade:', e);
      }
    }
  }, [mainChart, results, selectTrade, onTradeClick]);

  if (!results) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--tv-color-text-secondary, #787b86)',
        fontSize: '13px'
      }}>
        Run a strategy to view backtest results here.
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--tv-color-pane-background, #131722)',
      overflow: 'hidden'
    }}>
      <StrategyHeader
        strategyName={lastStrategyName}
        results={results}
        onClose={onClose}
      />
      <TabBar />

      {activeTab === 'metrics' && (
        <>
          <MetricsPanel results={results} />
          <EquityChart results={results} theme={theme} onTradeClick={handleTradeClick} />
        </>
      )}

      {activeTab === 'trades' && (
        <TradesTable
          trades={results.trades_detailed}
          onTradeClick={handleTradeClick}
        />
      )}
    </div>
  );
}
