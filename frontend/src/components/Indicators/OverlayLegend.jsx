import React, { useState } from 'react';
import { useChartStore, INDICATOR_DEFS } from '../../store/chartStore';

function IndicatorLegendRow({ ind }) {
  const [isHovered, setIsHovered] = useState(false);
  const {
    toggleIndicatorVisibility,
    openSettings,
    removeIndicator
  } = useChartStore();

  const getIndicatorLabel = () => {
    const def = INDICATOR_DEFS.find(d => d.type === ind.type);
    const params = ind.params || {};

    switch (ind.type) {
      case 'sma':
      case 'ema':
        return `${def?.name || ind.type} (${params.period || 20})`;
      case 'bb':
        return `BB (${params.period || 20}, ${params.stdDev || 2})`;
      case 'vwap':
        return 'VWAP';
      case 'strategy':
        // Use the LLM-generated strategy name if available
        return ind.name || 'Strategy Trades';
      default:
        return def?.name || ind.type;
    }
  };

  const getIndicatorColor = () => {
    // Strategy indicators use green to match entry arrows
    if (ind.type === 'strategy') {
      return '#089981';
    }
    return ind.params?.color || '#2962FF';
  };

  const buttonStyle = {
    background: 'none',
    border: 'none',
    padding: '4px',
    cursor: 'pointer',
    color: 'var(--tv-color-popup-element-text, #d1d4dc)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    width: '24px',
    height: '24px'
  };

  const iconStyle = {
    width: '16px',
    height: '16px'
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        pointerEvents: 'auto',
        padding: '4px 8px',
        borderRadius: '4px',
        background: isHovered ? 'var(--tv-color-popup-background, #1e222d)' : 'transparent',
        transition: 'background 0.15s'
      }}
    >
      <span 
        style={{ 
          color: getIndicatorColor(),
          fontWeight: 500,
          opacity: ind.visible === false ? 0.5 : 1
        }}
      >
        {getIndicatorLabel()}
      </span>
      
      <div 
        style={{ 
          display: 'flex', 
          gap: '2px', 
          marginLeft: '4px',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.15s'
        }}
      >
        {/* Toggle Visibility */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleIndicatorVisibility(ind.id);
          }}
          title={ind.visible === false ? 'Show' : 'Hide'}
          style={buttonStyle}
        >
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {ind.visible === false ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </>
            )}
          </svg>
        </button>

        {/* Settings - Hidden for Strategy since it has no visual config */}
        {ind.type !== 'strategy' && (
            <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openSettings(ind.id);
            }}
            title="Settings"
            style={buttonStyle}
            >
            <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            </button>
        )}

        {/* Remove */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            removeIndicator(ind.id);
          }}
          title="Remove"
          style={buttonStyle}
        >
          <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function OverlayLegend({ indicators }) {
  const legendIndicators = indicators.filter(i => i.type !== 'volume');

  if (!legendIndicators.length) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        left: '12px',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        pointerEvents: 'none'
      }}
    >
      {legendIndicators.map(ind => (
        <IndicatorLegendRow key={ind.id} ind={ind} />
      ))}
    </div>
  );
}