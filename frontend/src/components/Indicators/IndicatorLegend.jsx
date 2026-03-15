import React from 'react';
import { useChartStore, INDICATOR_DEFS } from '../../store/chartStore';
import { Icons } from '../UI/Icons';

export default function IndicatorLegend({ indicators }) {
  const {
    toggleIndicatorVisibility,
    openSettings,
    removeIndicator
  } = useChartStore();

  if (!indicators.length) return null;

  const getIndicatorLabel = (ind) => {
    const def = INDICATOR_DEFS.find((d) => d.type === ind.type);
    const params = ind.params || {};

    switch (ind.type) {
      case 'rsi':
      case 'atr':
      case 'cci':
      case 'adx':
        return `${def?.name || ind.type} (${params.period || 14})`;
      case 'macd':
        return `MACD (${params.fast || 12}, ${params.slow || 26}, ${params.signal || 9})`;
      case 'stoch':
        return `Stoch (${params.kPeriod || 14}, ${params.dPeriod || 3})`;
      case 'obv':
        return 'OBV';
      default:
        return def?.name || ind.type;
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'var(--tv-spacing-sm)',
        left: 'var(--tv-spacing-md)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tv-spacing-xxs)',
        pointerEvents: 'none'
      }}
    >
      {indicators.map((ind) => (
        <div
          key={ind.id}
          className="legend-row"
          style={{ pointerEvents: 'auto' }}
        >
          <span className="legend-title" style={{ color: '#2962FF' }}>
            {getIndicatorLabel(ind)}
          </span>

          <div className="legend-actions">
            <button
              className="legend-action-btn"
              onClick={() => toggleIndicatorVisibility(ind.id)}
              title={ind.visible !== false ? 'Hide' : 'Show'}
            >
              {ind.visible !== false ? <Icons.Eye /> : <Icons.EyeOff />}
            </button>
            <button
              className="legend-action-btn"
              onClick={() => openSettings(ind.id)}
              title="Settings"
            >
              <Icons.Settings />
            </button>
            <button
              className="legend-action-btn"
              onClick={() => removeIndicator(ind.id)}
              title="Remove"
            >
              <Icons.Close />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
