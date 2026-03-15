from __future__ import annotations
from dataclasses import asdict
from typing import List
import csv

from .types import Fill
from .trades import ClosedTrade


def export_fills_csv(fills: List[Fill], path: str) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["symbol", "d", "qty", "price"])
        w.writeheader()
        for x in fills:
            w.writerow({"symbol": x.symbol, "d": x.d.isoformat(), "qty": x.qty, "price": x.price})


def export_trades_csv(trades: List[ClosedTrade], path: str) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["symbol", "entry_date", "exit_date", "qty", "entry_price", "exit_price", "pnl", "pnl_pct"],
        )
        w.writeheader()
        for t in trades:
            w.writerow(
                {
                    "symbol": t.symbol,
                    "entry_date": t.entry_date.isoformat(),
                    "exit_date": t.exit_date.isoformat(),
                    "qty": t.qty,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "pnl": t.pnl,
                    "pnl_pct": t.pnl_pct,
                }
            )

from .contribution import SymbolContribution

def export_contrib_csv(contrib: list[SymbolContribution], path: str) -> None:
    import csv
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["symbol", "realized_pnl", "unrealized_pnl", "total_pnl"])
        w.writeheader()
        for c in contrib:
            w.writerow(
                {
                    "symbol": c.symbol,
                    "realized_pnl": c.realized_pnl,
                    "unrealized_pnl": c.unrealized_pnl,
                    "total_pnl": c.total_pnl,
                }
            )
