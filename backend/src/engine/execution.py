from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class ExecutionPolicy:
    # When to trade (skip small weight diffs)
    rebalance_threshold: float = 0.05

    # How aggressively to move toward target (0..1)
    rebalance_strength: float = 1.0

    # Skip tiny trades (helps with $2.50 minimum commission)
    min_order_notional: float = 1000.0

    # NEW: execution timing
    # "close"      -> generate signals at close and execute at same close (current behavior)
    # "next_open"  -> generate signals at close and execute next day open (recommended)
    execute_on: str = "close"
