from __future__ import annotations

from datetime import date
from typing import Dict, List

from ib_insync import IB

from src.common.schemas import RunConfig
from src.engine.types import Bar
from src.ib.contracts import ContractKey, resolve_stock_contract
from src.ib.history import fetch_historical_bars

from src.data.ib_window import compute_window
from src.storage.ib_cache import get_coverage, read_bars, upsert_bars


import logging
log = logging.getLogger(__name__)


DEFAULT_EXCHANGE = "SMART"
DEFAULT_CURRENCY = "USD"


def _connect_ib(cfg: RunConfig) -> IB:
    ib = IB()
    ib.connect(
        host=cfg.data.ib_host,
        port=cfg.data.ib_port,
        clientId=cfg.data.ib_client_id,
        timeout=10,
    )
    if not ib.isConnected():
        raise RuntimeError("Failed to connect to IB")
    return ib


def load_daily_ib(symbol: str, cfg: RunConfig) -> Dict[date, Bar]:
    """
    Cached IB loader.

    Always returns Dict[date, Bar] (same as load_daily_csv).
    Uses Postgres cache table ib_daily_bars:
      - If cache covers [start..end] => read from DB only
      - Else fetch from IB, upsert to DB, then read from DB
    """
    start, end = compute_window(cfg.data.duration, cfg.data.end_datetime)
    log.info(
        "IB load start symbol=%s window=%s..%s duration=%s",
        symbol, start, end, cfg.data.duration
    )

    bar_size = cfg.data.bar_size
    what_to_show = cfg.data.what_to_show
    use_rth = cfg.data.use_rth
    exchange = DEFAULT_EXCHANGE
    currency = DEFAULT_CURRENCY

    cov = get_coverage(symbol, bar_size, what_to_show, use_rth, exchange, currency)
    cache_hit = False

    if cov:
        mn, mx = cov
        cache_hit = (mn <= start and mx >= end)
    log.info(
        "IB cache decision symbol=%s cache_hit=%s coverage=%s",
        symbol, cache_hit, cov
    )

    if not cache_hit:
        # Fetch from IB and upsert
        ib = _connect_ib(cfg)
        try:
            contract = resolve_stock_contract(ib, ContractKey(symbol=symbol))
            df = fetch_historical_bars(
                ib=ib,
                contract=contract,
                bar_size=bar_size,
                duration=cfg.data.duration,
                what_to_show=what_to_show,
                use_rth=use_rth,
                end_datetime=cfg.data.end_datetime,
            )

            bars: List[Bar] = []
            for _, r in df.iterrows():
                d: date = r["time"].date()
                bars.append(
                    Bar(
                        symbol=symbol,
                        d=d,
                        open=float(r["open"]),
                        high=float(r["high"]),
                        low=float(r["low"]),
                        close=float(r["close"]),
                        volume=float(r.get("volume", 0.0) or 0.0),
                    )
                )

            if not bars:
                raise RuntimeError(f"IB returned 0 bars for {symbol}")
            
            log.info(
                "IB upserting symbol=%s bars=%d",
                symbol, len(bars)
            ) 
            upsert_bars(symbol, bars, bar_size, what_to_show, use_rth, exchange, currency)
            log.info("IB upsert completed symbol=%s", symbol)


        finally:
            try:
                ib.disconnect()
            except Exception:
                pass
    log.warning("CACHE_DECISION %s cache_hit=%s coverage=%s window=%s..%s", symbol, cache_hit, cov, start, end)

    # Read from DB for consistent output
    out = read_bars(symbol, start, end, bar_size, what_to_show, use_rth, exchange, currency)
    if not out:
        raise RuntimeError(f"Cache read returned 0 bars for {symbol} ({start}..{end})")
    return out
