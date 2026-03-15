// src/lib/api.js
import { useStatusStore } from '../store/statusStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function toUtcSeconds(t) {
  if (t == null) return null;

  if (typeof t === 'string' && isNaN(Number(t))) {
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return null;

  if (n > 10_000_000_000) return Math.floor(n / 1000);
  return Math.floor(n);
}

export async function fetchHistBars({ symbol, bar_size, duration, useRTH }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const { mode } = useStatusStore.getState();

    const res = await fetch(`${API_BASE}/ib/hist_bars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, bar_size, duration, useRTH, mode }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON response from server');
    }

    // Check for "different IP" error
    if (data.error && data.error.includes('different IP address')) {
      // Dispatch event for the app to show popup
      window.dispatchEvent(new CustomEvent('ibConnectionError', { 
        detail: { type: 'other_ip', message: data.error } 
      }));
      throw new Error('IB Gateway connected from different IP address');
    }

    if (data.status !== 'OK') {
      throw new Error(data.message || data.error || 'API returned error status');
    }

    const bars = data?.payload?.bars;
    
    // Check for empty bars with potential IP error
    if (!Array.isArray(bars) || bars.length === 0) {
      // This might be due to IP conflict - check if we got an error
      if (data.error || (data.payload && data.payload.rows === 0)) {
        // Could be IP issue - dispatch event to check
        window.dispatchEvent(new CustomEvent('ibConnectionError', { 
          detail: { type: 'no_data', message: 'No data received - possible connection issue' } 
        }));
      }
      throw new Error('No valid bars in response');
    }

    // Clear any previous error
    window.dispatchEvent(new CustomEvent('ibConnectionError', { 
      detail: { type: 'clear' } 
    }));

    const byTime = new Map();

    for (const b of bars) {
      const time = toUtcSeconds(b.time);
      const open = Number(b.open);
      const high = Number(b.high);
      const low = Number(b.low);
      const close = Number(b.close);
      const volume = Number(b.volume ?? 0);

      if (
        Number.isFinite(time) &&
        time > 0 &&
        Number.isFinite(open) &&
        Number.isFinite(high) &&
        Number.isFinite(low) &&
        Number.isFinite(close) &&
        Number.isFinite(volume) &&
        high >= low
      ) {
        byTime.set(time, { time, open, high, low, close, volume });
      }
    }

    const result = Array.from(byTime.values()).sort((a, b) => a.time - b.time);

    if (!result.length) {
      throw new Error('No valid bars in response');
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Request timeout - server not responding');
    }

    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Cannot connect to server at ' + API_BASE);
    }

    throw error;
  }
}