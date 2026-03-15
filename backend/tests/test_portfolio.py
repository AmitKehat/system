from engine.portfolio import Portfolio
from engine.types import Fill

def test_portfolio_apply_fill_and_equity():
    pf = Portfolio(cash=1000.0)
    pf.apply_fill(Fill(symbol="AAPL", qty=2, price=100.0, d=None))  # date not used
    assert pf.cash == 800.0
    assert pf.positions["AAPL"] == 2
    assert pf.equity({"AAPL": 110.0}) == 800.0 + 2 * 110.0
