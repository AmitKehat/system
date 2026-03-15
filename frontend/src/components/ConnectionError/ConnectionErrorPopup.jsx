// src/components/ConnectionError/ConnectionErrorPopup.jsx
import React, { useState } from 'react';
import { useStatusStore } from '../../store/statusStore';
import { useChartStore } from '../../store/chartStore';
import './ConnectionErrorPopup.css';

export default function ConnectionErrorPopup() {
  const ibConnectionError = useStatusStore((s) => s.ibConnectionError);
  const reconnectIB = useStatusStore((s) => s.reconnectIB);
  
  // FIX: Monitor the specific gateways
  const ibStatusLive = useStatusStore((s) => s.ibStatusLive);
  const ibStatusPaper = useStatusStore((s) => s.ibStatusPaper);
  
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Check if error is "other IP" type (usually triggered by Live Data Master being stolen)
  const isOtherIPError = ibConnectionError === 'other_ip' || 
    ibStatusLive.error?.includes('different IP address') ||
    ibStatusPaper.error?.includes('different IP address');

  const isReconnectingState = ibConnectionError === 'reconnecting' || isReconnecting;
  const isFailed = ibConnectionError === 'failed';

  // Don't show popup if no error or if reconnecting
  if (!isOtherIPError && !isReconnectingState && !isFailed) {
    return null;
  }

  const handleReconnect = async () => {
    if (isReconnecting) return;
    // Prevent double-click
    
    setIsReconnecting(true);
    
    // Default to reconnecting the Live Data Master, as it drives the UI charts
    const result = await reconnectIB('live');

    if (result.success) {
      console.log('[IB] Reconnected Live Gateway successfully');
      
      // Clear the error state
      useStatusStore.setState({ 
        ibConnectionError: null,
        ibStatusLive: {
          connected: true,
          error: null,
          lastHeartbeat: Date.now()
        }
      });

      // Wait a moment then reload chart
      setTimeout(() => {
        useChartStore.getState().reloadChart?.();
        setIsReconnecting(false);
      }, 2000);

    } else {
      console.error('[IB] Reconnect failed:', result.error);
      setIsReconnecting(false);
    }
  };

  return (
    <div className="connection-error-overlay">
      <div className="connection-error-popup">
        <div className="popup-icon">
          {isReconnectingState ? (
            <div className="spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>
        
        <h2 className="popup-title">
          {isReconnectingState ? 'Reconnecting...' : 
           isFailed ? 'Reconnection Failed' :
           'IB Connection Lost'}
        </h2>
        
        <p className="popup-message">
          {isReconnectingState ? (
            'Restarting IB Gateway. This may take up to 90 seconds...'
          ) : isFailed ? (
            'Failed to reconnect to IB Gateway. Please try again.'
          ) : (
            'Another device is currently connected to your Interactive Brokers account. Only one connection is allowed at a time.'
          )}
        </p>

        {!isReconnectingState && (
          <div className="popup-actions">
            <button 
              className="reconnect-button"
              onClick={handleReconnect}
              disabled={isReconnecting}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Take Control & Reconnect
            </button>
          </div>
        )}

        <p className="popup-hint">
          {isReconnectingState 
            ? 'Please wait, do not close this window...'
            : 'This will disconnect any other devices using this IB account.'}
        </p>
      </div>
    </div>
  );
}