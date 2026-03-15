// src/components/Portfolio/ResizableSidebar.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePortfolioStore } from '../../store/portfolioStore';

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 420;
const STORAGE_KEY = 'portfolio_sidebar_width';

export default function ResizableSidebar({ children }) {
  const sidebarOpen = usePortfolioStore((s) => s.sidebarOpen);
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Save width to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, width.toString());
  }, [width]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    
    // Calculate new width (dragging left increases width since sidebar is on right)
    const deltaX = startXRef.current - e.clientX;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + deltaX));
    
    setWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    if (!isResizing) return;
    
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [isResizing]);

  // Double-click to reset to default width
  const handleDoubleClick = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
  }, []);

  // Add/remove global mouse listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  if (!sidebarOpen) return null;

  return (
    <div 
      ref={sidebarRef}
      className={`portfolio-sidebar ${isResizing ? 'resizing' : ''}`}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div 
        className="sidebar-resize-handle"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize, double-click to reset"
      >
        <div className="resize-handle-line" />
      </div>
      
      {/* Sidebar Content */}
      <div className="sidebar-inner">
        {children}
      </div>
    </div>
  );
}
