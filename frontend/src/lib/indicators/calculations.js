// src/lib/indicators/calculations.js (continued and complete)

export function sma(arr, period) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= period) sum -= arr[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    
    return out;
  }
  
  export function ema(arr, period) {
    const out = new Array(arr.length).fill(null);
    const k = 2 / (period + 1);
    let prev = null;
    
    for (let i = 0; i < arr.length; i++) {
      if (i < period - 1) continue;
      
      if (i === period - 1) {
        let s = 0;
        for (let j = i - (period - 1); j <= i; j++) s += arr[j];
        prev = s / period;
        out[i] = prev;
      } else {
        prev = (arr[i] - prev) * k + prev;
        out[i] = prev;
      }
    }
    
    return out;
  }
  
  export function rsi(closes, period) {
    const out = new Array(closes.length).fill(null);
    let gain = 0, loss = 0;
  
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const g = Math.max(0, change);
      const l = Math.max(0, -change);
  
      if (i <= period) {
        gain += g;
        loss += l;
        if (i === period) {
          let avgG = gain / period;
          let avgL = loss / period;
          const rs = avgL === 0 ? Infinity : avgG / avgL;
          out[i] = 100 - (100 / (1 + rs));
          gain = avgG;
          loss = avgL;
        }
      } else {
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        const rs = loss === 0 ? Infinity : gain / loss;
        out[i] = 100 - (100 / (1 + rs));
      }
    }
    
    return out;
  }
  
  export function atr(highs, lows, closes, period) {
    const tr = new Array(closes.length).fill(null);
    
    for (let i = 0; i < closes.length; i++) {
      if (i === 0) {
        tr[i] = highs[i] - lows[i];
      } else {
        const hl = highs[i] - lows[i];
        const hc = Math.abs(highs[i] - closes[i - 1]);
        const lc = Math.abs(lows[i] - closes[i - 1]);
        tr[i] = Math.max(hl, hc, lc);
      }
    }
  
    const out = new Array(closes.length).fill(null);
    let sum = 0;
    
    for (let i = 0; i < tr.length; i++) {
      if (i < period) {
        sum += tr[i];
        if (i === period - 1) out[i] = sum / period;
      } else {
        out[i] = ((out[i - 1] * (period - 1)) + tr[i]) / period;
      }
    }
    
    return out;
  }
  
  export function macd(closes, fast, slow, signal) {
    const fastE = ema(closes, fast);
    const slowE = ema(closes, slow);
    const macdLine = new Array(closes.length).fill(null);
  
    for (let i = 0; i < closes.length; i++) {
      if (fastE[i] == null || slowE[i] == null) continue;
      macdLine[i] = fastE[i] - slowE[i];
    }
  
    const sigLine = new Array(closes.length).fill(null);
    const k = 2 / (signal + 1);
    let seeded = false;
    let prev = 0;
    let seedBuf = [];
  
    for (let i = 0; i < macdLine.length; i++) {
      const v = macdLine[i];
      if (v == null) continue;
      
      if (!seeded) {
        seedBuf.push(v);
        if (seedBuf.length === signal) {
          prev = seedBuf.reduce((a, x) => a + x, 0) / signal;
          sigLine[i] = prev;
          seeded = true;
        }
      } else {
        prev = (v - prev) * k + prev;
        sigLine[i] = prev;
      }
    }
  
    const hist = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
      if (macdLine[i] == null || sigLine[i] == null) continue;
      hist[i] = macdLine[i] - sigLine[i];
    }
  
    return { macdLine, sigLine, hist };
  }
  
  export function bollingerBands(closes, period, stdDev) {
    const middle = sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
  
    for (let i = period - 1; i < closes.length; i++) {
      if (middle[i] === null) continue;
      
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += Math.pow(closes[j] - middle[i], 2);
      }
      const std = Math.sqrt(sum / period);
      
      upper[i] = middle[i] + stdDev * std;
      lower[i] = middle[i] - stdDev * std;
    }
  
    return { upper, middle, lower };
  }
  
  export function stochastic(highs, lows, closes, kPeriod, dPeriod, smooth) {
    const length = closes.length;
    const rawK = new Array(length).fill(null);
    const k = new Array(length).fill(null);
    const d = new Array(length).fill(null);
  
    // Calculate raw %K
    for (let i = kPeriod - 1; i < length; i++) {
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      
      for (let j = i - kPeriod + 1; j <= i; j++) {
        highestHigh = Math.max(highestHigh, highs[j]);
        lowestLow = Math.min(lowestLow, lows[j]);
      }
      
      const range = highestHigh - lowestLow;
      rawK[i] = range === 0 ? 50 : ((closes[i] - lowestLow) / range) * 100;
    }
  
    // Smooth %K
    const smoothedK = sma(rawK.map(v => v ?? 0), smooth);
    for (let i = 0; i < length; i++) {
      if (rawK[i] !== null && i >= kPeriod + smooth - 2) {
        k[i] = smoothedK[i];
      }
    }
  
    // Calculate %D (SMA of %K)
    const dValues = sma(k.map(v => v ?? 0), dPeriod);
    for (let i = 0; i < length; i++) {
      if (k[i] !== null && i >= kPeriod + smooth + dPeriod - 3) {
        d[i] = dValues[i];
      }
    }
  
    return { k, d };
  }
  
  export function cci(highs, lows, closes, period) {
    const length = closes.length;
    const out = new Array(length).fill(null);
    const tp = new Array(length);
  
    // Calculate typical price
    for (let i = 0; i < length; i++) {
      tp[i] = (highs[i] + lows[i] + closes[i]) / 3;
    }
  
    // Calculate CCI
    for (let i = period - 1; i < length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += tp[j];
      }
      const smaTP = sum / period;
  
      let meanDev = 0;
      for (let j = i - period + 1; j <= i; j++) {
        meanDev += Math.abs(tp[j] - smaTP);
      }
      meanDev /= period;
  
      out[i] = meanDev === 0 ? 0 : (tp[i] - smaTP) / (0.015 * meanDev);
    }
  
    return out;
  }
  
  export function adx(highs, lows, closes, period) {
    const length = closes.length;
    const out = new Array(length).fill(null);
    
    if (length < period + 1) return out;
  
    const tr = new Array(length).fill(0);
    const plusDM = new Array(length).fill(0);
    const minusDM = new Array(length).fill(0);
  
    // Calculate TR, +DM, -DM
    for (let i = 1; i < length; i++) {
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];
  
      plusDM[i] = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
      minusDM[i] = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
  
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(hl, hc, lc);
    }
  
    // Smooth TR, +DM, -DM using Wilder's smoothing
    let smoothTR = 0;
    let smoothPlusDM = 0;
    let smoothMinusDM = 0;
  
    for (let i = 1; i <= period; i++) {
      smoothTR += tr[i];
      smoothPlusDM += plusDM[i];
      smoothMinusDM += minusDM[i];
    }
  
    const dx = new Array(length).fill(null);
  
    for (let i = period; i < length; i++) {
      if (i > period) {
        smoothTR = smoothTR - (smoothTR / period) + tr[i];
        smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
        smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];
      }
  
      const plusDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
      const minusDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
      const diSum = plusDI + minusDI;
      dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
    }
  
    // Calculate ADX as smoothed DX
    let adxSum = 0;
    for (let i = period; i < period * 2 && i < length; i++) {
      adxSum += dx[i] || 0;
    }
  
    if (period * 2 - 1 < length) {
      out[period * 2 - 1] = adxSum / period;
    }
  
    for (let i = period * 2; i < length; i++) {
      const prevADX = out[i - 1] || 0;
      out[i] = ((prevADX * (period - 1)) + (dx[i] || 0)) / period;
    }
  
    return out;
  }
  
  export function obv(closes, volumes) {
    const length = closes.length;
    const out = new Array(length).fill(null);
    
    if (length === 0) return out;
    
    out[0] = volumes[0];
    
    for (let i = 1; i < length; i++) {
      if (closes[i] > closes[i - 1]) {
        out[i] = out[i - 1] + volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        out[i] = out[i - 1] - volumes[i];
      } else {
        out[i] = out[i - 1];
      }
    }
    
    return out;
  }
  
  export function vwap(highs, lows, closes, volumes) {
    const length = closes.length;
    const out = new Array(length).fill(null);
    
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    
    for (let i = 0; i < length; i++) {
      const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
      cumulativeTPV += typicalPrice * volumes[i];
      cumulativeVolume += volumes[i];
      
      out[i] = cumulativeVolume === 0 ? null : cumulativeTPV / cumulativeVolume;
    }
    
    return out;
  }
  