from __future__ import annotations

import csv
import json
import os
import re
from datetime import datetime, date
from pathlib import Path

from sqlalchemy.orm import Session

from storage.db import get_session
from storage.models import (
    Base, Run, FillRow, TradeRow, EquityPoint, ContributionRow, ReportRaw
)

RUN_DIR = Path("runs")

FOLDER_RE = re.compile(r"(?P<ts>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_(?P<name>.+)$")


def parse_date(s: str) -> date:
    return date.fromisoformat(s)


def import_one_run_folder(session: Session, folder: Path) -> str:
    m = FOLDER_RE.match(folder.name)
    if not m:
        # skip non-conforming folders
        return ""

    ts = datetime.strptime(m.group("ts"), "%Y-%m-%d_%H-%M-%S")
    name = m.group("name")

    # config.json if exists (new runs), otherwise legacy marker
    config_path = folder / "config.json"
    if config_path.exists():
        config_json = json.loads(config_path.read_text(encoding="utf-8"))
        source = "runs_folder"
    else:
        config_json = {"legacy": True, "note": "Imported from runs/ folder; no config.json found."}
        source = "legacy_runs_folder"

    run = Run(
        created_at=ts,
        name=name,
        status="COMPLETED",
        source=source,
        folder=str(folder),
        config_json=config_json,
    )
    session.add(run)
    session.flush()  # assigns run.id
    run_id = run.id

    # report.txt -> reports_raw
    report_path = folder / "report.txt"
    if report_path.exists():
        session.add(ReportRaw(run_id=run_id, text=report_path.read_text(encoding="utf-8")))

    # fills.csv
    fills_path = folder / "fills.csv"
    if fills_path.exists():
        with fills_path.open("r", newline="") as f:
            r = csv.DictReader(f)
            for row in r:
                session.add(
                    FillRow(
                        run_id=run_id,
                        symbol=row["symbol"],
                        d=parse_date(row["d"]),
                        qty=float(row["qty"]),
                        price=float(row["price"]),
                    )
                )

    # trades.csv
    trades_path = folder / "trades.csv"
    if trades_path.exists():
        with trades_path.open("r", newline="") as f:
            r = csv.DictReader(f)
            for row in r:
                session.add(
                    TradeRow(
                        run_id=run_id,
                        symbol=row["symbol"],
                        entry_date=parse_date(row["entry_date"]),
                        exit_date=parse_date(row["exit_date"]),
                        qty=float(row["qty"]),
                        entry_price=float(row["entry_price"]),
                        exit_price=float(row["exit_price"]),
                        pnl=float(row["pnl"]),
                        pnl_pct=float(row["pnl_pct"]),
                    )
                )

    # equity.csv (only future runs will have it)
    equity_path = folder / "equity.csv"
    if equity_path.exists():
        with equity_path.open("r", newline="") as f:
            r = csv.DictReader(f)
            for row in r:
                session.add(
                    EquityPoint(
                        run_id=run_id,
                        d=parse_date(row["d"]),
                        equity=float(row["equity"]),
                    )
                )

    # contrib.csv (optional)
    contrib_path = folder / "contrib.csv"
    if contrib_path.exists():
        with contrib_path.open("r", newline="") as f:
            r = csv.DictReader(f)
            for row in r:
                session.add(
                    ContributionRow(
                        run_id=run_id,
                        symbol=row["symbol"],
                        realized_pnl=float(row["realized_pnl"]),
                        unrealized_pnl=float(row["unrealized_pnl"]),
                        total_pnl=float(row["total_pnl"]),
                    )
                )

    return run_id


def main() -> None:
    if not RUN_DIR.exists():
        print("No runs/ directory found. Nothing to import.")
        return

    session = get_session()
    imported = 0

    try:
        for folder in sorted(RUN_DIR.iterdir()):
            if not folder.is_dir():
                continue
            run_id = import_one_run_folder(session, folder)
            if run_id:
                imported += 1
                print(f"Imported {folder} -> run_id={run_id}")

        session.commit()
        print(f"Done. Imported {imported} runs.")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    # IMPORTANT: run with PYTHONPATH=src so imports work
    main()
