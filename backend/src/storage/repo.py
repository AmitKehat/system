from __future__ import annotations

from sqlalchemy import select, desc, func
from sqlalchemy.orm import Session

from .models import Run, FillRow, TradeRow, EquityPoint

from src.storage.models import ReportRaw


def counts_for_run(session: Session, run_id: str) -> dict:
    fills = session.execute(
        select(func.count()).select_from(FillRow).where(FillRow.run_id == run_id)
    ).scalar_one()

    trades = session.execute(
        select(func.count()).select_from(TradeRow).where(TradeRow.run_id == run_id)
    ).scalar_one()

    eq = session.execute(
        select(func.count()).select_from(EquityPoint).where(EquityPoint.run_id == run_id)
    ).scalar_one()

    return {
        "fills_count": int(fills),
        "trades_count": int(trades),
        "has_equity": (int(eq) > 0),
    }


def list_runs(session: Session, limit: int = 50) -> list[Run]:
    stmt = select(Run).order_by(desc(Run.created_at)).limit(limit)
    return list(session.execute(stmt).scalars())


def get_run(session: Session, run_id: str) -> Run | None:
    stmt = select(Run).where(Run.id == run_id)
    return session.execute(stmt).scalar_one_or_none()


def get_fills(session: Session, run_id: str) -> list[FillRow]:
    stmt = (
        select(FillRow)
        .where(FillRow.run_id == run_id)
        .order_by(FillRow.d.asc(), FillRow.id.asc())
    )
    return list(session.execute(stmt).scalars())


def get_trades(session: Session, run_id: str) -> list[TradeRow]:
    stmt = (
        select(TradeRow)
        .where(TradeRow.run_id == run_id)
        .order_by(TradeRow.exit_date.asc(), TradeRow.id.asc())
    )
    return list(session.execute(stmt).scalars())


def get_equity(session: Session, run_id: str) -> list[EquityPoint]:
    stmt = (
        select(EquityPoint)
        .where(EquityPoint.run_id == run_id)
        .order_by(EquityPoint.d.asc(), EquityPoint.id.asc())
    )
    return list(session.execute(stmt).scalars())

def get_report_raw(session: Session, run_id: str) -> str | None:
    row = session.execute(select(ReportRaw).where(ReportRaw.run_id == run_id)).scalar_one_or_none()
    return row.text if row else None
