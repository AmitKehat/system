from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Dict, Optional


@dataclass(frozen=True)
class Bar:
    symbol: str
    d: date
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class Order:
    symbol: str
    qty: float   # was int
    d: date

@dataclass(frozen=True)
class Fill:
    symbol: str
    qty: float   # was int
    price: float
    d: date


Prices = Dict[str, float]  # latest close by symbol
