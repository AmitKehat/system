// src/components/Indicators/IndicatorSettings.jsx
import React, { useState, useEffect } from 'react';
import Modal from '../UI/Modal';
import { useChartStore, INDICATOR_DEFS } from '../../store/chartStore';

export default function IndicatorSettings() {
  const {
    settingsDialogOpen,
    closeSettings,
    activeSettingsIndicator,
    indicators,
    updateIndicatorParams
  } = useChartStore();

  const indicator = indicators.find(i => i.id === activeSettingsIndicator);
  const def = indicator ? INDICATOR_DEFS.find(d => d.type === indicator.type) : null;

  const [params, setParams] = useState({});

  useEffect(() => {
    if (indicator) {
      setParams({ ...indicator.params });
    }
  }, [indicator]);

  if (!indicator || !def) return null;

  const handleApply = () => {
    updateIndicatorParams(indicator.id, params);
    closeSettings();
  };

  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const renderParamInput = (key, value) => {
    const numValue = typeof value === 'number' ? value : parseInt(value) || 0;
    
    return (
      <div className="settings-row" key={key}>
        <label className="settings-label">
          {key.charAt(0).toUpperCase() + key.slice(1)}
        </label>
        <div className="settings-input">
          {key === 'color' ? (
            <input
              type="color"
              value={value || '#2962FF'}
              onChange={(e) => handleParamChange(key, e.target.value)}
              style={{ width: 60, height: 28, padding: 2 }}
            />
          ) : (
            <input
              type="number"
              className="tv-input"
              value={numValue}
              onChange={(e) => handleParamChange(key, parseInt(e.target.value) || 0)}
              min={1}
              max={500}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      open={settingsDialogOpen}
      onClose={closeSettings}
      title={`${def.name} Settings`}
      className="settings-dialog"
    >
      <div className="modal-body">
        <div className="settings-form">
          {Object.entries(params).map(([key, value]) => 
            renderParamInput(key, value)
          )}
        </div>
      </div>
      <div className="modal-footer">
        <button className="tv-button" onClick={closeSettings}>
          Cancel
        </button>
        <button className="tv-button primary" onClick={handleApply}>
          Apply
        </button>
      </div>
    </Modal>
  );
}
