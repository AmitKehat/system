from __future__ import annotations
from typing import List
from datetime import date as DateType

from .types import Order, Fill, Prices
from .costs import ExecutionCosts


class BrokerSim:
    """
    Broker simulation:
    - market orders filled at given price snapshot +/- slippage
    - commission applied per order
    """

    def __init__(self, costs: ExecutionCosts | None = None) -> None:
        self.costs = costs or ExecutionCosts()

    def _apply_slippage(self, mid_price: float, qty: float, symbol: str) -> float:
        if symbol == "CASH":
            return mid_price
        slip = (self.costs.slippage_bps / 10_000.0)
        return mid_price * (1.0 + slip) if qty > 0 else mid_price * (1.0 - slip)

    def _commission_for_order(self, qty: float, symbol: str) -> float:
        if symbol == "CASH":
            return 0.0
        shares = abs(qty)
        c = shares * self.costs.commission_per_share
        return max(c, self.costs.commission_min_per_order) if shares > 0 else 0.0

    def fill_orders(self, orders: List[Order], prices: Prices, exec_date: DateType | None = None) -> List[Fill]:
        """
        Create fills for the given orders using the provided price snapshot.
        exec_date: if provided, Fill.d will be this date (important for next-day execution).
        """
        fills: List[Fill] = []
        d = exec_date

        for o in orders:
            if o.symbol not in prices:
                raise ValueError(f"Missing price for {o.symbol} on execution date {d or o.d}")

            mid = prices[o.symbol]
            exec_price = self._apply_slippage(mid, o.qty, o.symbol)
            fills.append(Fill(symbol=o.symbol, qty=o.qty, price=exec_price, d=(d or o.d)))

        return fills

    def commissions_by_day(self, orders: List[Order]) -> float:
        # Commission charged per order
        return sum(self._commission_for_order(o.qty, o.symbol) for o in orders)

    def estimate_slippage_cost(self, symbol: str, qty: float, mid_price: float, exec_price: float) -> float:
        if symbol == "CASH":
            return 0.0
        return abs(qty) * abs(exec_price - mid_price)
