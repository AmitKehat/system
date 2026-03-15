// src/components/Portfolio/PortfolioSidebar.jsx
import React, { useEffect } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';
import ResizableSidebar from './ResizableSidebar';
import AccountHeader from './AccountHeader';
import PositionsPanel from './PositionsPanel';
import OrdersPanel from './OrdersPanel';
import TradesPanel from './TradesPanel';
import WatchlistPanel from './WatchlistPanel'; // CRITICAL FIX: Import the new component
import { Icons } from '../UI/Icons';
import SimulatorPanel from './SimulatorPanel';

export default function PortfolioSidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    activePanel,
    setActivePanel,
    fetchAccounts,
    portfolioMode,
    setPortfolioMode
  } = usePortfolioStore();

  useEffect(() => {
    if (sidebarOpen) {
      fetchAccounts();
    }
  }, [sidebarOpen, fetchAccounts]);

  const renderPanel = () => {
    switch (activePanel) {
      case 'positions':
        return <PositionsPanel />;
      case 'orders':
        return <OrdersPanel />;
      case 'trades':
        return <TradesPanel />;
      case 'watchlist':
        return <WatchlistPanel />; // CRITICAL FIX: Render the WatchlistPanel here
      case 'simulator': 
        return <SimulatorPanel />;
      case 'alerts':
        return <div className="panel-placeholder">Alerts coming soon</div>;
      case 'calendar':
        return <div className="panel-placeholder">Calendar coming soon</div>;
      case 'news':
        return <div className="panel-placeholder">News coming soon</div>;
      case 'screener':
        return <div className="panel-placeholder">Screener coming soon</div>;
      default:
        return <PositionsPanel />;
    }
  };

  const getPanelTitle = () => {
    switch (activePanel) {
      case 'positions': return 'Portfolio';
      case 'simulator': return 'Simulator AI';
      case 'orders': return 'Orders';
      case 'trades': return 'Trades';
      case 'watchlist': return 'Watchlist';
      case 'alerts': return 'Alerts';
      case 'calendar': return 'Calendar';
      case 'news': return 'News';
      case 'screener': return 'Screener';
      default: return 'Portfolio';
    }
  };

  const isPortfolioView = ['positions', 'orders', 'trades'].includes(activePanel);

  return (
    <ResizableSidebar>
      {/* Header */}
      <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 className="sidebar-title" style={{ margin: 0 }}>{getPanelTitle()}</h2>
          
          {/* Visual Execution Toggle */}
          {isPortfolioView && (
            <div style={{ 
              display: 'flex', 
              background: 'var(--tv-color-popup-background, #1e222d)', 
              borderRadius: '6px', 
              padding: '2px',
              border: '1px solid var(--tv-color-border, #2a2e39)' 
            }}>
              <button 
                onClick={() => setPortfolioMode('paper')}
                style={{ 
                  padding: '4px 12px', 
                  fontSize: '12px', 
                  fontWeight: '600',
                  cursor: 'pointer', 
                  border: 'none', 
                  borderRadius: '4px',
                  background: portfolioMode === 'paper' ? '#089981' : 'transparent', 
                  color: portfolioMode === 'paper' ? '#ffffff' : 'var(--tv-color-text-secondary, #787b86)',
                  transition: 'all 0.15s ease'
                }}
              >
                Paper
              </button>
              <button 
                onClick={() => setPortfolioMode('live')}
                style={{ 
                  padding: '4px 12px', 
                  fontSize: '12px', 
                  fontWeight: '600',
                  cursor: 'pointer', 
                  border: 'none', 
                  borderRadius: '4px',
                  background: portfolioMode === 'live' ? '#2962ff' : 'transparent', 
                  color: portfolioMode === 'live' ? '#ffffff' : 'var(--tv-color-text-secondary, #787b86)',
                  transition: 'all 0.15s ease'
                }}
              >
                Live
              </button>
            </div>
          )}
        </div>
        <button 
          className="sidebar-close-btn"
          onClick={() => setSidebarOpen(false)}
        >
          <Icons.Close />
        </button>
      </div>
      
      {/* Account Selector & Summary Stats */}
      {isPortfolioView && (
        <AccountHeader />
      )}
      
      {/* Tab Navigation for Portfolio panels */}
      {isPortfolioView && (
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${activePanel === 'simulator' ? 'active' : ''}`}
            onClick={() => setActivePanel('simulator')}
          >
            Simulator
          </button>
          <button
            className={`sidebar-tab ${activePanel === 'positions' ? 'active' : ''}`}
            onClick={() => setActivePanel('positions')}
          >
            Positions
          </button>
          <button
            className={`sidebar-tab ${activePanel === 'orders' ? 'active' : ''}`}
            onClick={() => setActivePanel('orders')}
          >
            Orders
          </button>
          <button
            className={`sidebar-tab ${activePanel === 'trades' ? 'active' : ''}`}
            onClick={() => setActivePanel('trades')}
          >
            Trades
          </button>
        </div>
      )}
      
      {/* Panel Content (Tables) */}
      <div className="sidebar-content">
        {renderPanel()}
      </div>
    </ResizableSidebar>
  );
}