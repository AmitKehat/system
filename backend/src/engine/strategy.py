from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Dict, Protocol
from .types import Bar


class Strategy(Protocol):
    def on_day_close(self, d: date, bars: Dict[str, Bar]) -> Dict[str, float]:
        """
        Return target weights by symbol (must sum to 1.0 or be empty).
        Example: {"AAPL": 1.0} means 100% AAPL.
        """
        ...


@dataclass
class BuyAndHold:
    symbol: str

    def on_day_close(self, d: date, bars: Dict[str, Bar]) -> Dict[str, float]:
        return {self.symbol: 1.0}


@dataclass
class DrawdownRotate:
    """
    Very simple example:
    - Start fully invested in primary.
    - If primary drops >= 20% from entry price, rotate fully into hedge.
    """
    primary: str
    hedge: str
    threshold: float = 0.20

    entry_price: float | None = None
    rotated: bool = False

    def on_day_close(self, d: date, bars: Dict[str, Bar]) -> Dict[str, float]:
        p = bars[self.primary].close
        if self.entry_price is None:
            self.entry_price = p

        dd = (p - self.entry_price) / self.entry_price  # negative if down
        if (not self.rotated) and dd <= -self.threshold:
            self.rotated = True

        return {self.hedge: 1.0} if self.rotated else {self.primary: 1.0}

from collections import defaultdict
from typing import List


@dataclass
class TopNMomentum:
    """
    Cross-sectional strategy:
    - Track closes for each symbol
    - Every rebalance_every_n_days, pick top N by lookback return
    - Equal weight among selected
    """
    universe: List[str]
    top_n: int = 3
    lookback_days: int = 20
    rebalance_every_n_days: int = 5  # ~weekly in trading terms

    day_index: int = 0
    closes: dict[str, List[float]] = None
    last_targets: Dict[str, float] = None

    def __post_init__(self) -> None:
        self.closes = defaultdict(list)
        self.last_targets = {}

    def on_day_close(self, d: date, bars: Dict[str, Bar]) -> Dict[str, float]:
        self.day_index += 1

        # update close history
        for s in self.universe:
            if s in bars:
                self.closes[s].append(bars[s].close)

        # if not enough history, hold cash implicitly by staying in last targets (initially empty)
        if any(len(self.closes[s]) < self.lookback_days + 1 for s in self.universe):
            return self.last_targets

        # only rebalance on schedule
        if (self.day_index % self.rebalance_every_n_days) != 0:
            return self.last_targets

        # compute lookback returns
        mom = []
        for s in self.universe:
            series = self.closes[s]
            now = series[-1]
            past = series[-(self.lookback_days + 1)]
            r = (now / past - 1.0) if past > 0 else -1.0
            mom.append((r, s))

        mom.sort(reverse=True)  # highest momentum first
        selected = [s for _, s in mom[: max(1, min(self.top_n, len(mom)))]]

        w = 1.0 / len(selected)
        targets = {s: w for s in selected}
        targets["CASH"] = 0.0

        self.last_targets = targets
        return targets
