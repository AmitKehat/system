from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Tuple

from .types import Fill

EPS = 1e-10


@dataclass(frozen=True)
class ClosedTrade:
    symbol: str
    entry_date: date
    exit_date: date
    qty: float

    entry_price: float
    exit_price: float

    pnl: float
    pnl_pct: float  # pnl / (entry_price * qty)


def build_closed_trades_fifo(fills: List[Fill]) -> List[ClosedTrade]:
    """
    Reconstruct realized trades using FIFO lots.
    Long-only version (no shorts), now supports fractional shares (qty is float).
    """
    # sym -> list of open lots: (entry_date, qty, entry_price)
    open_lots: Dict[str, List[Tuple[date, float, float]]] = {}
    closed: List[ClosedTrade] = []

    for f in fills:
        sym = f.symbol
        if sym == "CASH":
            continue  # ignore cash "fills" if they ever appear

        if sym not in open_lots:
            open_lots[sym] = []

        if f.qty > EPS:
            # Buy => open a lot
            open_lots[sym].append((f.d, float(f.qty), float(f.price)))
            continue

        if f.qty < -EPS:
            sell_qty = float(-f.qty)
            lots = open_lots[sym]

            while sell_qty > EPS:
                if not lots:
                    raise ValueError(f"Sell without inventory for {sym} on {f.d}. Short not supported yet.")

                entry_d, entry_q, entry_p = lots[0]
                take = min(entry_q, sell_qty)

                pnl = (f.price - entry_p) * take
                pnl_pct = pnl / (entry_p * take) if entry_p > EPS else 0.0

                closed.append(
                    ClosedTrade(
                        symbol=sym,
                        entry_date=entry_d,
                        exit_date=f.d,
                        qty=take,
                        entry_price=entry_p,
                        exit_price=float(f.price),
                        pnl=pnl,
                        pnl_pct=pnl_pct,
                    )
                )

                # reduce the lot
                entry_q -= take
                sell_qty -= take

                if entry_q <= EPS:
                    lots.pop(0)
                else:
                    lots[0] = (entry_d, entry_q, entry_p)

    return closed
