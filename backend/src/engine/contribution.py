from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List

from .trades import ClosedTrade
from .positions import OpenPosition


@dataclass(frozen=True)
class SymbolContribution:
    symbol: str
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float


def compute_symbol_contributions(
    closed_trades: List[ClosedTrade],
    open_positions: List[OpenPosition],
) -> List[SymbolContribution]:
    realized: Dict[str, float] = {}
    unrealized: Dict[str, float] = {}

    for t in closed_trades:
        realized[t.symbol] = realized.get(t.symbol, 0.0) + t.pnl

    for p in open_positions:
        unrealized[p.symbol] = unrealized.get(p.symbol, 0.0) + p.unrealized_pnl

    symbols = set(realized.keys()) | set(unrealized.keys())
    out: List[SymbolContribution] = []
    for sym in symbols:
        r = realized.get(sym, 0.0)
        u = unrealized.get(sym, 0.0)
        out.append(SymbolContribution(symbol=sym, realized_pnl=r, unrealized_pnl=u, total_pnl=r + u))

    # Sort by absolute impact
    out.sort(key=lambda x: abs(x.total_pnl), reverse=True)
    return out
