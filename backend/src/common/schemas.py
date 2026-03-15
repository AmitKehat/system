from __future__ import annotations

from typing import Literal, Union, Annotated
from pydantic import BaseModel, Field, ConfigDict



class CostsCfg(BaseModel):
    commission_per_share: float = 0.01
    commission_min_per_order: float = 2.50
    slippage_bps: float = 5.0


class ExecutionPolicyCfg(BaseModel):
    rebalance_threshold: float = 0.05
    rebalance_strength: float = 1.0
    min_order_notional: float = 1000.0
    execute_on: Literal["close", "next_open"] = "close"


from typing import Literal, Optional
from pydantic import BaseModel, Field

class DataCfg(BaseModel):
    source: Literal["csv", "synthetic", "ib"] = "csv"

    # csv
    csv_dir: str = "examples/sample_data"

    # synthetic
    seed: int = 7
    days: int = 180
    start: str = "2025-01-01"

    # ib (new)
    ib_host: str = "127.0.0.1"
    ib_port: int = 7497              # 7497=TWS paper default, 7496=TWS live default (varies)
    ib_client_id: int = 7            # pick a stable number; avoid conflicts
    bar_size: str = "1 day"          # IB barSizeSetting (e.g., "1 min", "5 mins", "1 day")
    duration: str = "2 Y"            # IB durationStr (e.g., "1 M", "2 Y")
    what_to_show: str = "TRADES"     # "TRADES", "MIDPOINT", etc.
    use_rth: bool = True
    end_datetime: Optional[str] = None  # IB endDateTime string or None for "now"


    # csv
    csv_dir: str = "examples/sample_data"

    # synthetic
    seed: int = 7
    days: int = 180
    start: str = "2025-01-01"


# ----- Strategies (typed, so Swagger stops showing additionalProp1) -----

class BuyAndHoldCfg(BaseModel):
    name: Literal["BuyAndHold"] = "BuyAndHold"
    symbol: str = "AAPL"


class DrawdownRotateCfg(BaseModel):
    name: Literal["DrawdownRotate"] = "DrawdownRotate"
    primary: str = "AAPL"
    hedge: str = "SPY"
    threshold: float = 0.20


class TopNMomentumCfg(BaseModel):
    name: Literal["TopNMomentum"] = "TopNMomentum"
    top_n: int = 3
    lookback_days: int = 20
    rebalance_every_n_days: int = 10


StrategyCfg = Annotated[
    Union[BuyAndHoldCfg, DrawdownRotateCfg, TopNMomentumCfg],
    Field(discriminator="name"),
]


class RunConfig(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "run_name": "drawdown_rotate_example",
                    "symbols": ["AAPL", "SPY"],
                    "starting_cash": 100000,
                    "data": {
                        "source": "csv",
                        "csv_dir": "examples/sample_data",
                        "seed": 7,
                        "days": 180,
                        "start": "2025-01-01"
                    },
                    "strategy": {
                        "name": "DrawdownRotate",
                        "primary": "AAPL",
                        "hedge": "SPY",
                        "threshold": 0.2
                    },
                    "costs": {
                        "commission_per_share": 0.01,
                        "commission_min_per_order": 2.5,
                        "slippage_bps": 5
                    },
                    "execution": {
                        "rebalance_threshold": 0.05,
                        "rebalance_strength": 1,
                        "min_order_notional": 1000,
                        "execute_on": "close"
                    }
                }
            ]
        }
    )

    run_name: str = "backtest"

    # IMPORTANT: use a plain default (OpenAPI will show it)
    symbols: list[str] = Field(
        default=["AAPL", "SPY"],
        description="Symbols to load (CSV expects <csv_dir>/<SYMBOL>.csv).",
        json_schema_extra={"example": ["AAPL", "SPY"]},
    )

    starting_cash: float = 100_000.0
    data: DataCfg = DataCfg()
    strategy: StrategyCfg = Field(default_factory=DrawdownRotateCfg)
    costs: CostsCfg = CostsCfg()
    execution: ExecutionPolicyCfg = ExecutionPolicyCfg()


