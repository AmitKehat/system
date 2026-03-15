from __future__ import annotations

from dataclasses import dataclass
from ib_insync import IB, Stock, Contract


@dataclass(frozen=True)
class ContractKey:
    symbol: str
    exchange: str = "SMART"
    currency: str = "USD"


def resolve_stock_contract(ib: IB, key: ContractKey) -> Contract:
    """
    Resolves a stock contract via IB contract qualification.
    """
    c = Stock(key.symbol, key.exchange, key.currency)
    qualified = ib.qualifyContracts(c)
    if not qualified:
        raise RuntimeError(f"Failed to qualify contract for {key.symbol}")
    return qualified[0]
