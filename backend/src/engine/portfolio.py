from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List
from .types import Fill, Prices


@dataclass
class Portfolio:
    cash: float
    positions: Dict[str, float] = field(default_factory=dict)
    fills: List[Fill] = field(default_factory=list)
    equity_curve: List[float] = field(default_factory=list)
    commission_paid: float = 0.0
    slippage_cost: float = 0.0


    def apply_fill(self, fill: Fill) -> None:
        self.positions[fill.symbol] = self.positions.get(fill.symbol, 0) + fill.qty
        self.cash -= fill.qty * fill.price
        self.fills.append(fill)

    def equity(self, prices: Prices) -> float:
        eq = self.cash
        for sym, qty in self.positions.items():
            if qty == 0:
                continue
            if sym not in prices:
                raise ValueError(f"Missing price for {sym}")
            eq += qty * prices[sym]
        return eq
    
    def apply_commission(self, amount: float) -> None:
        self.cash -= amount
        self.commission_paid += amount

    def apply_slippage_cost(self, amount: float) -> None:
        self.slippage_cost += amount


