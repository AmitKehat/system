from __future__ import annotations

from pathlib import Path
from src.common.schemas import RunConfig


def validate_config(cfg: RunConfig) -> None:
    if cfg.symbols == ["string"]:
        raise ValueError("Swagger placeholder detected: replace symbols ['string'] with real symbols like ['AAPL','SPY'].")

    if not cfg.symbols:
        raise ValueError("symbols must not be empty")

    if cfg.data.source == "csv":
        base = Path(cfg.data.csv_dir)
        if not base.exists():
            raise FileNotFoundError(f"csv_dir does not exist: {base}")

        missing = []
        for sym in cfg.symbols:
            p = base / f"{sym}.csv"
            if not p.exists():
                missing.append(str(p))

        if missing:
            raise FileNotFoundError(
                "Missing CSV files:\n" + "\n".join(missing)
            )
