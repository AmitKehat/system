from __future__ import annotations

import uuid
from datetime import datetime, date

from sqlalchemy import (
    String, DateTime, Date, Float, Integer, ForeignKey, Text, JSON, Boolean,
    UniqueConstraint, Index
)

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    name: Mapped[str] = mapped_column(String(128), nullable=False)  # e.g. drawdown_rotate
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="COMPLETED")
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="legacy_runs_folder")
    folder: Mapped[str | None] = mapped_column(String(512), nullable=True)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    fills: Mapped[list["FillRow"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    trades: Mapped[list["TradeRow"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    equity: Mapped[list["EquityPoint"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    contributions: Mapped[list["ContributionRow"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    reports: Mapped[list["ReportRaw"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class FillRow(Base):
    __tablename__ = "fills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)

    d: Mapped[date] = mapped_column(Date, nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)

    run: Mapped["Run"] = relationship(back_populates="fills")


class TradeRow(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    exit_date: Mapped[date] = mapped_column(Date, nullable=False)
    qty: Mapped[float] = mapped_column(Float, nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[float] = mapped_column(Float, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, nullable=False)
    pnl_pct: Mapped[float] = mapped_column(Float, nullable=False)

    run: Mapped["Run"] = relationship(back_populates="trades")


class EquityPoint(Base):
    __tablename__ = "equity_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)

    d: Mapped[date] = mapped_column(Date, nullable=False)
    equity: Mapped[float] = mapped_column(Float, nullable=False)

    run: Mapped["Run"] = relationship(back_populates="equity")


class ContributionRow(Base):
    __tablename__ = "contributions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    realized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Float, nullable=False)
    total_pnl: Mapped[float] = mapped_column(Float, nullable=False)

    run: Mapped["Run"] = relationship(back_populates="contributions")


class ReportRaw(Base):
    __tablename__ = "reports_raw"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    run: Mapped["Run"] = relationship(back_populates="reports")


class IBDailyBar(Base):
    __tablename__ = "ib_daily_bars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    d: Mapped[date] = mapped_column(Date, nullable=False)

    bar_size: Mapped[str] = mapped_column(String(16), nullable=False)       # e.g. "1 day"
    what_to_show: Mapped[str] = mapped_column(String(16), nullable=False)   # e.g. "TRADES"
    use_rth: Mapped[bool] = mapped_column(Boolean, nullable=False)

    exchange: Mapped[str] = mapped_column(String(16), nullable=False, default="SMART")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")

    open: Mapped[float] = mapped_column(Float, nullable=False)
    high: Mapped[float] = mapped_column(Float, nullable=False)
    low: Mapped[float] = mapped_column(Float, nullable=False)
    close: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint(
            "symbol", "d", "bar_size", "what_to_show", "use_rth", "exchange", "currency",
            name="uq_ib_daily_bar_key",
        ),
        Index("ix_ib_daily_bars_symbol_d", "symbol", "d"),
    )


# ==========================================
# WATCHLIST MODELS
# ==========================================

class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    items: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="watchlist", cascade="all, delete-orphan", order_by="WatchlistItem.sort_order"
    )


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    watchlist_id: Mapped[str] = mapped_column(String(36), ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    watchlist: Mapped["Watchlist"] = relationship(back_populates="items")