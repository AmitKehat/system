from engine.reporting import _max_drawdown

def test_max_drawdown():
    eq = [100, 110, 90, 95, 80, 120]  # peak 110 -> trough 80 = -27.2727%
    mdd = _max_drawdown(eq)
    assert abs(mdd - (80/110 - 1)) < 1e-9
