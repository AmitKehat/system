// src/lib/constants.js
export const STORAGE_KEY = 'trading_ui_state_v2';

export const BAR_OPTIONS = [
  '1 min',
  '5 mins',
  '15 mins',
  '30 mins',
  '1 hour',
  '4 hours',
  '1 day',
  '1 week',
  '1 month'
];

export const DURATION_OPTIONS = [
  '1 D',
  '2 D',
  '1 W',
  '2 W',
  '1 M',
  '3 M',
  '6 M',
  '1 Y',
  '2 Y',
  '5 Y'
];

export const DEFAULT_STATE = {
  symbol: 'AAPL',
  barSize: '15 mins',
  duration: '1 W',
  useRTH: true,
  theme: 'dark',
  indicators: [
    { id: 'volume-main', type: 'volume', overlay: true, visible: true, params: {} }
  ],
  favorites: ['sma', 'ema', 'rsi', 'macd'],
  paneHeights: {}
};
