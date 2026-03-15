// src/lib/indicators/index.js
import { 
  sma, ema, rsi, atr, macd, 
  bollingerBands, stochastic, cci, adx, obv, vwap 
} from './calculations';

// Explicitly export all the named calculation functions so other files can import them cleanly
export { 
  sma, ema, rsi, atr, macd, 
  bollingerBands, stochastic, cci, adx, obv, vwap 
};

// CRITICAL FIX: Explicitly strips invalid/undefined values to prevent lightweight-charts from crashing
const mapToSeries = (values, times) => values.map((v, i) => {
  const pt = { time: times[i] };
  if (v !== null && v !== undefined && !isNaN(v)) {
    pt.value = v;
  }
  return pt;
});

export function calculateIndicator(type, data, params = {}) {
  const { closes, highs, lows, volumes, times } = data;
  
  if (!closes?.length || !times?.length) {
    return { data: [] };
  }

  try {
    switch (type) {
      case 'sma': 
        return { data: mapToSeries(sma(closes, params.period || 20), times) };
      case 'ema': 
        return { data: mapToSeries(ema(closes, params.period || 20), times) };
      case 'rsi': 
        return { data: mapToSeries(rsi(closes, params.period || 14), times) };
      case 'atr': 
        return { data: mapToSeries(atr(highs, lows, closes, params.period || 14), times) };
      case 'cci': 
        return { data: mapToSeries(cci(highs, lows, closes, params.period || 20), times) };
      case 'adx': 
        return { data: mapToSeries(adx(highs, lows, closes, params.period || 14), times) };
      case 'obv': 
        if (!volumes?.length) return { data: [] };
        return { data: mapToSeries(obv(closes, volumes), times) };
      case 'vwap': 
        if (!volumes?.length) return { data: [] };
        return { data: mapToSeries(vwap(highs, lows, closes, volumes), times) };

      case 'macd': {
        const { fast = 12, slow = 26, signal = 9 } = params;
        const result = macd(closes, fast, slow, signal);
        return {
          histogram: result.hist.map((v, i) => {
            const pt = { time: times[i] };
            if (v !== null && v !== undefined && !isNaN(v)) {
              pt.value = v;
              pt.color = v >= 0 ? 'rgba(8, 153, 129, 0.7)' : 'rgba(242, 54, 69, 0.7)';
            }
            return pt;
          }),
          macdLine: mapToSeries(result.macdLine, times),
          signalLine: mapToSeries(result.sigLine, times)
        };
      }

      case 'bb': {
        const { period = 20, stdDev = 2 } = params;
        const result = bollingerBands(closes, period, stdDev);
        return {
          upper: mapToSeries(result.upper, times),
          middle: mapToSeries(result.middle, times),
          lower: mapToSeries(result.lower, times)
        };
      }

      case 'stoch': {
        const { kPeriod = 14, dPeriod = 3, smooth = 3 } = params;
        const result = stochastic(highs, lows, closes, kPeriod, dPeriod, smooth);
        return {
          kLine: mapToSeries(result.k, times),
          dLine: mapToSeries(result.d, times)
        };
      }

      default:
        return { data: [] };
    }
  } catch (error) {
    console.error(`Error calculating ${type}:`, error);
    return { data: [] };
  }
}

// Ensure files trying to import a default binding are satisfied
export default calculateIndicator;