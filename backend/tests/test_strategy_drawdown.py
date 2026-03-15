from datetime import date
from engine.strategy import DrawdownRotate
from engine.types import Bar

def test_drawdown_rotate_triggers():
    s = DrawdownRotate(primary="AAPL", hedge="SPY", threshold=0.20)

    d1 = date(2025, 1, 1)
    d2 = date(2025, 1, 2)

    bars1 = {
        "AAPL": Bar("AAPL", d1, 0,0,0, 100.0, 0),
        "SPY":  Bar("SPY",  d1, 0,0,0, 500.0, 0),
    }
    bars2 = {
        "AAPL": Bar("AAPL", d2, 0,0,0, 79.0, 0),   # -21%
        "SPY":  Bar("SPY",  d2, 0,0,0, 505.0, 0),
    }

    assert s.on_day_close(d1, bars1) == {"AAPL": 1.0}
    assert s.on_day_close(d2, bars2) == {"SPY": 1.0}
