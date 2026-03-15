from pathlib import Path
from datetime import datetime

def make_run_dir(name: str) -> Path:
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    d = Path("runs") / f"{ts}_{name}"
    d.mkdir(parents=True, exist_ok=True)
    return d
