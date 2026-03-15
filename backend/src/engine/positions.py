from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Tuple

from .types import Fill, Prices


@dataclass(frozen=True)
class OpenPosition:
    symbol: str
    qty: int
    avg_cost: float
    last_price: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


def compute_open_positions(fills: List[Fill], last_prices: Prices) -> List[OpenPosition]:
    """
    Builds current open positions and avg cost from fills (long-only, FIFO for inventory reduction).
    Avg cost is maintained using weighted average for buys; sells reduce qty but keep avg cost.
    """
    qty: Dict[str, int] = {}
    avg_cost: Dict[str, float] = {}

    for f in fills:
        sym = f.symbol
        cur_qty = qty.get(sym, 0)
        cur_avg = avg_cost.get(sym, 0.0)

        if f.qty > 0:
            # Weighted average update on buys
            new_qty = cur_qty + f.qty
            total_cost = cur_avg * cur_qty + f.price * f.qty
            new_avg = total_cost / new_qty if new_qty != 0 else 0.0
            qty[sym] = new_qty
            avg_cost[sym] = new_avg
        else:
            # Sell reduces quantity (long-only)
            new_qty = cur_qty + f.qty  # f.qty is negative
            if new_qty < 0:
                raise ValueError(f"Sell exceeds position for {sym}. Short not supported yet.")
            qty[sym] = new_qty
            if new_qty == 0:
                avg_cost[sym] = 0.0

    out: List[OpenPosition] = []
    for sym, q in qty.items():
        if q == 0:
            continue
        if sym not in last_prices:
            raise ValueError(f"Missing last price for open position {sym}")

        lp = last_prices[sym]
        ac = avg_cost.get(sym, 0.0)
        upnl = (lp - ac) * q
        upnl_pct = (lp / ac - 1.0) if ac > 0 else 0.0

        out.append(
            OpenPosition(
                symbol=sym,
                qty=q,
                avg_cost=ac,
                last_price=lp,
                unrealized_pnl=upnl,
                unrealized_pnl_pct=upnl_pct,
            )
        )

    # Sort by largest absolute PnL
    out.sort(key=lambda x: abs(x.unrealized_pnl), reverse=True)
    return out
