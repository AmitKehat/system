from __future__ import annotations

import os
from datetime import date, datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from src.api.ib import router as ib_router
from src.api.portfolio import router as portfolio_router
from src.api.websocket import router as ws_router
from src.api.watchlist import router as watchlist_router
from src.common.schemas import RunConfig
from src.engine.validate import validate_config
from src.storage.db import get_session, get_engine
from src.storage.models import Base
from src.storage import repo
from src.storage.write_repo import cleanup_stale_running, create_run
from src.worker.tasks import run_backtest_task

from src.api import simulator
# -----------------------------------------------------------------------------
# App
# -----------------------------------------------------------------------------

app = FastAPI(title="Trading Simulation Platform API")

# Automatically initialize Database Tables for Watchlists
Base.metadata.create_all(bind=get_engine())

# CORS (must be registered BEFORE routers)
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
).split(",")

cors_origins = [o.strip() for o in cors_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers (registered AFTER CORS middleware)
app.include_router(ib_router, prefix="/ib", tags=["ib"])
app.include_router(portfolio_router)  # Already has prefix="/portfolio"
app.include_router(ws_router, tags=["websocket"])
app.include_router(watchlist_router, prefix="/watchlists", tags=["watchlist"])
app.include_router(simulator.router, prefix="/api/simulator", tags=["Simulator"])

# -----------------------------------------------------------------------------
# Response Schemas
# -----------------------------------------------------------------------------

class RunOut(BaseModel):
    id: str
    created_at: datetime
    name: str
    status: str
    source: str
    folder: str | None
    config_json: dict

    fills_count: int
    trades_count: int
    has_equity: bool

    error: str | None = None
    progress_current: int | None = None
    progress_total: int | None = None
    progress_msg: str | None = None

    model_config = ConfigDict(from_attributes=True)


class FillOut(BaseModel):
    d: date
    symbol: str
    qty: float
    price: float
    model_config = ConfigDict(from_attributes=True)


class TradeOut(BaseModel):
    symbol: str
    entry_date: date
    exit_date: date
    qty: float
    entry_price: float
    exit_price: float
    pnl: float
    pnl_pct: float
    model_config = ConfigDict(from_attributes=True)


class EquityOut(BaseModel):
    d: date
    equity: float
    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True}


# -----------------------------------------------------------------------------
# Runs
# -----------------------------------------------------------------------------

@app.get("/runs", response_model=list[RunOut])
def runs(limit: int = 50):
    session = get_session()
    try:
        rows = repo.list_runs(session, limit=limit)
        out: list[dict] = []
        for run in rows:
            c = repo.counts_for_run(session, run.id)
            out.append(
                {
                    "id": run.id,
                    "created_at": run.created_at,
                    "name": run.name,
                    "status": run.status,
                    "source": run.source,
                    "folder": run.folder,
                    "config_json": run.config_json,
                    "error": getattr(run, "error", None),
                    "progress_current": getattr(run, "progress_current", None),
                    "progress_total": getattr(run, "progress_total", None),
                    "progress_msg": getattr(run, "progress_msg", None),
                    **c,
                }
            )
        return out
    finally:
        session.close()


@app.get("/runs/{run_id}", response_model=RunOut)
def run(run_id: str):
    session = get_session()
    try:
        run = repo.get_run(session, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        c = repo.counts_for_run(session, run.id)
        return {
            "id": run.id,
            "created_at": run.created_at,
            "name": run.name,
            "status": run.status,
            "source": run.source,
            "folder": run.folder,
            "config_json": run.config_json,
            "error": getattr(run, "error", None),
            "progress_current": getattr(run, "progress_current", None),
            "progress_total": getattr(run, "progress_total", None),
            "progress_msg": getattr(run, "progress_msg", None),
            **c,
        }
    finally:
        session.close()


@app.get("/runs/{run_id}/status")
def run_status(run_id: str):
    session = get_session()
    try:
        run = repo.get_run(session, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return {
            "id": run.id,
            "status": run.status,
            "error": getattr(run, "error", None),
            "progress_current": getattr(run, "progress_current", None),
            "progress_total": getattr(run, "progress_total", None),
            "progress_msg": getattr(run, "progress_msg", None),
        }
    finally:
        session.close()


@app.get("/runs/{run_id}/report")
def run_report(run_id: str):
    session = get_session()
    try:
        run = repo.get_run(session, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        text = repo.get_report_raw(session, run_id)
        if text is None:
            raise HTTPException(status_code=404, detail="Report not found")
        return {"run_id": run_id, "text": text}
    finally:
        session.close()


@app.get("/runs/{run_id}/fills", response_model=list[FillOut])
def run_fills(run_id: str):
    session = get_session()
    try:
        run = repo.get_run(session, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return repo.get_fills(session, run_id)
    finally:
        session.close()


@app.get("/runs/{run_id}/trades", response_model=list[TradeOut])
def run_trades(run_id: str):
    session = get_session()
    try:
        run = repo.get_run(session, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return repo.get_trades(session, run_id)
    finally:
        session.close()


@app.get("/runs/{run_id}/equity", response_model=list[EquityOut])
def run_equity(run_id: str):
    session = get_session()
    try:
        run = repo.get_run(session, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return repo.get_equity(session, run_id)
    finally:
        session.close()


# -----------------------------------------------------------------------------
# Create Backtest (enqueue)
# -----------------------------------------------------------------------------

@app.post("/backtests")
def create_backtest(cfg: RunConfig):
    try:
        validate_config(cfg)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    session = get_session()
    try:
        run = create_run(session, name=cfg.run_name, config_json=cfg.model_dump())
        run_id = run.id
        session.commit()
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

    run_backtest_task.delay(run_id, cfg.model_dump())
    return {"run_id": run_id, "status": "QUEUED"}


# -----------------------------------------------------------------------------
# Admin
# -----------------------------------------------------------------------------

@app.post("/admin/runs/cleanup_stale")
def admin_cleanup_stale():
    session = get_session()
    try:
        n = cleanup_stale_running(session)
        session.commit()
        return {"cleaned": n}
    finally:
        session.close()