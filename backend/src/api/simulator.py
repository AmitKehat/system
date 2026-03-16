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

def is_approval(prompt: str) -> bool:
    """Check if the user's prompt is an approval to run the backtest."""
    prompt_lower = prompt.lower().strip()
    approval_phrases = [
        "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "go ahead",
        "run it", "do it", "proceed", "execute", "let's go", "approved",
        "confirm", "confirmed", "please run", "run the backtest", "run backtest",
        "sounds good", "looks good", "perfect", "great", "go for it"
    ]
    return any(phrase in prompt_lower for phrase in approval_phrases)

@router.post("/run")
async def run_simulation(req: SimulatorRequest):
    print(f"[SIMULATOR DEBUG] Request received - symbol: {req.symbol}, prompt: {req.prompt[:50]}...")
    if not req.api_key:
        raise HTTPException(status_code=400, detail="API Key is required.")

    triple_ticks = "`" * 3

    system_prompt = f"""
You are an expert quantitative trading assistant.
Your goal is to help users design and backtest trading strategies.
CRITICAL RULE: DO NOT mention the underlying Python libraries, frameworks, or code in your conversation.

CURRENT BACKTEST PARAMETERS (from the system):
- Current Chart Symbol: {req.symbol}
- Date Range: {req.parameters.get('startDate')} to {req.parameters.get('endDate')}
- Initial Capital: ${req.parameters.get('initialCapital')}
- Commission: {req.parameters.get('commission')} (fraction)

YOUR WORKFLOW (STRICT - follow these steps in order):

STEP 1 - UNDERSTAND THE STRATEGY:
- Converse with the user to understand their desired strategy
- Ask clarifying questions if needed
- Once you understand the strategy, proceed to Step 2

STEP 2 - PRESENT SUMMARY FOR APPROVAL:
- Determine the TARGET SYMBOL for the backtest:
  * If the user mentioned a specific ticker (AAPL, INTC, TSLA, etc.), use that ticker
  * If no ticker mentioned, use the current chart symbol: {req.symbol}
- Present the strategy summary using this EXACT HTML format:

{triple_ticks}json
{{"symbol": "TARGET_SYMBOL", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}}
{triple_ticks}

<h3 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Summary</h3>
<div style="margin-left: 10px; border-left: 3px solid #2962ff; padding-left: 15px; margin-bottom: 15px;">
  <span style="color: #787b86;">Target Symbol:</span> <b style="color: #2962ff;">TARGET_SYMBOL</b><br>
  <span style="color: #787b86;">Date Range:</span> <b style="color: #d1d4dc;">START_DATE</b> to <b style="color: #d1d4dc;">END_DATE</b><br>
  <span style="color: #787b86;">Initial Capital:</span> <b style="color: #089981;">${req.parameters.get('initialCapital')}</b><br>
  <span style="color: #787b86;">Commission:</span> <b style="color: #f23645;">{req.parameters.get('commission')}</b>
</div>
<h4 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Rules</h4>
<ul style="margin: 0 0 15px 20px; color: #d1d4dc;">
  <li>(Rule 1)</li>
  <li>(Rule 2)</li>
  ...
</ul>
<b style="color: #089981;">Should I run this backtest now?</b>

IMPORTANT: The JSON block MUST come BEFORE the HTML summary. Always include the symbol in the JSON block.

STEP 3 - EXECUTE ON APPROVAL:
- When the user approves (says "yes", "ok", "go ahead", "run it", etc.), output the Python code
- Output ONLY the CustomStrategy class wrapped in {triple_ticks}python ... {triple_ticks}
- DO NOT output the summary again, just the code

CRITICAL RULES:

1. SYMBOL DETECTION:
   - ALWAYS check if the user mentions a stock ticker (AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, INTC, AMD, SPY, QQQ, etc.)
   - If user says "buy INTC" or "strategy for AAPL" or "backtest on TSLA", extract that ticker
   - Include the extracted ticker in the JSON block

2. ANTI-HALLUCINATION:
   - NEVER invent or output fake backtest results
   - You CANNOT run backtests - only the system can
   - The ONLY way to trigger a backtest is to output Python code

3. STRATEGY MODIFICATIONS:
   - If the user wants to change the strategy after seeing the summary, update and show a NEW summary
   - If the user wants to change parameters (symbol, dates, etc.), show a NEW summary with updated values
   - ALWAYS require approval before outputting code

4. CODING RULES:
   - Create a class named CustomStrategy inheriting from Strategy
   - Use self.buy() to enter long positions
   - Use self.position.close() to exit positions (NOT self.sell() unless shorting)
   - Do NOT import anything - Strategy, pandas, numpy, SMA, EMA, RSI are pre-loaded
   - Extract datetime: current_dt = self.data.index[-1]
   - Handle weekends with range checks: if 1 <= current_dt.day <= 3 (not if current_dt.day == 2)
   - For monthly recurring: track state with (year, month) tuples

5. MONTHLY STRATEGY EXAMPLE:
   ```python
   class CustomStrategy(Strategy):
       def init(self):
           self.last_buy_month = None

       def next(self):
           current_dt = self.data.index[-1]
           current_month = (current_dt.year, current_dt.month)

           # Buy around day 2 (handle weekends)
           if 1 <= current_dt.day <= 3 and not self.position:
               if self.last_buy_month != current_month:
                   self.buy()
                   self.last_buy_month = current_month

           # Sell around day 28 (handle weekends)
           if current_dt.day >= 27 and self.position:
               self.position.close()
   ```
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

    # Extract parameter updates (JSON block)
    param_update = None
    json_pattern = triple_ticks + r'json(.*?)' + triple_ticks
    json_match = re.search(json_pattern, llm_response, re.DOTALL)

    if json_match:
        try:
            param_update = json.loads(json_match.group(1).strip())
            print(f"[SIMULATOR DEBUG] Extracted param_update: {param_update}")

            # Update symbol if provided
            if "symbol" in param_update:
                req.symbol = str(param_update["symbol"]).upper()
                print(f"[SIMULATOR DEBUG] Symbol updated to: {req.symbol}")

            # DO NOT remove JSON block from response - we need it in chat history for later recovery
            # The frontend will hide it from display
        except Exception as e:
            print(f"[SIMULATOR DEBUG] Failed to parse JSON: {e}")

    # Extract Python code
    python_pattern = triple_ticks + r'python(.*?)' + triple_ticks
    code_match = re.search(python_pattern, llm_response, re.DOTALL)

    strategy_code = None
    if code_match:
        strategy_code = code_match.group(1).strip()
        print(f"[SIMULATOR DEBUG] Found Python code in response, length: {len(strategy_code)}")

    # If user approved but LLM didn't output code, try to find code in history
    if not strategy_code and is_approval(req.prompt):
        print(f"[SIMULATOR DEBUG] User approved but no code in response. Searching history...")
        for msg in reversed(req.chat_history):
            prev_match = re.search(python_pattern, msg.content, re.DOTALL)
            if prev_match:
                strategy_code = prev_match.group(1).strip()
                print(f"[SIMULATOR DEBUG] Found code in history, length: {len(strategy_code)}")
                break

    # ALWAYS search history for symbol/params if we don't have them yet
    # This handles the case where LLM outputs code but not the JSON block on approval
    if not param_update and strategy_code:
        print(f"[SIMULATOR DEBUG] Have code but no param_update. Searching history for params...")
        for msg in reversed(req.chat_history):
            json_hist_match = re.search(json_pattern, msg.content, re.DOTALL)
            if json_hist_match:
                try:
                    hist_params = json.loads(json_hist_match.group(1).strip())
                    if "symbol" in hist_params:
                        req.symbol = str(hist_params["symbol"]).upper()
                        param_update = hist_params
                        print(f"[SIMULATOR DEBUG] Found params in history: {param_update}")
                        break
                except:
                    pass

    # If no code, return as chat reply (conversation continues)
    if not strategy_code:
        print(f"[SIMULATOR DEBUG] No strategy code - returning chat_reply")
        return {
            "status": "chat_reply",
            "message": llm_response,
            "param_update": param_update
        }

    # We have code - run the backtest!
    print(f"[SIMULATOR DEBUG] Running backtest for symbol: {req.symbol}")

    try:
        start_date = req.parameters.get("startDate", "2023-01-01")
        if param_update and "startDate" in param_update:
            start_date = param_update["startDate"]

        end_date = req.parameters.get("endDate", datetime.today().strftime('%Y-%m-%d'))
        if param_update and "endDate" in param_update:
            end_date = param_update["endDate"]

        print(f"[SIMULATOR DEBUG] Downloading data for {req.symbol} from {start_date} to {end_date}")
        df = yf.download(req.symbol, start=start_date, end=end_date, progress=False)
        print(f"[SIMULATOR DEBUG] Downloaded {len(df)} rows")

        if df.empty:
            raise ValueError(f"No data fetched for {req.symbol}")
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data fetch error: {str(e)}")

    # Setup execution environment
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

    # Run backtest
    try:
        cash = float(req.parameters.get("initialCapital", 100000))
        if param_update and "initialCapital" in param_update:
            cash = float(param_update["initialCapital"])

        comm = float(req.parameters.get("commission", 0.0))
        if param_update and "commission" in param_update:
            comm = float(param_update["commission"])

        bt = Backtest(df, CustomStrategy, cash=cash, commission=comm, exclusive_orders=True)
        stats = bt.run()

        trades_df = stats['_trades']
        if trades_df.empty:
            return {
                "status": "error",
                "message": "The strategy successfully compiled, but it executed 0 trades over the selected period.",
                "param_update": param_update
            }

        # Extract trade markers and equity curve
        trade_markers = []
        equity_data = []

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

        print(f"[SIMULATOR DEBUG] Backtest complete. Return: {stats.get('Return [%]', 0)}%")

        # Always include symbol in param_update for frontend to change chart
        if not param_update:
            param_update = {}
        param_update["symbol"] = req.symbol

        return {
            "status": "success",
            "message": "Strategy executed successfully.",
            "code": strategy_code,
            "param_update": param_update,
            "results": {
                "symbol": req.symbol,
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
        return {
            "status": "error",
            "message": f"Backtest execution error: {traceback.format_exc()}",
            "param_update": param_update
        }
