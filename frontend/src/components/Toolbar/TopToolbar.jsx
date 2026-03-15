// src/components/Toolbar/TopToolbar.jsx
import React from 'react';
import { useChartStore } from '../../store/chartStore';
import { BAR_OPTIONS, DURATION_OPTIONS } from '../../lib/constants';
import { Icons } from '../UI/Icons';
import SymbolSearch from './SymbolSearch';

export default function TopToolbar() {
  const {
    symbol,
    barSize, setBarSize,
    duration, setDuration,
    useRTH, setUseRTH,
    theme, toggleTheme,
    loading, error, bars,
    openIndicatorDialog
  } = useChartStore();

  const getStatusText = () => {
    if (loading) return 'Loading...';
    if (error) return 'Error';
    if (bars.length) return `${symbol} • ${bars.length} bars`;
    return 'Ready';
  };

  const getStatusClass = () => {
    if (loading) return 'loading';
    if (error) return 'error';
    if (bars.length) return 'success';
    return '';
  };

  return (
    <div className="top-toolbar">
      {/* Symbol input with autocomplete */}
      <div className="top-toolbar-group">
        <SymbolSearch />
      </div>

      <div className="top-toolbar-divider" />

      {/* Timeframe */}
      <div className="top-toolbar-group">
        <select 
          className="tv-select"
          value={barSize}
          onChange={(e) => setBarSize(e.target.value)}
        >
          {BAR_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="top-toolbar-divider" />

      {/* Duration */}
      <div className="top-toolbar-group">
        <select
          className="tv-select"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        >
          {DURATION_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="top-toolbar-divider" />

      {/* RTH toggle */}
      <div className="top-toolbar-group">
        <button
          className={`tv-button ${useRTH ? 'active' : ''}`}
          onClick={() => setUseRTH(!useRTH)}
          title="Regular Trading Hours"
        >
          RTH
        </button>
      </div>

      <div className="top-toolbar-divider" />

      {/* Indicators */}
      <div className="top-toolbar-group">
        <button 
          className="tv-button"
          onClick={openIndicatorDialog}
        >
          <Icons.Indicators />
          Indicators
        </button>
      </div>

      <div className="top-toolbar-spacer" />

      {/* Status */}
      <div className={`status-bar ${getStatusClass()}`}>
        {loading && <Icons.Loader />}
        {getStatusText()}
      </div>

      <div className="top-toolbar-divider" />

      {/* Theme toggle */}
      <button
        className="tv-button tv-button-icon"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
      </button>
    </div>
  );
}
