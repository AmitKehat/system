from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class ExecutionCosts:
    # Commission (IBKR-style)
    commission_per_share: float = 0.01
    commission_min_per_order: float = 2.50

    # Slippage (bps = basis points). 10 bps = 0.10%
    slippage_bps: float = 5.0
