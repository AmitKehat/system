from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, Float, Integer, String, UniqueConstraint, Index
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class IBDailyBar(Base):
    __tablename__ = "ib_daily_bars"

    id = Column(Integer, primary_key=True, autoincrement=True)

    symbol = Column(String(32), nullable=False)
    d = Column(Date, nullable=False)

    bar_size = Column(String(16), nullable=False)        # e.g. "1 day"
    what_to_show = Column(String(16), nullable=False)    # "TRADES"
    use_rth = Column(Boolean, nullable=False)

    exchange = Column(String(16), nullable=False, default="SMART")
    currency = Column(String(8), nullable=False, default="USD")

    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint(
            "symbol", "d", "bar_size", "what_to_show", "use_rth", "exchange", "currency",
            name="uq_ib_daily_bar_key",
        ),
        Index("ix_ib_daily_bars_symbol_d", "symbol", "d"),
    )
