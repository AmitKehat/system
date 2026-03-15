// src/components/Portfolio/OrdersPanel.jsx
import React, { useState } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

const ORDER_STATUS_COLORS = {
  'Submitted': 'status-pending',
  'PreSubmitted': 'status-pending',
  'PendingSubmit': 'status-pending',
  'PendingCancel': 'status-pending',
  'Filled': 'status-filled',
  'Cancelled': 'status-cancelled',
  'Inactive': 'status-inactive'
};

export default function OrdersPanel() {
  const { orders, loading, errors, selectedAccount, fetchOrders } = usePortfolioStore();
  const [statusFilter, setStatusFilter] = useState('all');
  
  const filteredOrders = orders.filter(order => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'open') return !['Filled', 'Cancelled'].includes(order.status);
    if (statusFilter === 'filled') return order.status === 'Filled';
    if (statusFilter === 'cancelled') return order.status === 'Cancelled';
    return true;
  });
  
  if (loading.orders) {
    return (
      <div className="panel-loading">
        <div className="spinner" />
        <span>Loading orders...</span>
      </div>
    );
  }
  
  if (errors.orders) {
    return (
      <div className="panel-error">
        <span>Error: {errors.orders}</span>
      </div>
    );
  }
  
  return (
    <div className="orders-panel">
      {/* Filter tabs */}
      <div className="orders-filter-tabs">
        <button
          className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All ({orders.length})
        </button>
        <button
          className={`filter-tab ${statusFilter === 'open' ? 'active' : ''}`}
          onClick={() => setStatusFilter('open')}
        >
          Open ({orders.filter(o => !['Filled', 'Cancelled'].includes(o.status)).length})
        </button>
        <button
          className={`filter-tab ${statusFilter === 'filled' ? 'active' : ''}`}
          onClick={() => setStatusFilter('filled')}
        >
          Filled ({orders.filter(o => o.status === 'Filled').length})
        </button>
        <button
          className={`filter-tab ${statusFilter === 'cancelled' ? 'active' : ''}`}
          onClick={() => setStatusFilter('cancelled')}
        >
          Cancelled ({orders.filter(o => o.status === 'Cancelled').length})
        </button>
      </div>
      
      {filteredOrders.length === 0 ? (
        <div className="panel-empty">
          <span>No {statusFilter === 'all' ? '' : statusFilter} orders</span>
        </div>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>SYMBOL</th>
                <th>SIDE</th>
                <th>TYPE</th>
                <th>QTY</th>
                <th>FILLED</th>
                <th>PRICE</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.order_id}>
                  <td className="col-symbol">
                    <span className="symbol-text">{order.symbol}</span>
                    {order.sec_type !== 'STK' && (
                      <span className="sec-type-badge">{order.sec_type}</span>
                    )}
                  </td>
                  <td className={`col-side ${order.action === 'BUY' ? 'buy' : 'sell'}`}>
                    {order.action}
                  </td>
                  <td className="col-type">{order.order_type}</td>
                  <td className="col-qty">{formatNumber(order.quantity, 0)}</td>
                  <td className="col-filled">
                    {formatNumber(order.filled_quantity, 0)}/{formatNumber(order.quantity, 0)}
                  </td>
                  <td className="col-price">
                    {order.limit_price ? formatNumber(order.limit_price) : 
                     order.avg_fill_price ? formatNumber(order.avg_fill_price) : 'MKT'}
                  </td>
                  <td className={`col-status ${ORDER_STATUS_COLORS[order.status] || ''}`}>
                    {order.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
