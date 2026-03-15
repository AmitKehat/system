// src/components/StatusBar/StatusBar.jsx
import React, { useEffect, useState } from 'react';
import { useStatusStore } from '../../store/statusStore';
import './StatusBar.css';

export default function StatusBar() {
  const { marketStatus, ibStatusLive, ibStatusPaper, logout } = useStatusStore();
  const [showMarketDetails, setShowMarketDetails] = useState(false);
  const [showLiveDetails, setShowLiveDetails] = useState(false);
  const [showPaperDetails, setShowPaperDetails] = useState(false);

  return (
    <div className="status-bar">
      <div className="status-indicators">
        <MarketStatusIndicator 
          status={marketStatus} 
          showDetails={showMarketDetails}
          onToggleDetails={() => setShowMarketDetails(!showMarketDetails)}
        />
        
        <IBStatusIndicator 
          title="Live"
          status={ibStatusLive}
          showDetails={showLiveDetails}
          onToggleDetails={() => setShowLiveDetails(!showLiveDetails)}
        />
        
        <IBStatusIndicator 
          title="Paper"
          status={ibStatusPaper}
          showDetails={showPaperDetails}
          onToggleDetails={() => setShowPaperDetails(!showPaperDetails)}
        />
      </div>
      <button className="status-disconnect-btn" onClick={logout} title="Disconnect session and return to login">
        Disconnect
      </button>
    </div>
  );
}

function CurrentTimeIndicator() {
  const [position, setPosition] = React.useState(null);

  React.useEffect(() => {
    const updatePosition = () => {
      const now = new Date();
      const utcHours = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      
      let etHours = utcHours - 5;
      if (etHours < 0) etHours += 24;
      
      const currentMinutes = etHours * 60 + utcMinutes;
      const startMinutes = 4 * 60;
      const endMinutes = 20 * 60;
      const totalMinutes = endMinutes - startMinutes;
      
      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        const percent = ((currentMinutes - startMinutes) / totalMinutes) * 100;
        setPosition(percent);
      } else if (currentMinutes < startMinutes) {
        setPosition(0);
      } else {
        setPosition(100);
      }
    };

    updatePosition();
    const interval = setInterval(updatePosition, 60000);
    
    return () => clearInterval(interval);
  }, []);

  if (position === null) return null;

  return (
    <div 
      className="current-time-indicator" 
      style={{ left: `${position}%` }}
    >
      <div className="time-arrow" />
      <div className="time-line" />
    </div>
  );
}

function MarketStatusIndicator({ status, showDetails, onToggleDetails }) {
  const { isOpen = null, session = null, nextChange = null, exchange = null, timezone = null } = status || {};

  const getStatusColor = () => {
    if (isOpen === null) return '#787b86';
    if (session === 'open') return '#089981';
    if (session === 'pre-market' || session === 'post-market') return '#f7931a';
    return '#f23645';
  };

  const getStatusTitle = () => {
    if (isOpen === null) return 'Loading...';
    if (session === 'open') return 'Market Open';
    if (session === 'pre-market') return 'Pre-market';
    if (session === 'post-market') return 'Post-market';
    return 'Market Closed';
  };

  const getStatusDetail = () => {
    if (isOpen === null) return 'Checking market status...';
    if (isOpen) {
      if (session === 'open') {
        return `Regular Trading Session. ${nextChange || ''}`;
      } else if (session === 'pre-market') {
        return `Pre-market Session. ${nextChange || ''}`;
      } else if (session === 'post-market') {
        return `Post-market Session. ${nextChange || ''}`;
      }
    }
    return `Market is closed. ${nextChange || ''}`;
  };

  return (
    <div 
      className="status-indicator market-status"
      onClick={onToggleDetails}
    >
      <div 
        className="status-dot" 
        style={{ backgroundColor: getStatusColor() }}
      />
      <span className="status-title">{getStatusTitle()}</span>
      
      {showDetails && (
        <div className="status-popup">
          <div className="popup-header">
            <div 
              className="status-dot large" 
              style={{ backgroundColor: getStatusColor() }}
            />
            <span className="popup-title">{getStatusTitle()}</span>
          </div>
          <p className="popup-detail">{getStatusDetail()}</p>
          
          <div className="market-hours-bar">
            <span className="day-label">TODAY</span>
            <div className="hours-track-container">
              <CurrentTimeIndicator />
              <div className="hours-track">
                <div className="hour-segment pre-market" />
                <div className="hour-segment regular" />
                <div className="hour-segment post-market" />
              </div>
            </div>
            <div className="hours-labels">
              <span>04:00</span>
              <span>09:30</span>
              <span>16:00</span>
              <span>20:00</span>
            </div>
          </div>
          
          {exchange && (
            <div className="popup-footer">
              Exchange timezone: {exchange} ({timezone})
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IBStatusIndicator({ title, status, showDetails, onToggleDetails }) {
  const { connected = null, lastHeartbeat = null, error = null } = status || {};
  const wsConnected = useStatusStore((s) => s.wsConnected);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('');
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      if (!wsConnected) {
        setIsStale(true);
        setTimeSinceUpdate('no connection');
        return;
      }
      
      if (lastHeartbeat) {
        const seconds = Math.floor((Date.now() - lastHeartbeat) / 1000);
        setIsStale(seconds > 30);
        
        if (seconds < 5) {
          setTimeSinceUpdate('just now');
        } else if (seconds < 60) {
          setTimeSinceUpdate(`${seconds}s ago`);
        } else {
          const minutes = Math.floor(seconds / 60);
          setTimeSinceUpdate(`${minutes}m ago`);
        }
      } else {
        setIsStale(true);
        setTimeSinceUpdate('never');
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastHeartbeat, wsConnected]);

  const isActuallyConnected = wsConnected && connected === true && !isStale;

  const getStatusColor = () => {
    if (!wsConnected) return '#f23645';
    if (connected === null) return '#787b86';
    if (isStale || connected === false) return '#f23645';
    return '#089981';
  };

  const getStatusDetail = () => {
    if (!wsConnected) return 'WebSocket disconnected. Reconnecting...';
    if (connected === null) return 'Connecting to Gateway...';
    if (connected === false && error) return error; 
    if (isStale) return `Connection lost. Last heartbeat: ${timeSinceUpdate}`;
    if (connected) return `Connected to Gateway. Last heartbeat: ${timeSinceUpdate}`;
    return 'Not connected to Gateway.';
  };

  return (
    <div 
      className="status-indicator ib-status"
      onClick={onToggleDetails}
    >
      <div 
        className={`status-dot ${isActuallyConnected ? 'pulse' : ''}`}
        style={{ backgroundColor: getStatusColor() }}
      />
      <span className="status-title">{title}</span>
      
      {showDetails && (
        <div className="status-popup">
          <div className="popup-header">
            <div 
              className={`status-dot large ${isActuallyConnected ? 'pulse' : ''}`}
              style={{ backgroundColor: getStatusColor() }}
            />
            <span className="popup-title">{title}</span>
          </div>
          
          <p className="popup-detail">{getStatusDetail()}</p>
          
          {(isStale || !wsConnected || connected === false) && (
            <div className="popup-info" style={{ color: '#f23645' }}>
              <span className="info-label">Status:</span>
              <span className="info-value">
                {!wsConnected ? 'WebSocket reconnecting...' : 'No heartbeat received'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}