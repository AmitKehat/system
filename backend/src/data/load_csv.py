from __future__ import annotations
from datetime import date
from typing import Dict
import pandas as pd
from src.engine.types import Bar


def load_daily_csv(symbol: str, path: str) -> Dict[date, Bar]:
    """
    CSV expected columns: Date, Open, High, Low, Close, Volume
    Date can be YYYY-MM-DD.
    """
    df = pd.read_csv(path)
    df["Date"] = pd.to_datetime(df["Date"]).dt.date

    out: Dict[date, Bar] = {}
    for _, r in df.iterrows():
        d = r["Date"]
        out[d] = Bar(
            symbol=symbol,
            d=d,
            open=float(r["Open"]),
            high=float(r["High"]),
            low=float(r["Low"]),
            close=float(r["Close"]),
            volume=float(r.get("Volume", 0.0)),
        )
    return out


def align_by_date(*series: Dict[date, Bar]) -> Dict[date, Dict[str, Bar]]:
    """
    Merge symbols by common dates only (intersection).
    """
    common = set(series[0].keys())
    for s in series[1:]:
        common &= set(s.keys())

    merged: Dict[date, Dict[str, Bar]] = {}
    for d in sorted(common):
        merged[d] = {bars.symbol: bars for bars in (s[d] for s in series)}
    return merged
