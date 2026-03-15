from datetime import date

from data.synth import generate_synthetic_daily_bars
from engine.backtest import run_backtest
from engine.strategy import TopNMomentum
from engine.reporting import build_report, print_report, save_equity_plot
from engine.trades import build_closed_trades_fifo
from engine.export import export_fills_csv, export_trades_csv
from engine.costs import ExecutionCosts   # ← STEP 5 import
from engine.execution import ExecutionPolicy
from engine.run_utils import make_run_dir


def main() -> None:
    # ---- Generate synthetic data ----
    symbols = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"]
    bars_by_date = generate_synthetic_daily_bars(
        symbols=symbols,
        start=date(2025, 1, 1),
        days=180,
        seed=7,
    )

    # ---- Strategy ----
    strat = TopNMomentum(
        universe=symbols,
        top_n=3,
        lookback_days=20,
        rebalance_every_n_days=10,
    )

    # ✅ Create run folder EARLY
    run_dir = make_run_dir("topn_momentum")

    # ---- Execution cost model ----
    costs = ExecutionCosts(
        commission_per_share=0.01,
        commission_min_per_order=2.50,
        slippage_bps=5.0,
    )

    policy = ExecutionPolicy(
        rebalance_threshold=0.08,
        rebalance_strength=0.25,
        min_order_notional=2500.0,
        execute_on="next_open", 
    )


    # ---- Run backtest ----
    res = run_backtest(
        bars_by_date,
        strat,
        starting_cash=100_000.0,
        costs=costs,
        policy=policy,
    )

    # ---- Reporting ----
    report = build_report(res)
    print_report(report)

    # ---- Save outputs (only in run_dir) ----
    save_equity_plot(res, str(run_dir / "equity.png"))
    closed = build_closed_trades_fifo(res.portfolio.fills)
    export_fills_csv(res.portfolio.fills, str(run_dir / "fills.csv"))
    export_trades_csv(closed, str(run_dir / "trades.csv"))

    with open(run_dir / "report.txt", "w", encoding="utf-8") as f:
        import sys
        old = sys.stdout
        sys.stdout = f
        try:
            print_report(report)
        finally:
            sys.stdout = old

    print(f"Saved run outputs to: {run_dir}")
    print("Final equity:", res.portfolio.equity_curve[-1])
    print("Fills:", len(res.portfolio.fills))
    print("Closed trades:", len(closed))



if __name__ == "__main__":
    main()
