// src/components/Portfolio/AccountHeader.jsx
import React from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

function formatCurrency(value, decimals = 2) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatPnL(value) {
  if (value === null || value === undefined) return '--';
  const formatted = formatCurrency(Math.abs(value));
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${formatted}`;
}

export default function AccountHeader() {
  const {
    accounts,
    selectedAccount,
    setSelectedAccount,
    accountSummary,
    positions, // CRITICAL FIX: Extract positions to calculate aggregate math
    loading,
    refreshAll
  } = usePortfolioStore();

  const summary = accountSummary;
  
  // CRITICAL FIX: Mathematically sum the total Daily P&L from the real-time positions array
  const calculatedDailyPnl = positions.reduce((total, pos) => total + (pos.daily_pnl || 0), 0);
  
  // Calculate daily P&L percentage using the computed total
  const dailyPnlPct = summary && summary.net_liquidation > 0
    ? (calculatedDailyPnl / summary.net_liquidation * 100)
    : 0;

  return (
    <div className="account-header">
      {/* Account Selector */}
      <div className="account-selector">
        <select
          className="account-dropdown"
          value={selectedAccount || ''}
          onChange={(e) => setSelectedAccount(e.target.value)}
        >
          {accounts.map(acc => (
            <option key={acc} value={acc}>{acc}</option>
          ))}
        </select>
        <button 
          className="refresh-btn"
          onClick={refreshAll}
          disabled={loading.summary}
          title="Refresh"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading.summary ? 'spin' : ''}>
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      </div>
      
      {/* P&L Summary */}
      {summary && (
        <div className="pnl-summary">
          <div className="pnl-row pnl-main">
            <div className="pnl-section">
              <span className="pnl-label">P&L</span>
              <div className="pnl-values">
                <span className="pnl-daily-label">DAILY</span>
                <span className={`pnl-value ${calculatedDailyPnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatPnL(calculatedDailyPnl)}
                </span>
                <span className={`pnl-pct ${dailyPnlPct >= 0 ? 'positive' : 'negative'}`}>
                  {dailyPnlPct >= 0 ? '+' : ''}{dailyPnlPct.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="pnl-section">
              <span className="pnl-unrealized-label">Unrealized</span>
              <span className={`pnl-value ${summary.unrealized_pnl >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(summary.unrealized_pnl)}
              </span>
            </div>
            <div className="pnl-section">
              <span className="pnl-realized-label">Realized</span>
              <span className="pnl-value">
                {formatCurrency(summary.realized_pnl)}
              </span>
            </div>
          </div>
          
          <div className="pnl-row pnl-margin">
            <div className="margin-section">
              <span className="margin-label">Margin</span>
            </div>
            <div className="margin-values">
              <div className="margin-item">
                <span className="margin-item-label">Net Liquidity</span>
                <span className="margin-item-value">{formatCurrency(summary.net_liquidation / 1000, 1)}K</span>
              </div>
              <div className="margin-item">
                <span className="margin-item-label">Excess Liq</span>
                <span className="margin-item-value">{formatCurrency(summary.excess_liquidity / 1000, 1)}K</span>
              </div>
              <div className="margin-item">
                <span className="margin-item-label">Maintenance</span>
                <span className="margin-item-value">{formatCurrency(summary.maintenance_margin / 1000, 1)}K</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}