// src/components/Toolbar/LeftToolbar.jsx
import React, { useState } from 'react';
import { Icons } from '../UI/Icons';

const tools = [
  { id: 'cursor', icon: Icons.Cursor, label: 'Cursor' },
  { id: 'crosshair', icon: Icons.Crosshair, label: 'Crosshair' },
];

const drawingTools = [
  { id: 'trendline', icon: Icons.TrendLine, label: 'Trend Line' },
  { id: 'horizontal', icon: Icons.HorizontalLine, label: 'Horizontal Line' },
  { id: 'rectangle', icon: Icons.Rectangle, label: 'Rectangle' },
  { id: 'fibonacci', icon: Icons.Fibonacci, label: 'Fibonacci Retracement' },
  { id: 'text', icon: Icons.Text, label: 'Text' },
];

export default function LeftToolbar() {
  const [activeTool, setActiveTool] = useState('crosshair');

  return (
    <div className="workspace-left-toolbar">
      {/* Cursor tools */}
      <div className="toolbar-group">
        {tools.map(tool => (
          <button
            key={tool.id}
            className={`toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
          >
            <tool.icon />
          </button>
        ))}
      </div>

      <div className="toolbar-divider" style={{ 
        height: 1, 
        background: 'var(--tv-color-toolbar-divider)',
        margin: 'var(--tv-spacing-xs) 0'
      }} />

      {/* Drawing tools */}
      <div className="toolbar-group">
        {drawingTools.map(tool => (
          <button
            key={tool.id}
            className={`toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
          >
            <tool.icon />
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom actions */}
      <div className="toolbar-group">
        <button className="toolbar-btn" title="Undo">
          <Icons.Undo />
        </button>
        <button className="toolbar-btn" title="Redo">
          <Icons.Redo />
        </button>
      </div>
    </div>
  );
}
