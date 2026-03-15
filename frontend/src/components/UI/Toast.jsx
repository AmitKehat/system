// src/components/UI/Toast.jsx
import React, { useEffect, useState } from 'react';
import { Icons } from './Icons';

const toasts = [];
let listeners = [];

export const toast = {
  error: (message) => addToast({ type: 'error', message }),
  success: (message) => addToast({ type: 'success', message }),
  info: (message) => addToast({ type: 'info', message })
};

function addToast(toast) {
  const id = Date.now();
  toasts.push({ ...toast, id });
  listeners.forEach(fn => fn([...toasts]));
  
  setTimeout(() => {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx !== -1) {
      toasts.splice(idx, 1);
      listeners.forEach(fn => fn([...toasts]));
    }
  }, 5000);
}

export function ToastContainer() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter(fn => fn !== setItems);
    };
  }, []);

  const removeToast = (id) => {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx !== -1) {
      toasts.splice(idx, 1);
      listeners.forEach(fn => fn([...toasts]));
    }
  };

  if (!items.length) return null;

  return (
    <div className="toast-container">
      {items.map(item => (
        <div 
          key={item.id} 
          className={`toast ${item.type}`}
          onClick={() => removeToast(item.id)}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
