from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta


def compute_window(duration: str, end_datetime: str | None) -> tuple[date, date]:
    # end date
    if end_datetime:
        try:
            end = datetime.fromisoformat(end_datetime).date()
        except Exception:
            end = datetime.strptime(end_datetime[:10], "%Y-%m-%d").date()
    else:
        # daily bars: use last completed UTC day
        end = datetime.now(timezone.utc).date() - timedelta(days=1)

    n_str, unit = duration.strip().split()
    n = int(n_str)
    unit = unit.upper()

    if unit == "D":
        start = end - timedelta(days=n)
    elif unit == "W":
        start = end - timedelta(weeks=n)
    elif unit == "M":
        start = end - relativedelta(months=n)
    elif unit == "Y":
        start = end - relativedelta(years=n)
    else:
        raise ValueError(f"Unsupported duration format: {duration}")

    return start, end
