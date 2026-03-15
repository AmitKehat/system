// src/components/Toolbar/RightToolbar.jsx
import React from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

const ToolbarIcon = ({ icon: Icon, label, active, onClick, badge }) => (
  <button
    className={`right-toolbar-btn ${active ? 'active' : ''}`}
    onClick={onClick}
    title={label}
  >
    <Icon />
    {badge && <span className="toolbar-badge">{badge}</span>}
  </button>
);

// Icons
const PortfolioIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
    <path d="M9 12h6M9 16h6" />
  </svg>
);

const OrdersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
    <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0z" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);

const TradesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M7 16V4m0 0L3 8m4-4l4 4" />
    <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
  </svg>
);

const WatchlistIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const AlertsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const NewsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1" />
    <path d="M21 12a2 2 0 00-2-2h-2v8a2 2 0 002 2h.5" />
    <path d="M7 8h6M7 12h6M7 16h4" />
  </svg>
);

const ScreenerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
    <path d="M11 8v6M8 11h6" />
  </svg>
);

// New AI Simulator Terminal Icon
const SimulatorIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);

export default function RightToolbar() {
  const { sidebarOpen, setSidebarOpen, activePanel, setActivePanel, orders } = usePortfolioStore();
  
  const openOrders = orders.filter(o => !['Filled', 'Cancelled'].includes(o.status)).length;
  
  const handlePanelClick = (panel) => {
    if (sidebarOpen && activePanel === panel) {
      setSidebarOpen(false);
    } else {
      setActivePanel(panel);
      setSidebarOpen(true);
    }
  };
  
  return (
    <div className="right-toolbar">
      <div className="right-toolbar-top">
        <ToolbarIcon
          icon={WatchlistIcon}
          label="Watchlist"
          active={sidebarOpen && activePanel === 'watchlist'}
          onClick={() => handlePanelClick('watchlist')}
        />
        <ToolbarIcon
          icon={AlertsIcon}
          label="Alerts"
          active={sidebarOpen && activePanel === 'alerts'}
          onClick={() => handlePanelClick('alerts')}
        />
      </div>
      
      <div className="right-toolbar-divider" />
      
      <div className="right-toolbar-middle">
        <ToolbarIcon
          icon={PortfolioIcon}
          label="Portfolio"
          active={sidebarOpen && activePanel === 'positions'}
          onClick={() => handlePanelClick('positions')}
        />
        <ToolbarIcon
          icon={OrdersIcon}
          label="Orders"
          active={sidebarOpen && activePanel === 'orders'}
          onClick={() => handlePanelClick('orders')}
          badge={openOrders > 0 ? openOrders : null}
        />
        <ToolbarIcon
          icon={TradesIcon}
          label="Trades"
          active={sidebarOpen && activePanel === 'trades'}
          onClick={() => handlePanelClick('trades')}
        />
      </div>
      
      <div className="right-toolbar-divider" />
      
      <div className="right-toolbar-bottom">
        <ToolbarIcon
          icon={CalendarIcon}
          label="Calendar"
          active={sidebarOpen && activePanel === 'calendar'}
          onClick={() => handlePanelClick('calendar')}
        />
        <ToolbarIcon
          icon={NewsIcon}
          label="News"
          active={sidebarOpen && activePanel === 'news'}
          onClick={() => handlePanelClick('news')}
        />
        <ToolbarIcon
          icon={ScreenerIcon}
          label="Screener"
          active={sidebarOpen && activePanel === 'screener'}
          onClick={() => handlePanelClick('screener')}
        />
      </div>

      <div className="right-toolbar-divider" />

      {/* AI Simulator Tab */}
      <div className="right-toolbar-bottom">
        <ToolbarIcon
          icon={SimulatorIcon}
          label="AI Strategy Simulator"
          active={sidebarOpen && activePanel === 'simulator'}
          onClick={() => handlePanelClick('simulator')}
        />
      </div>
    </div>
  );
}