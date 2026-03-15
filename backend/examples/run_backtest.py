# examples/run_backtest.py

from data.load_csv import load_daily_csv, align_by_date
from engine.backtest import run_backtest
from engine.strategy import DrawdownRotate  # or BuyAndHold
from engine.reporting import build_report, print_report, save_equity_plot
from engine.trades import build_closed_trades_fifo
from engine.export import export_fills_csv, export_trades_csv
from engine.run_utils import make_run_dir


def main() -> None:
    # ---- Load data ----
    aapl = load_daily_csv("AAPL", "examples/sample_data/AAPL.csv")
    spy = load_daily_csv("SPY", "examples/sample_data/SPY.csv")
    bars_by_date = align_by_date(aapl, spy)

    # ---- Choose strategy ----
    strategy = DrawdownRotate(primary="AAPL", hedge="SPY", threshold=0.20)
    # strategy = BuyAndHold("AAPL")

    # ✅ Create run folder EARLY (before saving anything)
    run_dir = make_run_dir("drawdown_rotate")

    import csv, json

    # ---- Run backtest ----
    res = run_backtest(bars_by_date, strategy, starting_cash=100_000.0)
    with open(run_dir / "equity.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["d", "equity"])
        w.writeheader()
        for d, eq in res.equity_by_date:
            w.writerow({"d": d.isoformat(), "equity": eq})
    
    config = {
        "mode": "backtest",
        "data_source": "csv",
        "symbols": ["AAPL", "SPY"],
        "strategy": {
            "name": "DrawdownRotate",
            "params": {"primary": "AAPL", "hedge": "SPY", "threshold": 0.20},
        },
        "starting_cash": 100_000.0,
        "execution_policy": {
            "rebalance_threshold": 0.05,
            "rebalance_strength": 1.0,
            "min_order_notional": 1000.0,
            "execute_on": "close",
        },
        "costs": None,
    }
    (run_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    
    # ---- Reporting ----
    report = build_report(res)

    from engine.export import export_contrib_csv
    export_contrib_csv(report.contributions, str(run_dir / "contrib.csv"))
    print(f"Saved {run_dir / 'contrib.csv'}")

    print_report(report)

    # Save plot + CSV exports
    save_equity_plot(res, str(run_dir / "equity.png"))
    closed_trades = build_closed_trades_fifo(res.portfolio.fills)
    export_fills_csv(res.portfolio.fills, str(run_dir / "fills.csv"))
    export_trades_csv(closed_trades, str(run_dir / "trades.csv"))

    print(f"Saved {run_dir / 'equity.png'}, {run_dir / 'fills.csv'}, {run_dir / 'trades.csv'}")

    # ---- Final quick summary ----
    print("Final cash:", res.portfolio.cash)
    print("Final positions:", res.portfolio.positions)
    print("Final equity:", res.portfolio.equity_curve[-1])
    print("Fills:", len(res.portfolio.fills))
    print("Closed trades:", len(closed_trades))

    # Save report.txt inside run folder
    with open(run_dir / "report.txt", "w", encoding="utf-8") as f:
        import sys
        old = sys.stdout
        sys.stdout = f
        try:
            print_report(report)
        finally:
            sys.stdout = old

    print(f"Saved run outputs to: {run_dir}")



if __name__ == "__main__":
    main()
