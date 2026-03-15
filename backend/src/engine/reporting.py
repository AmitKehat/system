from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import sqrt
from typing import List, Dict

import matplotlib.pyplot as plt

from .backtest import BacktestResult
from .types import Fill
from .trades import ClosedTrade
from .positions import compute_open_positions, OpenPosition
from .contribution import compute_symbol_contributions, SymbolContribution


@dataclass(frozen=True)
class Report:
    start_date: date
    end_date: date
    start_equity: float
    end_equity: float

    total_return: float
    cagr: float
    max_drawdown: float

    daily_vol: float
    sharpe: float  # simple Sharpe using daily returns, rf=0

    turnover: float
    fills: int
    win_rate: float  # simple approximation

    trades: int
    avg_win: float
    avg_loss: float
    profit_factor: float
    expectancy: float

    open_positions: List[OpenPosition]
    total_unrealized_pnl: float

    contributions: List[SymbolContribution]

    total_commission: float
    slippage_estimate: float
    commission_pct_of_start: float


def _pct_returns(equity: List[float]) -> List[float]:
    rets: List[float] = []
    for i in range(1, len(equity)):
        prev = equity[i - 1]
        cur = equity[i]
        if prev <= 0:
            rets.append(0.0)
        else:
            rets.append(cur / prev - 1.0)
    return rets


def _max_drawdown(equity: List[float]) -> float:
    peak = float("-inf")
    mdd = 0.0
    for e in equity:
        if e > peak:
            peak = e
        if peak > 0:
            dd = e / peak - 1.0
            if dd < mdd:
                mdd = dd
    return mdd  # negative number (e.g., -0.32)


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _stdev(xs: List[float]) -> float:
    if len(xs) < 2:
        return 0.0
    mu = _mean(xs)
    var = sum((x - mu) ** 2 for x in xs) / (len(xs) - 1)
    return sqrt(var)


def _turnover(fills: List[Fill], avg_equity: float) -> float:
    if avg_equity <= 0:
        return 0.0
    traded_value = sum(abs(f.qty) * f.price for f in fills)
    return traded_value / avg_equity


def _simple_win_rate(portfolio_fills: List[Fill]) -> float:
    """
    Approx win-rate using avg-cost per symbol:
    Count "wins" on SELL fills where sell_price > avg_cost at that moment.
    Rough proxy; true win-rate uses closed trades.
    """
    avg_cost: Dict[str, float] = {}
    pos: Dict[str, float] = {}
    wins = 0
    sells = 0

    for f in portfolio_fills:
        sym = f.symbol
        cur_pos = pos.get(sym, 0.0)

        if f.qty > 0:
            total_cost = avg_cost.get(sym, 0.0) * cur_pos
            new_total_cost = total_cost + f.qty * f.price
            new_pos = cur_pos + f.qty
            avg_cost[sym] = new_total_cost / new_pos if new_pos != 0 else 0.0
            pos[sym] = new_pos
        elif f.qty < 0:
            if cur_pos > 0:
                sells += 1
                if f.price > avg_cost.get(sym, f.price):
                    wins += 1
            pos[sym] = cur_pos + f.qty
            if abs(pos[sym]) < 1e-12:
                avg_cost[sym] = 0.0

    return (wins / sells) if sells > 0 else 0.0


def build_report(result: BacktestResult) -> Report:
    # Use the authoritative time series
    if not result.equity_by_date or len(result.equity_by_date) < 2:
        raise ValueError("Not enough data points to build report")

    dates = [d for (d, _) in result.equity_by_date]
    equity = [e for (_, e) in result.equity_by_date]

    start_date = dates[0]
    end_date = dates[-1]
    start_equity = equity[0]
    end_equity = equity[-1]

    total_commission = result.portfolio.commission_paid
    slippage_estimate = result.portfolio.slippage_cost  # diagnostic only
    commission_pct_of_start = (total_commission / start_equity) if start_equity > 0 else 0.0

    total_return = (end_equity / start_equity - 1.0) if start_equity > 0 else 0.0

    days = (end_date - start_date).days
    years = max(days / 365.25, 1e-9)
    cagr = (end_equity / start_equity) ** (1.0 / years) - 1.0 if start_equity > 0 else 0.0

    mdd = _max_drawdown(equity)

    rets = _pct_returns(equity)
    mu = _mean(rets)
    vol = _stdev(rets)
    sharpe = (mu / vol) * sqrt(252) if vol > 0 else 0.0

    avg_eq = _mean(equity)
    turnover = _turnover(result.portfolio.fills, avg_eq)

    # Use closed trades computed once in backtest
    closed: List[ClosedTrade] = list(result.closed_trades)

    # Open positions from last available prices
    last_prices = result.daily_prices[-1][1]
    open_positions = compute_open_positions(result.portfolio.fills, last_prices)
    contributions = compute_symbol_contributions(closed, open_positions)
    total_unrealized = sum(p.unrealized_pnl for p in open_positions)

    # Trade stats
    win_rate_from_closed, avg_win, avg_loss, profit_factor, expectancy = _trade_stats(closed)

    # Keep your original win rate proxy (or swap to win_rate_from_closed if you prefer)
    win_rate = _simple_win_rate(result.portfolio.fills)

    return Report(
        start_date=start_date,
        end_date=end_date,
        start_equity=start_equity,
        end_equity=end_equity,
        total_return=total_return,
        cagr=cagr,
        max_drawdown=mdd,
        daily_vol=vol,
        sharpe=sharpe,
        turnover=turnover,
        fills=len(result.portfolio.fills),
        win_rate=win_rate,
        trades=len(closed),
        avg_win=avg_win,
        avg_loss=avg_loss,
        profit_factor=profit_factor,
        expectancy=expectancy,
        open_positions=open_positions,
        total_unrealized_pnl=total_unrealized,
        contributions=contributions,
        total_commission=total_commission,
        slippage_estimate=slippage_estimate,
        commission_pct_of_start=commission_pct_of_start,
    )


def save_equity_plot(result: BacktestResult, out_png: str) -> None:
    if not result.equity_by_date:
        raise ValueError("No equity_by_date in result")

    dates = [d for (d, _) in result.equity_by_date]
    equity = [e for (_, e) in result.equity_by_date]

    plt.figure()
    plt.plot(dates, equity)
    plt.title("Equity Curve")
    plt.xlabel("Date")
    plt.ylabel("Equity")
    plt.tight_layout()
    plt.savefig(out_png, dpi=150)
    plt.close()


def print_report(r: Report) -> None:
    def pct(x: float) -> str:
        return f"{x*100:.2f}%"

    print("\n=== Backtest Report ===")
    print(f"Period: {r.start_date} → {r.end_date}")
    print(f"Start equity: {r.start_equity:,.2f}")
    print(f"End equity:   {r.end_equity:,.2f}")
    print(f"Total return: {pct(r.total_return)}")
    print(f"CAGR:         {pct(r.cagr)}")
    print(f"Max drawdown: {pct(r.max_drawdown)}")
    print(f"Daily vol:    {pct(r.daily_vol)}")
    print(f"Sharpe (rf=0): {r.sharpe:.2f}")
    print(f"Turnover:     {r.turnover:.2f}x")
    print(f"Fills:        {r.fills}")
    print(f"Win rate:     {pct(r.win_rate)}")
    print(f"Trades:       {r.trades}")
    print(f"Avg win:      {r.avg_win:,.2f}")
    print(f"Avg loss:     {r.avg_loss:,.2f}")
    pf = "inf" if r.profit_factor == float("inf") else f"{r.profit_factor:.2f}"
    print(f"Profit factor: {pf}")
    print(f"Expectancy:   {r.expectancy:,.2f} per trade")

    print("\n--- Open Positions ---")
    if not r.open_positions:
        print("None")
    else:
        print(f"Total unrealized PnL: {r.total_unrealized_pnl:,.2f}")
        for p in r.open_positions:
            print(
                f"{p.symbol}: qty={p.qty}, "
                f"avg_cost={p.avg_cost:.2f}, "
                f"last={p.last_price:.2f}, "
                f"uPnL={p.unrealized_pnl:,.2f} "
                f"({p.unrealized_pnl_pct*100:.2f}%)"
            )

    print("\n--- PnL Contribution by Symbol ---")
    if not r.contributions:
        print("None")
    else:
        for c in r.contributions:
            print(
                f"{c.symbol}: realized={c.realized_pnl:,.2f}, "
                f"unrealized={c.unrealized_pnl:,.2f}, total={c.total_pnl:,.2f}"
            )

    print("\n--- Execution Costs ---")
    print(f"Commission paid:    {r.total_commission:,.2f}")
    print(f"Slippage estimate:  {r.slippage_estimate:,.2f}  (already reflected in fill prices)")
    print(f"Commission % start: {r.commission_pct_of_start*100:.2f}%")


def _trade_stats(closed: List[ClosedTrade]) -> tuple[float, float, float, float, float]:
    """
    Returns: win_rate, avg_win, avg_loss (negative), profit_factor, expectancy
    expectancy is average pnl per trade.
    """
    if not closed:
        return 0.0, 0.0, 0.0, 0.0, 0.0

    pnls = [t.pnl for t in closed]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]

    win_rate = len(wins) / len(pnls)
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0  # negative

    gross_win = sum(wins)
    gross_loss = -sum(losses)
    profit_factor = (gross_win / gross_loss) if gross_loss > 0 else (float("inf") if gross_win > 0 else 0.0)

    expectancy = sum(pnls) / len(pnls)
    return win_rate, avg_win, avg_loss, profit_factor, expectancy
