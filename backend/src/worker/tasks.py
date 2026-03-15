# src/worker/tasks.py
from __future__ import annotations

import traceback
import datetime

from src.worker.celery_app import celery_app
from src.storage.db import get_session
from src.storage.write_repo import set_run_status, save_results, set_run_progress
from src.common.schemas import RunConfig
from src.engine.runner import run_backtest_from_config


def _progress(run_id: str, cur: int | None, total: int | None, msg: str | None) -> None:
    """Small helper to update progress with its own short-lived session."""
    session = get_session()
    try:
        set_run_progress(session, run_id, cur, total, msg)
        session.commit()
    finally:
        session.close()


def _fail(run_id: str, tb: str) -> None:
    """Mark run failed with its own short-lived session."""
    session = get_session()
    try:
        set_run_status(session, run_id, "FAILED", error=tb)
        # also set a final progress message
        set_run_progress(session, run_id, None, None, "FAILED")
        session.commit()
    finally:
        session.close()


@celery_app.task(name="run_backtest_task")
def run_backtest_task(run_id: str, cfg_dict: dict) -> dict:
    """
    Executes a backtest in the worker and persists results to Postgres.
    Returns metrics dict.
    """
    TOTAL = 3

    # 1) mark RUNNING + initial progress
    session = get_session()
    try:
        set_run_status(session, run_id, "RUNNING")
        set_run_progress(session, run_id, 0, TOTAL, "Starting backtest")
        session.commit()
    finally:
        session.close()

    # 2) validate + load/run backtest
    try:
        _progress(run_id, 1, TOTAL, "Running simulation")
        cfg = RunConfig.model_validate(cfg_dict)
        result = run_backtest_from_config(cfg)
    except Exception:
        tb = traceback.format_exc()
        _fail(run_id, tb)
        raise

    # 3) persist results
    session = get_session()
    try:
        set_run_progress(session, run_id, 2, TOTAL, "Saving results to DB")
        metrics = save_results(session, run_id, result)

        # Ensure metrics is a mutable dictionary
        if not isinstance(metrics, dict):
            try:
                metrics = dict(metrics)
            except Exception:
                pass

        # --- FRONTEND DATA INJECTION & DEBUG ---
        print(f"[SIM DEBUG BE] Run ID: {run_id} - Original metrics keys: {list(metrics.keys())}")
        print(f"[SIM DEBUG BE] Run ID: {run_id} - Original raw total trades reported (int): {metrics.get('trades')}")
        print(f"[SIM DEBUG BE] Run ID: {run_id} - portfolio.fills raw len: {len(result.portfolio.fills)}")
        print(f"[SIM DEBUG BE] Run ID: {run_id} - equity_by_date raw len: {len(result.equity_by_date)}")
        
        # Inject properly formatted equity curve
        metrics["equity_curve"] = [
            {"time": d.isoformat(), "value": e} 
            for d, e in result.equity_by_date
        ]
        
        # Inject properly formatted trades for chart markers
        trade_markers = []
        for f in result.portfolio.fills:
            # Convert date to UTC midnight epoch timestamp
            dt = datetime.datetime.combine(f.d, datetime.time.min).replace(tzinfo=datetime.timezone.utc)
            trade_markers.append({
                "time": int(dt.timestamp()),
                "type": "Buy" if f.qty > 0 else "Sell",
                "size": abs(f.qty),
                "price": f.price,
                "pnl": 0.0 # Standard fill marker
            })
        
        # Overwrite 'trades' (which is just an int) with the UI list
        metrics["trades"] = trade_markers
        
        print(f"[SIM DEBUG BE] Run ID: {run_id} - FINAL metrics keys for return: {list(metrics.keys())}")
        print(f"[SIM DEBUG BE] Run ID: {run_id} - INJECTED equity_curve type: {type(metrics['equity_curve'])}, len: {len(metrics['equity_curve'])}")
        if len(metrics['equity_curve']) > 0:
             print(f"[SIM DEBUG BE] Run ID: {run_id} - Sample curve point: {metrics['equity_curve'][0]}")

        print(f"[SIM DEBUG BE] Run ID: {run_id} - INJECTED trades type: {type(metrics['trades'])}, len: {len(metrics['trades'])}")
        # -----------------------------------------

        # 4) mark completed
        set_run_progress(session, run_id, 3, TOTAL, "Completed")
        set_run_status(session, run_id, "COMPLETED")

        session.commit()
        return metrics
    except Exception:
        session.rollback()
        tb = traceback.format_exc()
        _fail(run_id, tb)
        raise
    finally:
        session.close()