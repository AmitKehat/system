// src/components/Portfolio/TradesPanel.jsx
import React, { useState } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatTime(isoString) {
  if (!isoString) return '--';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
}

function formatDate(isoString) {
  if (!isoString) return '--';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
}

export default function TradesPanel() {
  const { trades, loading, errors, selectedAccount, fetchTrades } = usePortfolioStore();
  const [daysFilter, setDaysFilter] = useState(1);
  
  const handleDaysChange = (days) => {
    setDaysFilter(days);
    if (selectedAccount) {
      fetchTrades(selectedAccount, days);
    }
  };
  
  if (loading.trades) {
    return (
      <div className="panel-loading">
        <div className="spinner" />
        <span>Loading trades...</span>
      </div>
    );
  }
  
  if (errors.trades) {
    return (
      <div className="panel-error">
        <span>Error: {errors.trades}</span>
      </div>
    );
  }
  
  // Group trades by date
  const tradesByDate = trades.reduce((acc, trade) => {
    const date = trade.executed_at ? formatDate(trade.executed_at) : 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(trade);
    return acc;
  }, {});
  
  return (
    <div className="trades-panel">
      {/* Days filter */}
      <div className="trades-filter">
        <span className="filter-label">Show:</span>
        <div className="days-buttons">
          {[1, 3, 7, 30].map(days => (
            <button
              key={days}
              className={`days-btn ${daysFilter === days ? 'active' : ''}`}
              onClick={() => handleDaysChange(days)}
            >
              {days === 1 ? 'Today' : `${days}D`}
            </button>
          ))}
        </div>
      </div>
      
      {trades.length === 0 ? (
        <div className="panel-empty">
          <span>No trades in the last {daysFilter} day{daysFilter > 1 ? 's' : ''}</span>
        </div>
      ) : (
        <div className="trades-table-container">
          <table className="trades-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>SYMBOL</th>
                <th>SIDE</th>
                <th>QTY</th>
                <th>PRICE</th>
                <th>COMMISSION</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(tradesByDate).map(([date, dateTrades]) => (
                <React.Fragment key={date}>
                  <tr className="date-header-row">
                    <td colSpan="7">{date}</td>
                  </tr>
                  {dateTrades.map((trade) => (
                    <tr key={trade.exec_id}>
                      <td className="col-time">{formatTime(trade.executed_at)}</td>
                      <td className="col-symbol">
                        <span className="symbol-text">{trade.symbol}</span>
                        {trade.sec_type !== 'STK' && (
                          <span className="sec-type-badge">{trade.sec_type}</span>
                        )}
                      </td>
                      <td className={`col-side ${trade.action === 'BOT' ? 'buy' : 'sell'}`}>
                        {trade.action === 'BOT' ? 'BUY' : 'SELL'}
                      </td>
                      <td className="col-qty">{formatNumber(trade.quantity, 0)}</td>
                      <td className="col-price">{formatNumber(trade.price)}</td>
                      <td className="col-commission">{formatNumber(trade.commission)}</td>
                      <td className={`col-pnl ${(trade.realized_pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {trade.realized_pnl !== null ? formatNumber(trade.realized_pnl) : '--'}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
