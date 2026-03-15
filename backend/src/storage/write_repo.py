from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import select, func

from src.storage.models import Run, FillRow, TradeRow, EquityPoint, ReportRaw
from src.engine.backtest import BacktestResult
from src.engine.reporting import build_report, print_report


def create_run(session: Session, name: str, config_json: dict) -> Run:
    # BEST PRACTICE: start as PENDING; only set RUNNING after validation passes
    r = Run(name=name, status="PENDING", source="api_sync", config_json=config_json)
    session.add(r)
    session.flush()
    return r


def set_run_status(session: Session, run_id: str, status: str, error: str | None = None) -> None:
    r = session.execute(select(Run).where(Run.id == run_id)).scalar_one_or_none()
    if not r:
        return
    r.status = status
    if error is not None:
        r.error = error


def save_results(session: Session, run_id: str, result: BacktestResult) -> dict:
    # equity points
    for d, eq in result.equity_by_date:
        session.add(EquityPoint(run_id=run_id, d=d, equity=eq))

    # fills
    for f in result.portfolio.fills:
        session.add(FillRow(run_id=run_id, d=f.d, symbol=f.symbol, qty=f.qty, price=f.price))

    # trades (already computed)
    for t in result.closed_trades:
        session.add(
            TradeRow(
                run_id=run_id,
                symbol=t.symbol,
                entry_date=t.entry_date,
                exit_date=t.exit_date,
                qty=t.qty,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                pnl=t.pnl,
                pnl_pct=t.pnl_pct,
            )
        )

    # metrics
    report = build_report(result)
    metrics = {
        "start_equity": report.start_equity,
        "end_equity": report.end_equity,
        "total_return": report.total_return,
        "cagr": report.cagr,
        "max_drawdown": report.max_drawdown,
        "sharpe": report.sharpe,
        "fills": report.fills,
        "trades": report.trades,
        "commission_paid": report.total_commission,
        "slippage_estimate": report.slippage_estimate,
    }

    # store a printable report as raw text (handy for debugging/UI)
    import io
    buf = io.StringIO()
    # temporarily print into buffer
    import sys
    old = sys.stdout
    sys.stdout = buf
    try:
        print_report(report)
    finally:
        sys.stdout = old

    session.add(ReportRaw(run_id=run_id, text=buf.getvalue()))

    return metrics


def cleanup_stale_running(session: Session) -> int:
    """
    Mark RUNNING runs with no fills and no equity points as FAILED.
    Returns count of runs affected.
    """
    # find run_ids where status=RUNNING and no data
    stale_ids = session.execute(
        select(Run.id)
        .where(Run.status == "RUNNING")
        .outerjoin(FillRow, FillRow.run_id == Run.id)
        .outerjoin(EquityPoint, EquityPoint.run_id == Run.id)
        .group_by(Run.id)
        .having(func.count(FillRow.id) == 0)
        .having(func.count(EquityPoint.id) == 0)
    ).scalars().all()

    if not stale_ids:
        return 0

    for rid in stale_ids:
        set_run_status(
            session,
            rid,
            "FAILED",
            error="Auto-cleanup: stale RUNNING run (no results saved).",
        )

    return len(stale_ids)

def set_run_progress(session: Session, run_id: str, current: int | None, total: int | None, msg: str | None) -> None:
    r = session.execute(select(Run).where(Run.id == run_id)).scalar_one_or_none()
    if not r:
        return
    r.progress_current = current
    r.progress_total = total
    r.progress_msg = msg

