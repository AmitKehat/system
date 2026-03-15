// src/components/UI/Modal.jsx
import React, { useEffect, useCallback } from 'react';
import { Icons } from './Icons';

export default function Modal({ open, onClose, title, children, className = '' }) {
  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={`modal ${className}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icons.Close />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
