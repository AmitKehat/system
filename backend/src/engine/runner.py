from __future__ import annotations

from datetime import date
from pathlib import Path

from src.common.schemas import RunConfig, BuyAndHoldCfg, DrawdownRotateCfg, TopNMomentumCfg
from src.data.load_csv import load_daily_csv, align_by_date
from src.data.synth import generate_synthetic_daily_bars

from src.engine.backtest import run_backtest, BacktestResult
from src.engine.strategy import BuyAndHold, DrawdownRotate, TopNMomentum
from src.engine.costs import ExecutionCosts
from src.engine.execution import ExecutionPolicy
from src.data.load_ib import load_daily_ib

from typing import Dict
from src.engine.types import Bar
from datetime import date

def _wrap_single_series(series0: Dict[date, Bar]) -> Dict[date, Dict[str, Bar]]:
    # Convert {d: Bar} -> {d: {bar.symbol: bar}}
    return {d: {b.symbol: b} for d, b in series0.items()}

def build_strategy(cfg: RunConfig):
    s = cfg.strategy

    if isinstance(s, BuyAndHoldCfg):
        return BuyAndHold(symbol=s.symbol)

    if isinstance(s, DrawdownRotateCfg):
        return DrawdownRotate(primary=s.primary, hedge=s.hedge, threshold=float(s.threshold))

    if isinstance(s, TopNMomentumCfg):
        return TopNMomentum(
            universe=cfg.symbols,
            top_n=int(s.top_n),
            lookback_days=int(s.lookback_days),
            rebalance_every_n_days=int(s.rebalance_every_n_days),
        )

    raise ValueError(f"Unknown strategy config: {type(s)}")


def load_bars(cfg: RunConfig):
    if cfg.data.source == "synthetic":
        y, m, d = map(int, cfg.data.start.split("-"))
        return generate_synthetic_daily_bars(
            symbols=cfg.symbols,
            start=date(y, m, d),
            days=int(cfg.data.days),
            seed=int(cfg.data.seed),
        )

    # ib
    if cfg.data.source == "ib":
        series = []
        for sym in cfg.symbols:
            series.append(load_daily_ib(sym, cfg))

        if len(series) == 1:
            return _wrap_single_series(series[0])

        bars_by_date = series[0]
        for nxt in series[1:]:
            bars_by_date = align_by_date(bars_by_date, nxt)

        return bars_by_date

    # csv
        # csv
    series = []
    for sym in cfg.symbols:
        p = Path(cfg.data.csv_dir) / f"{sym}.csv"
        if not p.exists():
            raise FileNotFoundError(
                f"Missing CSV for symbol '{sym}': {p}. Fix symbols or csv_dir."
            )
        series.append(load_daily_csv(sym, str(p)))

    if len(series) == 1:
        return _wrap_single_series(series[0])

    bars_by_date = series[0]
    for nxt in series[1:]:
        bars_by_date = align_by_date(bars_by_date, nxt)

    return bars_by_date


def run_backtest_from_config(cfg: RunConfig) -> BacktestResult:
    bars_by_date = load_bars(cfg)
    strat = build_strategy(cfg)

    costs = ExecutionCosts(
        commission_per_share=cfg.costs.commission_per_share,
        commission_min_per_order=cfg.costs.commission_min_per_order,
        slippage_bps=cfg.costs.slippage_bps,
    )

    policy = ExecutionPolicy(
        rebalance_threshold=cfg.execution.rebalance_threshold,
        rebalance_strength=cfg.execution.rebalance_strength,
        min_order_notional=cfg.execution.min_order_notional,
        execute_on=cfg.execution.execute_on,
    )

    return run_backtest(
        bars_by_date,
        strat,
        starting_cash=cfg.starting_cash,
        costs=costs,
        policy=policy,
    )
