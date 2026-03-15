from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, List
import random

from src.engine.types import Bar


def generate_synthetic_daily_bars(
    symbols: List[str],
    start: date,
    days: int,
    seed: int = 1,
    start_price: float = 100.0,
) -> Dict[date, Dict[str, Bar]]:
    """
    Generates synthetic OHLCV daily bars for multiple symbols.
    - Uses a simple random walk with slight symbol-specific drift.
    - Output format matches engine.backtest.run_backtest input: bars_by_date[date][symbol] = Bar(...)
    """
    rng = random.Random(seed)

    # per-symbol starting price and drift
    prices = {s: start_price * (0.8 + 0.4 * rng.random()) for s in symbols}
    drift = {s: (rng.random() - 0.45) * 0.002 for s in symbols}  # small +/- drift

    out: Dict[date, Dict[str, Bar]] = {}
    d = start

    for _ in range(days):
        day_bars: Dict[str, Bar] = {}
        for s in symbols:
            prev = prices[s]

            # daily return = drift + noise
            noise = rng.gauss(0.0, 0.01)  # ~1% daily volatility
            ret = drift[s] + noise
            close = max(1.0, prev * (1.0 + ret))

            # simple OHLC around prev/close
            o = prev
            high = max(o, close) * (1.0 + abs(rng.gauss(0.0, 0.003)))
            low = min(o, close) * (1.0 - abs(rng.gauss(0.0, 0.003)))
            vol = int(1_000_000 * (0.5 + rng.random()))

            day_bars[s] = Bar(
                symbol=s,
                d=d,
                open=float(o),
                high=float(high),
                low=float(low),
                close=float(close),
                volume=float(vol),
            )

            prices[s] = close

        out[d] = day_bars
        d = d + timedelta(days=1)

    return out
