from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Dict, List

from .types import Bar, Order, Prices
from .portfolio import Portfolio
from .broker_sim import BrokerSim
from .strategy import Strategy
from .costs import ExecutionCosts
from .execution import ExecutionPolicy
from .trades import build_closed_trades_fifo


@dataclass
class BacktestResult:
    portfolio: Portfolio
    daily_prices: List[tuple[date, Prices]]
    equity_by_date: List[tuple[date, float]]
    closed_trades: list


def target_to_orders(
    portfolio: Portfolio,
    target_weights: Dict[str, float],
    prices: Prices,
    d: date,
    policy: ExecutionPolicy,
) -> List[Order]:
    if not target_weights:
        return []

    total_w = sum(target_weights.values())
    if abs(total_w - 1.0) > 1e-6:
        raise ValueError(f"Target weights must sum to 1.0, got {total_w}")

    equity = portfolio.equity(prices)
    orders: List[Order] = []

    # Current weights
    cur_weights: Dict[str, float] = {}
    for sym, qty in portfolio.positions.items():
        if abs(qty) < 1e-12:
            continue
        cur_weights[sym] = (qty * prices[sym]) / equity

    # Desired shares (fractional)
    desired_shares: Dict[str, float] = {}
    for sym, w in target_weights.items():
        desired_value = equity * w
        desired_shares[sym] = desired_value / prices[sym]

    all_syms = set(portfolio.positions.keys()) | set(desired_shares.keys())

    # IMPORTANT: deterministic order
    for sym in sorted(all_syms):
        cur_qty = portfolio.positions.get(sym, 0.0)
        des_qty = desired_shares.get(sym, 0.0)

        cur_w = cur_weights.get(sym, 0.0)
        tgt_w = target_weights.get(sym, 0.0)

        if abs(cur_w - tgt_w) < policy.rebalance_threshold:
            continue

        delta_full = des_qty - cur_qty
        delta = delta_full * policy.rebalance_strength

        if abs(delta) < 1e-8:
            continue

        # Skip tiny orders
        if sym != "CASH":
            notional = abs(delta) * prices[sym]
            if notional < policy.min_order_notional:
                continue

        # NOTE: Order.d is the "signal day" (when we decided to trade)
        orders.append(Order(symbol=sym, qty=delta, d=d))

    return orders


def _execute_orders(
    broker: BrokerSim,
    pf: Portfolio,
    orders: List[Order],
    exec_prices: Prices,
    exec_date: date,
) -> None:
    """
    Executes the given orders using exec_prices, applies commission, logs slippage estimate,
    and applies fills to portfolio. (Fill price includes slippage already.)
    """
    if not orders:
        return

    # Commission (real cash outflow)
    commission = broker.commissions_by_day(orders)
    if commission:
        pf.apply_commission(commission)

    # Fills at executed price
    fills = broker.fill_orders(orders, exec_prices, exec_date=exec_date)

    # Slippage estimate (diagnostic metric)
    for f in fills:
        mid = exec_prices[f.symbol]
        slip_cost = broker.estimate_slippage_cost(
            f.symbol, f.qty, mid_price=mid, exec_price=f.price
        )
        if slip_cost:
            pf.apply_slippage_cost(slip_cost)

    # Apply fills to portfolio
    for f in fills:
        pf.apply_fill(f)


def run_backtest(
    bars_by_date: Dict[date, Dict[str, Bar]],
    strategy: Strategy,
    starting_cash: float = 100_000.0,
    costs: ExecutionCosts | None = None,
    policy: ExecutionPolicy | None = None,
) -> BacktestResult:
    broker = BrokerSim(costs=costs)
    pf = Portfolio(cash=starting_cash)
    policy = policy or ExecutionPolicy()

    daily_prices: List[tuple[date, Prices]] = []
    equity_by_date: List[tuple[date, float]] = []

    # Ensure equity curve starts empty; we will append daily
    pf.equity_curve = []

    # NEW: pending orders for next-day execution
    pending_orders: List[Order] = []

    for d in sorted(bars_by_date.keys()):
        bars = bars_by_date[d]

        # Close prices for marking / targets
        close_prices: Prices = {sym: b.close for sym, b in bars.items()}
        close_prices["CASH"] = 1.0

        # Open prices for next-day execution
        open_prices: Prices = {sym: b.open for sym, b in bars.items()}
        open_prices["CASH"] = 1.0

        if policy.execute_on == "next_open":
            # 1) Execute yesterday's pending orders at today's open
            _execute_orders(
                broker=broker,
                pf=pf,
                orders=pending_orders,
                exec_prices=open_prices,
                exec_date=d,
            )
            pending_orders = []

            # 2) Generate today's targets at close, create orders for tomorrow
            targets = strategy.on_day_close(d, bars)
            pending_orders = target_to_orders(pf, targets, close_prices, d, policy=policy)

            # 3) End-of-day marking uses close
            daily_prices.append((d, close_prices))
            eq = pf.equity(close_prices)
            pf.equity_curve.append(eq)
            equity_by_date.append((d, eq))

        else:
            # "close" execution (current behavior): decide and execute on same close
            targets = strategy.on_day_close(d, bars)
            orders = target_to_orders(pf, targets, close_prices, d, policy=policy)

            _execute_orders(
                broker=broker,
                pf=pf,
                orders=orders,
                exec_prices=close_prices,
                exec_date=d,
            )

            daily_prices.append((d, close_prices))
            eq = pf.equity(close_prices)
            pf.equity_curve.append(eq)
            equity_by_date.append((d, eq))

    # Any pending orders after final day are not executed (correct for next_open)
    closed_trades = build_closed_trades_fifo(pf.fills)

    return BacktestResult(
        portfolio=pf,
        daily_prices=daily_prices,
        equity_by_date=equity_by_date,
        closed_trades=closed_trades,
    )
