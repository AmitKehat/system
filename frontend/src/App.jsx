import './App.css';
import React, { useEffect } from 'react';
import Workspace from './components/Layout/Workspace';
import LoginScreen from './components/Login/LoginScreen';
import { ToastContainer } from './components/UI/Toast';
import { useChartStore } from './store/chartStore';
import { useStatusStore } from './store/statusStore';
import { useWebSocket, useSymbolSubscription, useLiveBarUpdates } from './hooks/useWebSocket';

export default function App() {
  const { theme, loadPersistedState } = useChartStore();
  const { isAuthenticated, ibStatusLive, ibStatusPaper, logout, reconnectIB } = useStatusStore();

  useWebSocket();
  useSymbolSubscription();
  useLiveBarUpdates();

  useEffect(() => {
    loadPersistedState();
  }, [loadPersistedState]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Gatekeeper: Require authenticated Web Session
  if (!isAuthenticated) {
    return (
      <div className="app-root" data-theme={theme}>
        <LoginScreen />
      </div>
    );
  }

  // Graceful Handling of Stolen / Dropped Containers
  const liveOffline = ibStatusLive.connected === false;
  const paperOffline = ibStatusPaper.connected === false;

  if (liveOffline || paperOffline) {
    return (
      <div className="app-root connection-error-screen" data-theme={theme}>
        <div className="popup-overlay">
          <div className="popup-content" style={{ background: 'var(--surface-color)', padding: '30px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)', maxWidth: '450px' }}>
            <h2 style={{color: '#f23645', margin: '0 0 15px 0'}}>Gateway Offline</h2>
            <p style={{color: 'var(--text-color)', marginBottom: '20px'}}>
              One or more backend trading engines have dropped their connection. 
              {liveOffline && " This typically means the IBKR mobile app forced a disconnect on your Live account."}
            </p>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px'}}>
              {liveOffline && (
                <button 
                  onClick={async () => await reconnectIB('live')} 
                  style={{ padding: '10px 15px', background: '#2962ff', color: 'white', borderRadius: '4px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
                  Force Restart Data Master (Live)
                </button>
              )}
              {paperOffline && (
                <button 
                  onClick={async () => await reconnectIB('paper')} 
                  style={{ padding: '10px 15px', background: '#089981', color: 'white', borderRadius: '4px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
                  Force Restart Execution Engine (Paper)
                </button>
              )}
            </div>

            <button 
              onClick={logout} 
              style={{ padding: '10px 15px', background: 'transparent', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root" data-theme={theme}>
      <Workspace />
      <ToastContainer />
    </div>
  );
}