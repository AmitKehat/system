from __future__ import annotations

from datetime import date
from typing import Dict, Iterable, Optional, Tuple

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert

from src.engine.types import Bar
from src.storage.db import get_session
from src.storage.models import IBDailyBar


def get_coverage(
    symbol: str,
    bar_size: str,
    what_to_show: str,
    use_rth: bool,
    exchange: str,
    currency: str,
) -> Optional[Tuple[date, date]]:
    s = get_session()
    try:
        q = select(func.min(IBDailyBar.d), func.max(IBDailyBar.d)).where(
            and_(
                IBDailyBar.symbol == symbol,
                IBDailyBar.bar_size == bar_size,
                IBDailyBar.what_to_show == what_to_show,
                IBDailyBar.use_rth == use_rth,
                IBDailyBar.exchange == exchange,
                IBDailyBar.currency == currency,
            )
        )
        mn, mx = s.execute(q).one()
        if mn is None or mx is None:
            return None
        return mn, mx
    finally:
        s.close()


def read_bars(
    symbol: str,
    start: date,
    end: date,
    bar_size: str,
    what_to_show: str,
    use_rth: bool,
    exchange: str,
    currency: str,
) -> Dict[date, Bar]:
    s = get_session()
    try:
        q = (
            select(IBDailyBar)
            .where(
                and_(
                    IBDailyBar.symbol == symbol,
                    IBDailyBar.d >= start,
                    IBDailyBar.d <= end,
                    IBDailyBar.bar_size == bar_size,
                    IBDailyBar.what_to_show == what_to_show,
                    IBDailyBar.use_rth == use_rth,
                    IBDailyBar.exchange == exchange,
                    IBDailyBar.currency == currency,
                )
            )
            .order_by(IBDailyBar.d.asc())
        )
        rows = s.execute(q).scalars().all()

        out: Dict[date, Bar] = {}
        for r in rows:
            out[r.d] = Bar(
                symbol=r.symbol,
                d=r.d,
                open=r.open,
                high=r.high,
                low=r.low,
                close=r.close,
                volume=r.volume,
            )
        return out
    finally:
        s.close()


def upsert_bars(
    symbol: str,
    bars: Iterable[Bar],
    bar_size: str,
    what_to_show: str,
    use_rth: bool,
    exchange: str,
    currency: str,
) -> None:
    values = []
    for b in bars:
        values.append(
            dict(
                symbol=symbol,
                d=b.d,
                bar_size=bar_size,
                what_to_show=what_to_show,
                use_rth=use_rth,
                exchange=exchange,
                currency=currency,
                open=b.open,
                high=b.high,
                low=b.low,
                close=b.close,
                volume=b.volume,
            )
        )
    if not values:
        return

    stmt = insert(IBDailyBar).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_ib_daily_bar_key",
        set_={
            "open": stmt.excluded.open,
            "high": stmt.excluded.high,
            "low": stmt.excluded.low,
            "close": stmt.excluded.close,
            "volume": stmt.excluded.volume,
        },
    )

    s = get_session()
    try:
        s.execute(stmt)
        s.commit()
    finally:
        s.close()
