import os
import re
import json
import traceback
import requests
import math
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from backtesting import Backtest, Strategy
from datetime import datetime, timezone

router = APIRouter()

class Message(BaseModel):
    role: str
    content: str

class SimulatorRequest(BaseModel):
    symbol: str
    mode: str
    prompt: str
    chat_history: List[Message]
    parameters: Dict[str, Any]
    llm_provider: str
    api_key: str

def safe_float(v):
    """Safely convert any NumPy/Pandas numeric to a standard Python float to prevent JSON Network Errors."""
    if pd.isna(v) or pd.isnull(v): 
        return 0.0
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return round(val, 4)
    except:
        return 0.0

def call_llm(provider: str, api_key: str, messages: List[Dict[str, str]]) -> str:
    try:
        if provider == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {"model": "gpt-4o", "messages": messages, "temperature": 0.0}
            res = requests.post(url, headers=headers, json=payload, timeout=45)
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"]
            
        elif provider == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
            system_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
            user_msgs = [m for m in messages if m["role"] != "system"]
            payload = {"model": "claude-3-5-sonnet-20240620", "max_tokens": 2048, "system": system_msg, "messages": user_msgs, "temperature": 0.0}
            res = requests.post(url, headers=headers, json=payload, timeout=45)
            res.raise_for_status()
            return res.json()["content"][0]["text"]
            
        elif provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            gemini_msgs = [{"role": "user" if m["role"] in ["user", "system"] else "model", "parts": [{"text": m["content"]}]} for m in messages]
            payload = {
                "contents": gemini_msgs,
                "generationConfig": {"temperature": 0.0}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=45)
            res.raise_for_status()
            return res.json()["candidates"][0]["content"]["parts"][0]["text"]
            
        raise ValueError("Unsupported LLM Provider")
    except Exception as e:
        print(f"LLM API Error: {str(e)}")
        raise e

@router.post("/run")
async def run_simulation(req: SimulatorRequest):
    print(f"[SIMULATOR DEBUG] Request received - symbol: {req.symbol}, prompt: {req.prompt[:50]}...")
    if not req.api_key:
        raise HTTPException(status_code=400, detail="API Key is required.")

    triple_ticks = "`" * 3

    system_prompt = f"""
You are an expert quantitative trading assistant.
Your goal is to write a trading strategy in Python.
CRITICAL RULE: DO NOT mention the underlying Python libraries, frameworks, or code in your conversation.

CURRENT BACKTEST PARAMETERS:
- Target Symbol: {req.symbol}
- Date Range: {req.parameters.get('startDate')} to {req.parameters.get('endDate')}
- Initial Capital: ${req.parameters.get('initialCapital')}
- Commission: {req.parameters.get('commission')} (fraction)

PARAMETER EDITING:
If the user explicitly asks to change the target stock/symbol or any parameters, output a JSON block wrapped in {triple_ticks}json ... {triple_ticks} with ONLY the updated keys. Valid keys: "symbol", "startDate", "endDate", "initialCapital", "commission".

SYMBOL CHANGE WORKFLOW (CRITICAL):
When the user asks to run the SAME strategy on a DIFFERENT symbol:
1. Output the JSON block with the new symbol: {triple_ticks}json {{"symbol": "NEW_SYMBOL"}} {triple_ticks}
2. IMMEDIATELY AFTER the JSON block, present the FULL STRATEGY SUMMARY using the HTML template below, with the NEW symbol shown
3. Ask for approval: "Should I run this backtest now?"
4. ONLY when the user approves, output the FULL Python code block (the strategy logic stays the same, just the symbol changes)
This ensures the user sees a summary with the new symbol and can approve before execution.

WORKFLOW:
1. Converse to understand the desired strategy rules.
2. BEFORE writing code, you MUST present a FULL SUMMARY of the strategy using EXACTLY this HTML template (strictly professional, NO emojis, NO asterisks):

<h3 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Summary</h3>
<div style="margin-left: 10px; border-left: 3px solid #2962ff; padding-left: 15px; margin-bottom: 15px;">
  <span style="color: #787b86;">Target Symbol:</span> <b style="color: #2962ff;">{{req.symbol}}</b><br>
  <span style="color: #787b86;">Date Range:</span> <b style="color: #d1d4dc;">{{req.parameters.get('startDate')}}</b> to <b style="color: #d1d4dc;">{{req.parameters.get('endDate')}}</b><br>
  <span style="color: #787b86;">Initial Capital:</span> <b style="color: #089981;">${{req.parameters.get('initialCapital')}}</b><br>
  <span style="color: #787b86;">Commission:</span> <b style="color: #f23645;">{{req.parameters.get('commission')}}</b>
</div>
<h4 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Rules</h4>
<ul style="margin: 0 0 15px 20px; color: #d1d4dc;">
  <li>(List the rules clearly here as list items)</li>
</ul>
<b style="color: #089981;">Should I run this backtest now?</b>

3. ONLY when the user explicitly approves, output the Python code wrapped in {triple_ticks}python ... {triple_ticks}.

CRITICAL ANTI-HALLUCINATION RULES:
- NEVER INVENT OR OUTPUT FAKE BACKTEST RESULTS. You are an LLM, you cannot run backtests.
- THE ONLY WAY to run a backtest is to output the FULL Python code block again.
- When running on a new symbol, follow the SYMBOL CHANGE WORKFLOW above (JSON + summary + approval + code).

STRATEGY MODIFICATION RULES (CRITICAL):
- If the user asks to CHANGE, MODIFY, or TWEAK any aspect of the strategy (e.g., "change buy day from 2nd to 20th", "use 50-day SMA instead of 20-day", "buy on Monday instead of Tuesday"), you MUST:
  1. Acknowledge the change briefly
  2. Output the COMPLETE UPDATED Python code block with the modification applied
  3. NEVER just reply with text saying you made the change - the system cannot detect changes without new code
- Treat ANY request that modifies strategy logic as requiring FULL CODE OUTPUT.

CODING RULES (STRICT):
- Create a class named CustomStrategy inheriting from Strategy.
- POSITION MANAGEMENT (CRITICAL):
  1. To go long, use `self.buy()`.
  2. When the user says "sell", they almost ALWAYS mean "close my existing position". To close a position and return to cash, you MUST use `self.position.close()`.
  3. NEVER use `self.sell()` unless the user explicitly types the words "short" or "short selling".
- IMPORTS: `Strategy`, `pandas`, `numpy`, and indicators like `SMA` are ALREADY imported in the environment! DO NOT import them. You may ONLY import standard Python libraries (e.g., `from datetime import timedelta`) if absolutely necessary.
- DO NOT include data fetching or Backtest() calls. ONLY output the CustomStrategy class.

DATETIME AND CALENDAR LOGIC (CRITICAL):
- Extract the current bar's datetime using: current_dt = self.data.index[-1]
- For checking day of month: current_dt.day
- For checking month: current_dt.month
- For checking day of week: current_dt.weekday() (0=Monday, 4=Friday)

HANDLING NON-TRADING DAYS (weekends/holidays):
- Markets are closed on weekends and holidays, so the exact date (e.g., "2nd of month") may not exist in data.
- Use RANGE-BASED CHECKS instead of exact day matches:
  - BAD:  if current_dt.day == 2:  # May miss if 2nd is a weekend
  - GOOD: if 1 <= current_dt.day <= 3:  # Catches first trading day near the 2nd
- For "buy on day X, sell on day Y" strategies, track state to ensure you only act once per period.

RECURRING TRADES (monthly/weekly patterns):
- For MONTHLY recurring strategies, track state per month using (year, month) tuples:
  ```python
  def init(self):
      self.last_action_month = None  # Track (year, month) of last action

  def next(self):
      current_dt = self.data.index[-1]
      current_month = (current_dt.year, current_dt.month)

      # Buy around the 2nd of each month (handle weekends: check day 1-3)
      if 1 <= current_dt.day <= 3 and not self.position:
          if self.last_action_month != current_month:
              self.buy()
              self.last_action_month = current_month

      # Sell around the 28th of each month (handle weekends: check day 27-31)
      if current_dt.day >= 27 and self.position:
          self.position.close()
  ```

- For WEEKLY recurring strategies, use weekday checks:
  ```python
  # Buy on Monday (weekday 0), sell on Friday (weekday 4)
  if current_dt.weekday() == 0 and not self.position:
      self.buy()
  if current_dt.weekday() == 4 and self.position:
      self.position.close()
  ```

STATE FLAGS:
- ONE-TIME trades (e.g., "buy in January 2024"): Use a simple boolean flag.
- YEARLY recurring (e.g., "buy every January"): Track self.last_action_year.
- MONTHLY recurring (e.g., "buy on 2nd, sell on 28th every month"): Track self.last_buy_month and self.last_sell_month as (year, month) tuples.
- WEEKLY recurring: Usually no state needed, just check weekday.
- ALWAYS check position state: use `if not self.position` before buying, `if self.position` before selling.
"""
    
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.chat_history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.prompt})

    try:
        llm_response = call_llm(req.llm_provider, req.api_key, messages)
    except requests.exceptions.ReadTimeout:
         raise HTTPException(status_code=504, detail="LLM API timed out while generating a response.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API Error: {str(e)}")

    param_update = None
    json_pattern = triple_ticks + r'json(.*?)' + triple_ticks
    json_match = re.search(json_pattern, llm_response, re.DOTALL)
    
    if json_match:
        try:
            param_update = json.loads(json_match.group(1).strip())
            
            # If the AI decided to change the symbol, update the request immediately so we download the right data!
            if "symbol" in param_update:
                req.symbol = str(param_update["symbol"]).upper()
                
            llm_response = re.sub(json_pattern, '', llm_response, flags=re.DOTALL).strip()
            if not llm_response:
                llm_response = "I have updated the parameters. Should I run the backtest now?"
        except:
            pass

    # Replace placeholders with potentially updated values
    llm_response = llm_response.replace("{req.symbol}", req.symbol)
    if param_update:
        llm_response = llm_response.replace("{req.parameters.get('startDate')}", str(param_update.get('startDate', req.parameters.get('startDate'))))
        llm_response = llm_response.replace("{req.parameters.get('endDate')}", str(param_update.get('endDate', req.parameters.get('endDate'))))
        llm_response = llm_response.replace("{req.parameters.get('initialCapital')}", str(param_update.get('initialCapital', req.parameters.get('initialCapital'))))
        llm_response = llm_response.replace("{req.parameters.get('commission')}", str(param_update.get('commission', req.parameters.get('commission'))))

    python_pattern = triple_ticks + r'python(.*?)' + triple_ticks
    code_match = re.search(python_pattern, llm_response, re.DOTALL)
    
    strategy_code = None
    if code_match:
        strategy_code = code_match.group(1).strip()

    # --- ANTI-HALLUCINATION AUTO-RECOVERY ---
    # If the AI updated params or hallucinated results but forgot the code, grab the previous code from history!
    if not strategy_code and (param_update or "Simulation complete" in llm_response or "Return:" in llm_response):
        for msg in reversed(req.chat_history):
            prev_match = re.search(python_pattern, msg.content, re.DOTALL)
            if prev_match:
                strategy_code = prev_match.group(1).strip()
                break

    if not strategy_code:
        return {"status": "chat_reply", "message": llm_response, "param_update": param_update}

    try:
        start_date = req.parameters.get("startDate", "2023-01-01")
        if param_update and "startDate" in param_update: start_date = param_update["startDate"]

        end_date = req.parameters.get("endDate", datetime.today().strftime('%Y-%m-%d'))
        if param_update and "endDate" in param_update: end_date = param_update["endDate"]

        print(f"[SIMULATOR DEBUG] Downloading data for symbol: {req.symbol}, from {start_date} to {end_date}")
        df = yf.download(req.symbol, start=start_date, end=end_date, progress=False)
        print(f"[SIMULATOR DEBUG] Downloaded {len(df)} rows for {req.symbol}")
        if df.empty:
            raise ValueError(f"No data fetched for {req.symbol}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data fetch error: {str(e)}")

    exec_env = {}
    setup_code = """
import pandas as pd
import numpy as np
from backtesting import Strategy
from backtesting.lib import crossover

def SMA(values, n):
    return pd.Series(values).rolling(n).mean()

def EMA(values, n):
    return pd.Series(values).ewm(span=n, adjust=False).mean()

def RSI(values, n):
    delta = pd.Series(values).diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=n).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=n).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))
"""
    try:
        exec(setup_code, exec_env, exec_env)
        exec(strategy_code, exec_env, exec_env)
        CustomStrategy = exec_env.get("CustomStrategy")
        if not CustomStrategy:
            raise ValueError("LLM did not produce a class named 'CustomStrategy'")
    except Exception as e:
        error_msg = f"Failed to compile strategy code.\nError: {str(e)}\n\nCode generated:\n{strategy_code}"
        return {"status": "error", "message": error_msg, "param_update": param_update}

    try:
        cash = float(req.parameters.get("initialCapital", 100000))
        if param_update and "initialCapital" in param_update: cash = float(param_update["initialCapital"])
        
        comm = float(req.parameters.get("commission", 0.0))
        if param_update and "commission" in param_update: comm = float(param_update["commission"])
        
        bt = Backtest(df, CustomStrategy, cash=cash, commission=comm, exclusive_orders=True)
        stats = bt.run()
        
        trades_df = stats['_trades']
        if trades_df.empty:
            return {"status": "error", "message": "The strategy successfully compiled, but it executed 0 trades over the selected period.", "param_update": param_update}

        trade_markers = []
        equity_data = []
        
        # EXTRACT ACTUAL DATES FOR THE EQUITY CURVE
        if '_equity_curve' in stats and not stats['_equity_curve'].empty:
            eq_df = stats['_equity_curve']
            for dt, row in eq_df.iterrows():
                date_str = dt.strftime('%Y-%m-%d')
                equity_data.append({"time": date_str, "value": safe_float(row['Equity'])})

        unique_equity = []
        last_t = None
        for eq in equity_data:
            if eq["time"] != last_t:
                unique_equity.append(eq)
                last_t = eq["time"]
        
        for idx, row in trades_df.iterrows():
            size = int(row['Size'])
            direction = "Buy" if size > 0 else "Sell"
            
            trade_markers.append({
                "time": int(row['EntryTime'].timestamp()),
                "type": direction,
                "price": safe_float(row['EntryPrice']),
                "size": abs(size)
            })
            trade_markers.append({
                "time": int(row['ExitTime'].timestamp()),
                "type": "Exit",
                "price": safe_float(row['ExitPrice']),
                "pnl": safe_float(row['PnL']),
                "size": abs(size)
            })

        return {
            "status": "success",
            "message": "Strategy executed successfully.",
            "code": strategy_code,
            "param_update": param_update,
            "results": {
                "return_pct": safe_float(stats.get('Return [%]', 0.0)),
                "win_rate": safe_float(stats.get('Win Rate [%]', 0.0)),
                "max_drawdown": safe_float(stats.get('Max. Drawdown [%]', 0.0)),
                "sharpe": safe_float(stats.get('Sharpe Ratio', 0.0)),
                "profit_factor": safe_float(stats.get('Profit Factor', 0.0)),
                "total_trades": int(stats.get('# Trades', 0)),
                "trades": trade_markers,
                "equity_curve": unique_equity
            }
        }

    except Exception as e:
        return {"status": "error", "message": f"Backtest execution error: {traceback.format_exc()}", "param_update": param_update}