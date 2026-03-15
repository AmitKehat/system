from __future__ import annotations

import pandas as pd
from ib_insync import IB, Contract, util


def fetch_historical_bars(
    ib: IB,
    contract: Contract,
    bar_size: str,
    duration: str,
    what_to_show: str,
    use_rth: bool,
    end_datetime: str | None,
) -> pd.DataFrame:
    """
    Returns DataFrame with columns:
    time, open, high, low, close, volume
    """
    bars = ib.reqHistoricalData(
        contract,
        endDateTime=end_datetime or "",
        durationStr=duration,
        barSizeSetting=bar_size,
        whatToShow=what_to_show,
        useRTH=use_rth,
        formatDate=1,
        keepUpToDate=False,
    )
    if not bars:
        raise RuntimeError("No historical bars returned from IB")

    df = util.df(bars)
    # util.df returns date column name 'date'
    df = df.rename(columns={"date": "time"})
    # Normalize to expected columns
    keep = ["time", "open", "high", "low", "close", "volume"]
    for col in keep:
        if col not in df.columns:
            # volume may be missing for some whatToShow; handle gracefully
            if col == "volume":
                df["volume"] = 0
            else:
                raise RuntimeError(f"Missing column '{col}' in IB bar dataframe")

    df = df[keep].copy()
    # Ensure datetime
    df["time"] = pd.to_datetime(df["time"], utc=True, errors="coerce")
    if df["time"].isna().any():
        raise RuntimeError("IB returned bars with invalid timestamps")

    # Convert to naive UTC or keep tz-aware; your engine likely uses date alignment
    return df
