import React, { useState, useEffect } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useChartStore } from '../../store/chartStore';

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatPnL(value, showSign = true) {
  if (value === null || value === undefined) return '--';
  const formatted = formatNumber(Math.abs(value));
  if (!showSign) return formatted;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function formatPnLWithPct(value, pct) {
  if (value === null || value === undefined) return '--';
  const pnlStr = formatPnL(value);
  const pctStr = pct !== null && pct !== undefined 
    ? `(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`
    : '';
  return `${pnlStr} ${pctStr}`;
}

export default function PositionsPanel() {
  const { positions, accountSummary, loading, errors } = usePortfolioStore();
  
  // CRITICAL FIX: Extract reloadChart alongside setSymbol
  const setSymbol = useChartStore((s) => s.setSymbol);
  const reloadChart = useChartStore((s) => s.reloadChart);
  
  const [sortField, setSortField] = useState('symbol');
  const [sortDir, setSortDir] = useState('asc');
  const [hoveredRow, setHoveredRow] = useState(null);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedPositions = [...positions].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // CRITICAL FIX: Trigger a full chart wipe and historical reload
  const handleSymbolClick = (symbol) => {
    setSymbol(symbol);
    reloadChart();
  };

  if (loading.positions) {
    return (
      <div className="panel-loading">
        <div className="spinner" />
        <span>Loading positions...</span>
      </div>
    );
  }
  
  if (errors.positions) {
    return (
      <div className="panel-error">
        <span>Error: {errors.positions}</span>
      </div>
    );
  }
  
  if (positions.length === 0 && (!accountSummary || accountSummary.total_cash === 0)) {
    return (
      <div className="panel-empty">
        <span>No positions</span>
      </div>
    );
  }

  const headerStyle = { 
    fontWeight: '700', 
    color: 'var(--tv-color-text-primary, #e0e3eb)', 
    opacity: 1,
    letterSpacing: '0.5px'
  };

  const cashRowStyle = { 
    fontWeight: 'bold', 
    color: 'var(--tv-color-text-primary, #ffffff)',
    background: 'rgba(41, 98, 255, 0.08)',
    borderTop: '2px solid var(--tv-color-border, #2a2e39)'
  };

  return (
    <div className="positions-panel">
      <div className="positions-table-container">
        <table className="positions-table">
          <thead>
            <tr>
              <th className="col-symbol" onClick={() => handleSort('symbol')} style={headerStyle}>
                FINANCIAL INSTRUMENT
                {sortField === 'symbol' && <SortIcon dir={sortDir} />}
              </th>
              <th className="col-position" onClick={() => handleSort('position')} style={headerStyle}>
                POSITION
                {sortField === 'position' && <SortIcon dir={sortDir} />}
              </th>
              <th className="col-cost" onClick={() => handleSort('avg_cost')} style={headerStyle}>
                COST BASIS
                {sortField === 'avg_cost' && <SortIcon dir={sortDir} />}
              </th>
              <th className="col-mktval" onClick={() => handleSort('market_value')} style={headerStyle}>
                MKT VALUE
                {sortField === 'market_value' && <SortIcon dir={sortDir} />}
              </th>
              <th className="col-avgprice" onClick={() => handleSort('avg_cost')} style={headerStyle}>
                AVG PRICE
                {sortField === 'avg_cost' && <SortIcon dir={sortDir} />}
              </th>
              <th className="col-daily" onClick={() => handleSort('daily_pnl')} style={headerStyle}>
                DAILY P&L
                {sortField === 'daily_pnl' && <SortIcon dir={sortDir} />}
              </th>
              <th className="col-unrealized" onClick={() => handleSort('unrealized_pnl')} style={headerStyle}>
                UNRLZD P&L (%)
                {sortField === 'unrealized_pnl' && <SortIcon dir={sortDir} />}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPositions.map((pos) => (
              <tr 
                key={`${pos.symbol}-${pos.sec_type}`}
                className={hoveredRow === pos.symbol ? 'hovered' : ''}
                onMouseEnter={() => setHoveredRow(pos.symbol)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td className="col-symbol">
                  <button 
                    className="symbol-link"
                    onClick={() => handleSymbolClick(pos.symbol)}
                  >
                    {pos.symbol}
                  </button>
                  {pos.sec_type !== 'STK' && (
                    <span className="sec-type-badge">{pos.sec_type}</span>
                  )}
                </td>
                <td className="col-position">
                  {formatNumber(pos.position, pos.position % 1 === 0 ? 0 : 2)}
                </td>
                <td className="col-cost">
                  {formatNumber(pos.avg_cost * pos.position)}
                </td>
                <td className="col-mktval">
                   {formatNumber(pos.market_value)}
                </td>
                <td className="col-avgprice">
                  {formatNumber(pos.avg_cost)}
                </td>
                <td className={`col-daily ${(pos.daily_pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                  {formatPnL(pos.daily_pnl)}
                </td>
                <td className={`col-unrealized ${pos.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatPnLWithPct(pos.unrealized_pnl, pos.unrealized_pnl_pct)}
                </td>
              </tr>
            ))}
            
            {accountSummary && (
              <tr className="cash-row" style={cashRowStyle}>
                <td className="col-symbol" style={cashRowStyle}>USD CASH</td>
                <td className="col-position" style={cashRowStyle}></td>
                <td className="col-cost" style={cashRowStyle}></td>
                <td className="col-mktval" style={{...cashRowStyle, color: '#089981'}}>{formatNumber(accountSummary.total_cash)}</td>
                <td className="col-avgprice" style={cashRowStyle}></td>
                <td className="col-daily" style={cashRowStyle}></td>
                <td className="col-unrealized" style={cashRowStyle}></td>
              </tr>
            )}
          </tbody>
        </table>
       </div>
    </div>
  );
}

function SortIcon({ dir }) {
  return (
    <span className="sort-icon" style={{ marginLeft: '4px', opacity: 0.8 }}>
      {dir === 'asc' ? '▲' : '▼'}
    </span>
  );
}