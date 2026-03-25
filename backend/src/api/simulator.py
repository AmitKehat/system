import os
import re
import json
import traceback
import requests
import math
import hashlib
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

def generate_code_hash(code: str) -> str:
    """Generate a hash of strategy code for identifying the same strategy logic.
    Normalizes code by removing comments, extra whitespace, and variable names to focus on logic."""
    # Remove single-line comments
    normalized = re.sub(r'#.*$', '', code, flags=re.MULTILINE)
    # Remove docstrings
    normalized = re.sub(r'""".*?"""', '', normalized, flags=re.DOTALL)
    normalized = re.sub(r"'''.*?'''", '', normalized, flags=re.DOTALL)
    # Remove extra whitespace and blank lines
    normalized = '\n'.join(line.strip() for line in normalized.split('\n') if line.strip())
    # Hash the normalized code
    return hashlib.md5(normalized.encode()).hexdigest()[:12]

def calculate_trade_excursions(df, trades_df, initial_cash: float) -> List[Dict]:
    """Calculate MFE/MAE for each trade using price data between entry/exit.
    Returns enhanced trade data with excursions and cumulative P&L."""
    enhanced_trades = []
    cumulative_pnl = 0.0

    for idx, row in trades_df.iterrows():
        entry_time = row['EntryTime']
        exit_time = row['ExitTime']
        entry_price = float(row['EntryPrice'])
        exit_price = float(row['ExitPrice'])
        size = int(row['Size'])
        pnl = float(row['PnL'])
        is_long = size > 0

        # Get price data between entry and exit
        try:
            trade_prices = df.loc[entry_time:exit_time]
            if trade_prices.empty:
                # Fallback if exact times not found
                trade_prices = df[(df.index >= entry_time) & (df.index <= exit_time)]
        except:
            trade_prices = pd.DataFrame()

        # Calculate MFE/MAE
        if not trade_prices.empty:
            if is_long:
                mfe_price = float(trade_prices['High'].max())
                mae_price = float(trade_prices['Low'].min())
                mfe_usd = (mfe_price - entry_price) * abs(size)
                mae_usd = (mae_price - entry_price) * abs(size)  # Will be negative or zero
            else:
                mfe_price = float(trade_prices['Low'].min())
                mae_price = float(trade_prices['High'].max())
                mfe_usd = (entry_price - mfe_price) * abs(size)
                mae_usd = (entry_price - mae_price) * abs(size)  # Will be negative or zero
        else:
            mfe_usd = max(0, pnl)
            mae_usd = min(0, pnl)

        position_value = entry_price * abs(size)
        mfe_pct = (mfe_usd / position_value) * 100 if position_value > 0 else 0
        mae_pct = (mae_usd / position_value) * 100 if position_value > 0 else 0
        pnl_pct = (pnl / position_value) * 100 if position_value > 0 else 0

        cumulative_pnl += pnl
        cumulative_pnl_pct = (cumulative_pnl / initial_cash) * 100

        # Duration in days
        duration_days = (exit_time - entry_time).days

        enhanced_trades.append({
            'trade_num': len(enhanced_trades) + 1,
            'entry_time': int(entry_time.timestamp()),
            'exit_time': int(exit_time.timestamp()),
            'entry_price': safe_float(entry_price),
            'exit_price': safe_float(exit_price),
            'size': abs(size),
            'is_long': is_long,
            'position_value': safe_float(position_value),
            'pnl_usd': safe_float(pnl),
            'pnl_pct': safe_float(pnl_pct),
            'mfe_usd': safe_float(mfe_usd),
            'mfe_pct': safe_float(mfe_pct),
            'mae_usd': safe_float(mae_usd),
            'mae_pct': safe_float(mae_pct),
            'cumulative_pnl_usd': safe_float(cumulative_pnl),
            'cumulative_pnl_pct': safe_float(cumulative_pnl_pct),
            'duration_days': duration_days
        })

    return enhanced_trades

def calculate_buy_hold(df, initial_capital: float, start_date, end_date) -> tuple:
    """Calculate Buy & Hold returns for comparison.
    Returns (return_pct, equity_curve)."""
    try:
        # Filter to period
        if isinstance(start_date, str):
            start_date = pd.Timestamp(start_date)
        if isinstance(end_date, str):
            end_date = pd.Timestamp(end_date)

        period_df = df[(df.index >= start_date) & (df.index <= end_date)]
        if period_df.empty:
            return 0.0, []

        first_price = float(period_df['Close'].iloc[0])
        shares = initial_capital / first_price

        buy_hold_equity = []
        for dt, row in period_df.iterrows():
            equity = shares * float(row['Close'])
            buy_hold_equity.append({
                "time": dt.strftime('%Y-%m-%d'),
                "value": safe_float(equity)
            })

        final_equity = shares * float(period_df['Close'].iloc[-1])
        return_pct = ((final_equity - initial_capital) / initial_capital) * 100

        return safe_float(return_pct), buy_hold_equity
    except Exception as e:
        print(f"[SIMULATOR] Buy & Hold calculation error: {e}")
        return 0.0, []

def calculate_max_drawdown_usd(equity_curve: List[Dict]) -> float:
    """Calculate maximum drawdown in USD from equity curve."""
    if not equity_curve:
        return 0.0

    peak = 0.0
    max_dd = 0.0

    for point in equity_curve:
        value = point.get('value', 0)
        if value > peak:
            peak = value
        dd = peak - value
        if dd > max_dd:
            max_dd = dd

    return max_dd

# Indicator type to overlay status mapping
INDICATOR_OVERLAY_MAP = {
    "sma": True,
    "ema": True,
    "bb": True,
    "vwap": True,
    "rsi": False,
    "macd": False,
    "stoch": False,
    "atr": False,
    "adx": False,
    "cci": False,
    "obv": False,
}

def extract_indicators_from_code(code: str) -> List[Dict]:
    """
    Parse strategy code to find indicator calls and extract their parameters.
    Returns a list of indicator definitions with type, period, and overlay status.
    """
    indicators = []
    seen = set()  # Track unique indicators to avoid duplicates

    # Pattern for SMA/EMA/RSI with period parameter: SMA(anything, 20) or EMA(x, 150)
    simple_pattern = r'\b(SMA|EMA|RSI)\s*\([^,]+,\s*(\d+)\)'
    for match in re.finditer(simple_pattern, code, re.IGNORECASE):
        ind_type = match.group(1).lower()
        period = int(match.group(2))
        key = f"{ind_type}_{period}"
        if key not in seen:
            seen.add(key)
            indicators.append({
                "type": ind_type,
                "period": period,
                "overlay": INDICATOR_OVERLAY_MAP.get(ind_type, True)
            })

    # Pattern for self.I() calls: self.I(SMA, self.data.Close, 20)
    self_i_pattern = r'self\.I\s*\(\s*(SMA|EMA|RSI)\s*,[^,]+,\s*(\d+)\)'
    for match in re.finditer(self_i_pattern, code, re.IGNORECASE):
        ind_type = match.group(1).lower()
        period = int(match.group(2))
        key = f"{ind_type}_{period}"
        if key not in seen:
            seen.add(key)
            indicators.append({
                "type": ind_type,
                "period": period,
                "overlay": INDICATOR_OVERLAY_MAP.get(ind_type, True)
            })

    return indicators


def get_max_indicator_period(indicators: List[Dict], code: str) -> int:
    """
    Get the maximum indicator period from the indicators list and code.
    This is used to determine how much warmup data to fetch.
    """
    max_period = 0

    # Check indicators list
    for ind in indicators:
        period = ind.get("period", 0)
        if period > max_period:
            max_period = period

    # Also scan code for any numeric periods we might have missed
    # Look for patterns like SMA(..., 150), EMA(..., 200), etc.
    period_pattern = r'\b(?:SMA|EMA|RSI|MACD|ATR|ADX|CCI|BB)\s*\([^)]*,\s*(\d+)'
    for match in re.finditer(period_pattern, code, re.IGNORECASE):
        period = int(match.group(1))
        if period > max_period:
            max_period = period

    return max_period


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

def extract_symbol_from_text(text: str) -> Optional[str]:
    """
    Extract a stock ticker symbol from user text.
    Returns the first valid ticker found, or None if no ticker detected.
    Works with ANY ticker symbol, not just a predefined list.
    """
    text_upper = text.upper()

    # Common English words to exclude (not tickers)
    excluded_words = {
        "I", "A", "AN", "THE", "TO", "FOR", "ON", "IN", "AT", "BY", "OF", "OR", "AND",
        "IT", "IS", "AS", "IF", "SO", "BE", "DO", "GO", "UP", "NO", "YES", "OK",
        "RUN", "BUY", "SELL", "USE", "TRY", "SET", "GET", "PUT", "ALL", "ANY",
        "DAY", "NOW", "NEW", "OLD", "END", "TOP", "LOW", "HIGH", "SAME", "THIS",
        "THAT", "WITH", "FROM", "YEAR", "ONLY", "WANT", "CELL", "CROSS", "ABOVE",
        "BELOW", "PRICE", "START", "STOP", "WHEN", "THEN", "ALSO", "JUST", "LIKE",
        "MAKE", "TAKE", "GIVE", "KEEP", "HOLD", "SHOW", "WORK", "MOVE", "HELP",
        "EMA", "SMA", "RSI", "MACD", "ATR", "ADX", "CODE", "NEXT", "LAST", "FIRST",
        # Python keywords that appear in strategy code
        "CLASS", "DEF", "SELF", "INIT", "TRUE", "FALSE", "NONE", "RETURN", "NOT",
        "DATA", "INDEX", "CLOSE", "OPEN", "VOLUME", "POSITION", "STRATEGY",
    }

    # First, look for explicit patterns like "for NVDA", "on TSLA", "run AAPL"
    # These patterns strongly indicate a ticker symbol
    explicit_patterns = [
        r'\bfor\s+([A-Z]{1,5})\b',
        r'\bon\s+([A-Z]{1,5})\b',
        r'\brun\s+(?:it\s+)?(?:on\s+)?([A-Z]{1,5})\b',
        r'\bbacktest\s+([A-Z]{1,5})\b',
        r'\btest\s+([A-Z]{1,5})\b',
        r'\busing\s+([A-Z]{1,5})\b',
        r'\bswitch\s+to\s+([A-Z]{1,5})\b',
        r'\bchange\s+to\s+([A-Z]{1,5})\b',
        r'\btry\s+([A-Z]{1,5})\b',
        r'\bsame\s+(?:strategy\s+)?(?:for\s+)?([A-Z]{1,5})\b',
        r'\bstrategy\s+(?:for\s+)?([A-Z]{1,5})\b',
        r'\bnow\s+([A-Z]{1,5})\b',
        r'\bnow\s+(?:for\s+)?([A-Z]{1,5})\b',
    ]

    for pattern in explicit_patterns:
        match = re.search(pattern, text_upper)
        if match:
            potential_ticker = match.group(1)
            if potential_ticker not in excluded_words and len(potential_ticker) >= 2:
                print(f"[SYMBOL EXTRACT] Found ticker via pattern: {potential_ticker}")
                return potential_ticker

    # Look for standalone 2-5 letter words that could be tickers
    # Search the UPPERCASE version to catch both "NVDA" and "nvda"
    ticker_pattern = r'\b([A-Z]{2,5})\b'
    for match in re.finditer(ticker_pattern, text_upper):
        potential_ticker = match.group(1)
        if potential_ticker not in excluded_words:
            print(f"[SYMBOL EXTRACT] Found standalone ticker: {potential_ticker}")
            return potential_ticker

    return None

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

STEP 2 - PRESENT SUMMARY FOR APPROVAL (MANDATORY - NEVER SKIP):
- CRITICAL: You MUST present a full summary with HTML formatting BEFORE outputting any code
- NEVER output Python code without first showing the summary and getting explicit user approval
- Determine the TARGET SYMBOL for the backtest:
  * If the user mentioned a specific ticker (AAPL, INTC, TSLA, etc.), use that ticker
  * If no ticker mentioned, use the current chart symbol: {req.symbol}
- Create a short, descriptive STRATEGY NAME based on the logic (e.g., "EMA 150 Crossover", "RSI Oversold Bounce", "Monthly DCA")
- Present the strategy summary using this EXACT HTML format:

{triple_ticks}json
{{"symbol": "TARGET_SYMBOL", "strategyName": "SHORT_DESCRIPTIVE_NAME", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "initialCapital": CAPITAL_NUMBER, "indicators": [{{"type": "ema", "period": 150}}], "rules": ["Entry: Buy when price crosses above EMA(150)", "Exit: Sell when price crosses below EMA(150)"]}}
{triple_ticks}

<h3 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Summary</h3>
<div style="margin-left: 10px; border-left: 3px solid #2962ff; padding-left: 15px; margin-bottom: 15px;">
  <span style="color: #787b86;">Strategy:</span> <b style="color: #2962ff;">STRATEGY_NAME</b><br>
  <span style="color: #787b86;">Target Symbol:</span> <b style="color: #2962ff;">TARGET_SYMBOL</b><br>
  <span style="color: #787b86;">Date Range:</span> <b style="color: #d1d4dc;">START_DATE</b> to <b style="color: #d1d4dc;">END_DATE</b><br>
  <span style="color: #787b86;">Initial Capital:</span> <b style="color: #089981;">${req.parameters.get('initialCapital')}</b><br>
  <span style="color: #787b86;">Commission:</span> <b style="color: #f23645;">{req.parameters.get('commission')}</b>
</div>
<h4 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Rules</h4>
<ul style="margin: 0 0 15px 20px; color: #d1d4dc;">
  <li><b style="color: #089981;">Entry:</b> (describe when to buy)</li>
  <li><b style="color: #f23645;">Exit:</b> (describe when to sell)</li>
</ul>
<b style="color: #089981;">Should I run this backtest now?</b>

IMPORTANT:
- The JSON block MUST come BEFORE the HTML summary
- Always include the symbol in the JSON block
- The "rules" array in JSON MUST contain the strategy logic (entry/exit conditions)
- The HTML Strategy Rules section MUST match the rules in the JSON block

STEP 3 - EXECUTE ON APPROVAL:
- When the user approves (says "yes", "ok", "go ahead", "run it", etc.), GENERATE and output the Python code
- CRITICAL: You MUST generate FRESH code that implements the strategy from the MOST RECENT summary you presented
- Do NOT copy or reuse code from earlier in the conversation - the strategy may have changed!
- If the user modified the strategy (changed indicator, period, rules, etc.), your new code MUST reflect those changes
- Output ONLY the CustomStrategy class wrapped in {triple_ticks}python ... {triple_ticks}
- DO NOT output the summary again, just the newly generated code

CRITICAL RULES:

1. SYMBOL DETECTION:
   - ALWAYS check if the user mentions a stock ticker (AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, INTC, AMD, SPY, QQQ, etc.)
   - If user says "buy INTC" or "strategy for AAPL" or "backtest on TSLA", extract that ticker
   - Include the extracted ticker in the JSON block

2. ANTI-HALLUCINATION:
   - NEVER invent or output fake backtest results
   - You CANNOT run backtests - only the system can
   - The ONLY way to trigger a backtest is to output Python code
   - MANDATORY SEQUENCE: Summary MUST be shown BEFORE code
     * First message: Show JSON block + HTML summary, ask "Should I run this?"
     * Second message (after user says "yes"): Output Python code only
   - NEVER combine summary and code in the same message
   - NEVER output code in response to the initial strategy request

3. STRATEGY MODIFICATIONS:
   - If the user wants to change the strategy after seeing the summary, update and show a NEW summary
   - If the user wants to change parameters (symbol, dates, etc.), show a NEW summary with updated values
   - CRITICAL: When presenting a new strategy summary, treat it as a COMPLETELY NEW STRATEGY
   - Any previous code in the conversation is OBSOLETE and must NOT be reused
   - When user approves the new summary, generate ENTIRELY NEW code matching the new strategy
   - ALWAYS require approval before outputting code

4. CODING RULES:
   - Create a class named CustomStrategy inheriting from Strategy
   - Use self.buy() to enter long positions
   - Use self.position.close() to exit positions (NOT self.sell() unless shorting)
   - Do NOT import anything - Strategy, pandas, numpy, SMA, EMA, RSI are pre-loaded
   - Extract datetime: current_dt = self.data.index[-1]
   - Handle weekends with range checks: if 1 <= current_dt.day <= 3 (not if current_dt.day == 2)
   - For monthly recurring: track state with (year, month) tuples
   - VERIFICATION: Before outputting code, VERIFY it matches the CURRENT strategy:
     * If current strategy uses SMA(50), the code MUST use SMA(..., 50), NOT EMA or any other indicator
     * If current strategy uses EMA(150), the code MUST use EMA(..., 150)
     * The indicator in the code MUST match the indicator in your most recent JSON summary

5. INDICATOR LISTING:
   - In the JSON block, list ALL technical indicators your strategy uses
   - Format: "indicators": [{{"type": "indicator_name", "period": number}}]
   - Supported types: "sma", "ema", "rsi", "macd", "bb" (bollinger bands)
   - Examples:
     * EMA crossover: "indicators": [{{"type": "ema", "period": 50}}, {{"type": "ema", "period": 200}}]
     * RSI strategy: "indicators": [{{"type": "rsi", "period": 14}}]
     * No indicators (price-only): "indicators": []
   - These indicators will be automatically displayed on the chart

6. MONTHLY STRATEGY EXAMPLE:
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

    # DEBUG: Print LLM response summary
    print(f"[SIMULATOR DEBUG] ========== LLM RESPONSE ==========")
    print(f"[SIMULATOR DEBUG] User prompt: '{req.prompt}'")
    print(f"[SIMULATOR DEBUG] Is approval: {is_approval(req.prompt)}")
    print(f"[SIMULATOR DEBUG] Response length: {len(llm_response)}")
    print(f"[SIMULATOR DEBUG] Response first 500 chars: {llm_response[:500]}")
    print(f"[SIMULATOR DEBUG] ===================================")

    # Extract parameter updates (JSON block)
    param_update = None
    json_pattern = triple_ticks + r'json(.*?)' + triple_ticks
    json_match = re.search(json_pattern, llm_response, re.DOTALL)

    if json_match:
        try:
            param_update = json.loads(json_match.group(1).strip())
            print(f"[SIMULATOR DEBUG] Extracted param_update from LLM response: {param_update}")

            # Update symbol if provided
            if "symbol" in param_update:
                req.symbol = str(param_update["symbol"]).upper()
                print(f"[SIMULATOR DEBUG] Symbol updated to: {req.symbol}")

            # DO NOT remove JSON block from response - we need it in chat history for later recovery
            # The frontend will hide it from display
        except Exception as e:
            print(f"[SIMULATOR DEBUG] Failed to parse JSON: {e}")
    else:
        print(f"[SIMULATOR DEBUG] No JSON block found in LLM response")

    # Extract Python code
    python_pattern = triple_ticks + r'python(.*?)' + triple_ticks
    code_match = re.search(python_pattern, llm_response, re.DOTALL)

    strategy_code = None
    if code_match:
        strategy_code = code_match.group(1).strip()
        # DEBUG: Print code snippet to see what strategy it is
        code_preview = strategy_code[:300] if len(strategy_code) > 300 else strategy_code
        print(f"[SIMULATOR DEBUG] Found Python code in LLM response, length: {len(strategy_code)}")
        print(f"[SIMULATOR DEBUG] Code preview: {code_preview}")
    else:
        print(f"[SIMULATOR DEBUG] No Python code found in LLM response")

    # If user approved but LLM didn't output code, try to find code in history
    # IMPORTANT: Only use code that belongs to the CURRENT strategy, not old strategies
    if not strategy_code and is_approval(req.prompt):
        print(f"[SIMULATOR DEBUG] ========== HISTORY SEARCH ==========")
        print(f"[SIMULATOR DEBUG] User approved but no code in LLM response. Searching history...")
        print(f"[SIMULATOR DEBUG] Chat history length: {len(req.chat_history)}")

        # DEBUG: Print all messages in history with their indices
        for i, msg in enumerate(req.chat_history):
            has_json = '```json' in msg.content
            has_python = '```python' in msg.content
            print(f"[SIMULATOR DEBUG] History[{i}] role={msg.role}, has_json={has_json}, has_python={has_python}, content_len={len(msg.content)}")

        # First, find the index of the most recent strategy summary (JSON block with strategyName)
        most_recent_json_idx = -1
        most_recent_strategy_name = None
        for i, msg in enumerate(reversed(req.chat_history)):
            actual_idx = len(req.chat_history) - 1 - i
            json_hist_match = re.search(json_pattern, msg.content, re.DOTALL)
            if json_hist_match:
                try:
                    hist_params = json.loads(json_hist_match.group(1).strip())
                    print(f"[SIMULATOR DEBUG] Found JSON at idx {actual_idx}: {hist_params}")
                    if "strategyName" in hist_params:
                        most_recent_json_idx = actual_idx
                        most_recent_strategy_name = hist_params.get("strategyName")
                        print(f"[SIMULATOR DEBUG] This is the most recent strategy summary: {most_recent_strategy_name}")
                        break
                except Exception as e:
                    print(f"[SIMULATOR DEBUG] Failed to parse JSON at idx {actual_idx}: {e}")

        print(f"[SIMULATOR DEBUG] Most recent strategy summary idx: {most_recent_json_idx}, name: {most_recent_strategy_name}")

        # Now search for code, but ONLY use it if it appears AFTER the most recent strategy summary
        # OR if there's no strategy summary (legacy behavior)
        for i, msg in enumerate(reversed(req.chat_history)):
            msg_idx = len(req.chat_history) - 1 - i
            prev_match = re.search(python_pattern, msg.content, re.DOTALL)
            if prev_match:
                code_found = prev_match.group(1).strip()
                code_preview = code_found[:200] if len(code_found) > 200 else code_found
                print(f"[SIMULATOR DEBUG] Found code at idx {msg_idx}, preview: {code_preview[:100]}...")

                # Check if this code is from a previous (different) strategy
                if most_recent_json_idx != -1 and msg_idx < most_recent_json_idx:
                    print(f"[SIMULATOR DEBUG] Code at idx {msg_idx} is BEFORE strategy summary at idx {most_recent_json_idx}")
                    print(f"[SIMULATOR DEBUG] This is OLD code from a previous strategy - NOT using it")
                    print(f"[SIMULATOR DEBUG] LLM needs to generate new code for: {most_recent_strategy_name}")
                    # Don't use this old code - let the LLM generate new code
                    break
                else:
                    strategy_code = code_found
                    print(f"[SIMULATOR DEBUG] Using code from idx {msg_idx}, length: {len(strategy_code)}")
                    break

        print(f"[SIMULATOR DEBUG] ===================================")
        print(f"[SIMULATOR DEBUG] Final strategy_code is {'SET' if strategy_code else 'NONE'}")

    # If we have code, we need to determine the correct symbol
    # PRIORITY ORDER (user's current request ALWAYS takes precedence):
    # 1. Check user's CURRENT prompt for a new symbol (e.g., "run for NVDA") - HIGHEST PRIORITY
    # 2. Use param_update from LLM response if it contains a symbol
    # 3. Search history for symbol (important for approval messages like "yes")
    # 4. Extract from LLM response text (LAST RESORT - avoid picking up code keywords)
    if strategy_code:
        print(f"[SIMULATOR DEBUG] User prompt: '{req.prompt}'")
        user_prompt_symbol = extract_symbol_from_text(req.prompt)
        print(f"[SIMULATOR DEBUG] Extracted from user prompt: {user_prompt_symbol}")

        # User's current prompt ALWAYS takes priority over LLM's response
        if user_prompt_symbol:
            print(f"[SIMULATOR DEBUG] Using symbol from user prompt (HIGHEST PRIORITY): {user_prompt_symbol}")
            req.symbol = user_prompt_symbol
            if not param_update:
                param_update = {}
            param_update["symbol"] = user_prompt_symbol  # Override LLM's symbol if different
        elif param_update and "symbol" in param_update:
            # LLM already provided symbol in JSON block, use it
            print(f"[SIMULATOR DEBUG] Using symbol from LLM JSON block: {param_update['symbol']}")
            req.symbol = str(param_update["symbol"]).upper()
        else:
            # Search history FIRST (especially important for "yes" approval messages)
            print(f"[SIMULATOR DEBUG] No symbol in current context. Searching history first...")
            print(f"[SIMULATOR DEBUG] Chat history length: {len(req.chat_history)}")
            found_in_history = False
            for i, msg in enumerate(reversed(req.chat_history)):
                json_hist_match = re.search(json_pattern, msg.content, re.DOTALL)
                if json_hist_match:
                    try:
                        hist_params = json.loads(json_hist_match.group(1).strip())
                        print(f"[SIMULATOR DEBUG] Found JSON in history msg {len(req.chat_history) - 1 - i}: {hist_params}")
                        if "symbol" in hist_params:
                            req.symbol = str(hist_params["symbol"]).upper()
                            if not param_update:
                                param_update = hist_params
                            else:
                                param_update["symbol"] = req.symbol
                            print(f"[SIMULATOR DEBUG] Using symbol from history: {req.symbol}")
                            found_in_history = True
                            break
                    except Exception as e:
                        print(f"[SIMULATOR DEBUG] Failed to parse history JSON: {e}")

            # Only try LLM response text as LAST RESORT (and avoid if code is present)
            if not found_in_history:
                print(f"[SIMULATOR DEBUG] No symbol in history. Trying LLM response text (last resort)...")
                # Don't extract from code blocks - strip them first
                llm_text_no_code = re.sub(r'```python.*?```', '', llm_response, flags=re.DOTALL)
                llm_response_symbol = extract_symbol_from_text(llm_text_no_code)
                print(f"[SIMULATOR DEBUG] Extracted from LLM response (no code): {llm_response_symbol}")

                if llm_response_symbol:
                    print(f"[SIMULATOR DEBUG] Using symbol from LLM response text: {llm_response_symbol}")
                    req.symbol = llm_response_symbol
                    if not param_update:
                        param_update = {}
                    param_update["symbol"] = llm_response_symbol
                else:
                    print(f"[SIMULATOR DEBUG] WARNING: Could not determine symbol! Using request symbol: {req.symbol}")

    # If no code, return as chat reply (conversation continues)
    if not strategy_code:
        print(f"[SIMULATOR DEBUG] No strategy code - returning chat_reply")

        # Special case: user approved but no code was found for the new strategy
        # This happens when user changed strategy but LLM didn't generate new code
        if is_approval(req.prompt) and param_update and param_update.get("strategyName"):
            strategy_name = param_update.get("strategyName", "the new strategy")
            target_symbol = param_update.get("symbol", req.symbol)
            start_date = param_update.get("startDate", req.parameters.get("startDate", "2023-01-01"))
            end_date = param_update.get("endDate", req.parameters.get("endDate", "2024-12-31"))
            initial_capital = param_update.get("initialCapital", req.parameters.get("initialCapital", 100000))
            commission = param_update.get("commission", req.parameters.get("commission", 0.001))

            # Build indicators list for display
            indicators_display = ""
            if param_update.get("indicators"):
                for ind in param_update["indicators"]:
                    ind_type = ind.get("type", "").upper()
                    ind_period = ind.get("period", "")
                    if ind_period:
                        indicators_display += f"  <li>{ind_type}({ind_period})</li>\n"

            # Build strategy rules list for display
            rules_display = ""
            if param_update.get("rules"):
                for rule in param_update["rules"]:
                    # Color code entry/exit rules
                    if rule.lower().startswith("entry"):
                        rules_display += f'  <li><b style="color: #089981;">Entry:</b> {rule[6:].strip() if rule.lower().startswith("entry:") else rule}</li>\n'
                    elif rule.lower().startswith("exit"):
                        rules_display += f'  <li><b style="color: #f23645;">Exit:</b> {rule[5:].strip() if rule.lower().startswith("exit:") else rule}</li>\n'
                    else:
                        rules_display += f"  <li>{rule}</li>\n"

            retry_message = f"""```json
{json.dumps(param_update, indent=2)}
```

<h3 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Summary</h3>
<div style="margin-left: 10px; border-left: 3px solid #2962ff; padding-left: 15px; margin-bottom: 15px;">
  <span style="color: #787b86;">Strategy:</span> <b style="color: #2962ff;">{strategy_name}</b><br>
  <span style="color: #787b86;">Target Symbol:</span> <b style="color: #2962ff;">{target_symbol}</b><br>
  <span style="color: #787b86;">Date Range:</span> <b style="color: #d1d4dc;">{start_date}</b> to <b style="color: #d1d4dc;">{end_date}</b><br>
  <span style="color: #787b86;">Initial Capital:</span> <b style="color: #089981;">${initial_capital:,}</b><br>
  <span style="color: #787b86;">Commission:</span> <b style="color: #f23645;">{commission}</b>
</div>
{f'<h4 style="margin: 0 0 10px 0; color: #d1d4dc;">Indicators</h4><ul style="margin: 0 0 15px 20px; color: #d1d4dc;">{indicators_display}</ul>' if indicators_display else ''}
<h4 style="margin: 0 0 10px 0; color: #d1d4dc;">Strategy Rules</h4>
<ul style="margin: 0 0 15px 20px; color: #d1d4dc;">
{rules_display if rules_display else '  <li>Rules as described in conversation</li>'}
</ul>
<b style="color: #089981;">Should I run this backtest now?</b>"""

            return {
                "status": "chat_reply",
                "message": retry_message,
                "param_update": param_update
            }

        return {
            "status": "chat_reply",
            "message": llm_response,
            "param_update": param_update
        }

    # We have code - run the backtest!
    # Extract indicators from code to determine warmup period
    code_indicators = extract_indicators_from_code(strategy_code)
    llm_indicators = []
    if param_update and "indicators" in param_update:
        llm_indicators = param_update["indicators"]
    all_indicators = llm_indicators + code_indicators
    max_period = get_max_indicator_period(all_indicators, strategy_code)

    try:
        start_date = req.parameters.get("startDate", "2023-01-01")
        if param_update and "startDate" in param_update:
            start_date = param_update["startDate"]

        end_date = req.parameters.get("endDate", datetime.today().strftime('%Y-%m-%d'))
        if param_update and "endDate" in param_update:
            end_date = param_update["endDate"]

        # Calculate warmup start date - need extra data for indicator calculation
        # Trading days ≈ 252/year, so we need max_period * 1.5 calendar days to be safe
        # Add buffer of 50 extra days for safety
        warmup_days = int(max_period * 1.5) + 50 if max_period > 0 else 0

        actual_start_date = datetime.strptime(start_date, '%Y-%m-%d')
        warmup_start_date = actual_start_date - pd.Timedelta(days=warmup_days)
        warmup_start_str = warmup_start_date.strftime('%Y-%m-%d')

        print(f"[SIMULATOR] Running backtest for {req.symbol} ({start_date} to {end_date}), warmup: {warmup_days} days")
        df = yf.download(req.symbol, start=warmup_start_str, end=end_date, progress=False)

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

        # Filter trades to only include those within the requested date range
        # (exclude warmup period trades)
        if not trades_df.empty and warmup_days > 0:
            actual_start_dt = pd.Timestamp(actual_start_date).tz_localize(None)
            original_count = len(trades_df)

            # Make sure EntryTime is also timezone-naive for comparison
            trades_df_copy = trades_df.copy()
            if trades_df_copy['EntryTime'].dt.tz is not None:
                trades_df_copy['EntryTime'] = trades_df_copy['EntryTime'].dt.tz_localize(None)

            trades_df = trades_df[trades_df_copy['EntryTime'] >= actual_start_dt]
            if original_count != len(trades_df):
                print(f"[SIMULATOR] Filtered trades: {original_count} -> {len(trades_df)}")

        # Check for open position at end of backtest
        # backtesting.py tracks this in the equity curve - if final equity differs from
        # cash + sum of closed trade PnLs, there's an open position
        final_equity = None
        full_eq_df = None
        if '_equity_curve' in stats and not stats['_equity_curve'].empty:
            full_eq_df = stats['_equity_curve']
            final_equity = full_eq_df['Equity'].iloc[-1]

        # Use ALL trades (including warmup) for open position calculation
        all_trades_df = stats['_trades']
        all_closed_pnl = all_trades_df['PnL'].sum() if not all_trades_df.empty else 0
        initial_cash = cash

        # If there's a significant difference between final equity and (cash + all closed PnL),
        # there's an open position
        open_position_value = final_equity - (initial_cash + all_closed_pnl) if final_equity else 0
        has_open_position = abs(open_position_value) > 1  # More than $1 difference

        print(f"[SIMULATOR] Open position check: final_equity={final_equity}, initial_cash={initial_cash}, all_closed_pnl={all_closed_pnl:.2f}, diff={open_position_value:.2f}, has_open={has_open_position}")

        # If there's an open position, find when it was entered by analyzing the equity curve
        open_position_entry = None
        if has_open_position and full_eq_df is not None:
            # Filter equity to actual period (after warmup)
            period_eq_df = full_eq_df[full_eq_df.index >= actual_start_date]

            # Find the last closed trade exit time (within the actual period)
            last_exit_time = None
            if not trades_df.empty:
                last_exit_time = trades_df['ExitTime'].max()
                print(f"[SIMULATOR] Last closed trade exit: {last_exit_time}")

            # Look for when equity started moving after the last exit
            # This indicates when the new position was opened
            if last_exit_time is not None:
                # Get baseline equity AT the last exit (position just closed, only cash remains)
                try:
                    if last_exit_time in full_eq_df.index:
                        baseline_equity = full_eq_df.loc[last_exit_time, 'Equity']
                    else:
                        # Find closest index to last exit time
                        idx = full_eq_df.index.get_indexer([last_exit_time], method='nearest')[0]
                        baseline_equity = full_eq_df.iloc[idx]['Equity']
                    print(f"[SIMULATOR] Baseline equity at exit: ${baseline_equity:.2f}")
                except Exception as e:
                    print(f"[SIMULATOR] Could not get baseline equity: {e}")
                    baseline_equity = initial_cash + all_closed_pnl

                # Get equity data after the last exit
                post_exit_eq = period_eq_df[period_eq_df.index > last_exit_time]
                if not post_exit_eq.empty:
                    # Find the first day where equity CHANGES from baseline
                    # This is when the new position was opened
                    for dt, row in post_exit_eq.iterrows():
                        equity_change = abs(row['Equity'] - baseline_equity)
                        if equity_change > 50:  # More than $50 change indicates position entry
                            open_position_entry = dt
                            print(f"[SIMULATOR] Found open position entry at: {dt} (equity change: ${equity_change:.2f})")
                            break

                    if open_position_entry is None:
                        print(f"[SIMULATOR] WARNING: No equity change detected after exit. Post-exit rows: {len(post_exit_eq)}")
            else:
                # No closed trades in actual period - open position is from first trade in period
                for dt, row in period_eq_df.iterrows():
                    if abs(row['Equity'] - initial_cash) > 100:
                        open_position_entry = dt
                        print(f"[SIMULATOR] Found open position entry (no prior trades) at: {dt}")
                        break

        if trades_df.empty and not has_open_position:
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
            # Filter equity curve to actual start date (exclude warmup)
            if warmup_days > 0:
                eq_df = eq_df[eq_df.index >= actual_start_date]

            # IMPORTANT: Normalize equity curve to start at initial capital
            # The backtest might have executed trades during warmup that affected equity
            # We need to reset the equity curve to start fresh from initial capital
            if not eq_df.empty:
                first_equity_value = float(eq_df.iloc[0]['Equity'])
                equity_offset = cash - first_equity_value  # Offset to normalize to initial capital

                for dt, row in eq_df.iterrows():
                    date_str = dt.strftime('%Y-%m-%d')
                    normalized_value = float(row['Equity']) + equity_offset
                    equity_data.append({"time": date_str, "value": safe_float(normalized_value)})

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

        # Add marker for open position entry (if any)
        if open_position_entry is not None:
            # Estimate position size from the open position value and last price
            last_price = df['Close'].iloc[-1] if not df.empty else 0
            estimated_size = int(abs(open_position_value) / last_price) if last_price > 0 else 0

            # Determine direction from equity change
            direction = "Buy" if open_position_value > 0 else "Sell"

            # Get the entry price from the data at entry date
            entry_price = 0
            try:
                if open_position_entry in df.index:
                    entry_price = float(df.loc[open_position_entry, 'Close'])
                else:
                    # Find closest date
                    closest_idx = df.index.get_indexer([open_position_entry], method='nearest')[0]
                    entry_price = float(df.iloc[closest_idx]['Close'])
            except:
                pass

            trade_markers.append({
                "time": int(open_position_entry.timestamp()),
                "type": direction,
                "price": safe_float(entry_price),
                "size": estimated_size,
                "open": True  # Flag to indicate this is an open position
            })
            print(f"[SIMULATOR] Open position detected: {direction} on {open_position_entry.strftime('%Y-%m-%d')}")

        # Summary log
        print(f"[SIMULATOR] Backtest complete: {len(trades_df)} closed trades, {len(trade_markers)} markers, Return: {stats.get('Return [%]', 0):.2f}%")

        # Generate code hash for strategy identification
        code_hash = generate_code_hash(strategy_code)

        # Extract strategy name from param_update or generate default
        strategy_name = "Custom Strategy"
        if param_update and "strategyName" in param_update:
            strategy_name = param_update["strategyName"]

        # Extract indicators - combine LLM-provided and code-extracted
        llm_indicators = []
        if param_update and "indicators" in param_update:
            for ind in param_update["indicators"]:
                ind_type = ind.get("type", "").lower()
                period = ind.get("period", 0)
                if ind_type and period:
                    llm_indicators.append({
                        "type": ind_type,
                        "period": period,
                        "overlay": INDICATOR_OVERLAY_MAP.get(ind_type, True)
                    })

        # Extract indicators from code as validation/fallback
        code_indicators = extract_indicators_from_code(strategy_code)

        # Use LLM indicators if provided, otherwise use code-extracted
        # Merge: add any code-extracted indicators not in LLM list
        strategy_indicators = llm_indicators.copy()
        llm_keys = {f"{i['type']}_{i['period']}" for i in llm_indicators}
        for ind in code_indicators:
            key = f"{ind['type']}_{ind['period']}"
            if key not in llm_keys:
                strategy_indicators.append(ind)

        # Always include symbol in param_update for frontend to change chart
        if not param_update:
            param_update = {}
        param_update["symbol"] = req.symbol

        # Calculate enhanced trade data with MFE/MAE
        trades_detailed = []
        profitable_count = 0
        losing_count = 0
        if not trades_df.empty:
            trades_detailed = calculate_trade_excursions(df, trades_df, cash)
            profitable_count = sum(1 for t in trades_detailed if t['pnl_usd'] > 0)
            losing_count = sum(1 for t in trades_detailed if t['pnl_usd'] < 0)

        # Calculate Buy & Hold comparison
        buy_hold_return_pct, buy_hold_equity_curve = calculate_buy_hold(df, cash, start_date, end_date)

        # Calculate USD-based metrics
        final_equity_value = unique_equity[-1]['value'] if unique_equity else cash
        total_pnl_usd = final_equity_value - cash
        max_drawdown_usd = calculate_max_drawdown_usd(unique_equity)

        # IMPORTANT: Calculate return percentage from NORMALIZED equity curve, not raw stats
        # The stats.get('Return [%]') includes warmup period which we don't want
        normalized_return_pct = (total_pnl_usd / cash) * 100 if cash > 0 else 0.0

        return {
            "status": "success",
            "message": "Strategy executed successfully.",
            "code": strategy_code,
            "code_hash": code_hash,
            "strategy_name": strategy_name,
            "strategy_indicators": strategy_indicators,
            "param_update": param_update,
            "results": {
                "symbol": req.symbol,
                # Percentage metrics - use normalized return
                "return_pct": safe_float(normalized_return_pct),
                "win_rate": safe_float(stats.get('Win Rate [%]', 0.0)),
                "max_drawdown_pct": safe_float(stats.get('Max. Drawdown [%]', 0.0)),
                "sharpe": safe_float(stats.get('Sharpe Ratio', 0.0)),
                "profit_factor": safe_float(stats.get('Profit Factor', 0.0)),
                # USD metrics
                "total_pnl_usd": safe_float(total_pnl_usd),
                "max_drawdown_usd": safe_float(max_drawdown_usd),
                # Trade counts
                "total_trades": int(stats.get('# Trades', 0)),
                "profitable_trades": profitable_count,
                "losing_trades": losing_count,
                # Buy & Hold comparison
                "buy_hold_return_pct": safe_float(buy_hold_return_pct),
                "buy_hold_equity_curve": buy_hold_equity_curve,
                # Trade data
                "trades": trade_markers,
                "trades_detailed": trades_detailed,
                "equity_curve": unique_equity,
                # Backtest parameters (for re-running)
                "start_date": start_date,
                "end_date": end_date,
                "initial_capital": cash,
                "commission": comm
            }
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Backtest execution error: {traceback.format_exc()}",
            "param_update": param_update
        }


class RerunRequest(BaseModel):
    strategy_code: str
    symbol: str
    start_date: str
    end_date: str
    initial_capital: float
    commission: float

@router.post("/rerun")
async def rerun_simulation(req: RerunRequest):
    """Re-run an existing strategy with new date range (no LLM call)."""
    print(f"[SIMULATOR] Rerun request: {req.symbol} ({req.start_date} to {req.end_date})")

    strategy_code = req.strategy_code
    if not strategy_code or "class CustomStrategy" not in strategy_code:
        raise HTTPException(status_code=400, detail="Invalid strategy code")

    # Extract indicators from code to determine warmup period
    code_indicators = extract_indicators_from_code(strategy_code)
    max_period = get_max_indicator_period(code_indicators, strategy_code)

    try:
        start_date = req.start_date
        end_date = req.end_date

        # Calculate warmup start date
        warmup_days = int(max_period * 1.5) + 50 if max_period > 0 else 0
        actual_start_date = datetime.strptime(start_date, '%Y-%m-%d')
        warmup_start_date = actual_start_date - pd.Timedelta(days=warmup_days)
        warmup_start_str = warmup_start_date.strftime('%Y-%m-%d')

        print(f"[SIMULATOR] Rerun: Fetching data from {warmup_start_str} (warmup: {warmup_days} days)")
        df = yf.download(req.symbol, start=warmup_start_str, end=end_date, progress=False)

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
            raise ValueError("Strategy code does not contain 'CustomStrategy' class")
    except Exception as e:
        return {"status": "error", "message": f"Failed to compile strategy: {str(e)}"}

    # Run backtest
    try:
        cash = req.initial_capital
        comm = req.commission

        bt = Backtest(df, CustomStrategy, cash=cash, commission=comm, exclusive_orders=True)
        stats = bt.run()

        trades_df = stats['_trades']

        # Filter trades to actual date range
        if not trades_df.empty and warmup_days > 0:
            actual_start_dt = pd.Timestamp(actual_start_date).tz_localize(None)
            trades_df_copy = trades_df.copy()
            if trades_df_copy['EntryTime'].dt.tz is not None:
                trades_df_copy['EntryTime'] = trades_df_copy['EntryTime'].dt.tz_localize(None)
            trades_df = trades_df[trades_df_copy['EntryTime'] >= actual_start_dt]

        # Extract trade markers
        trade_markers = []
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

        # Extract equity curve
        equity_data = []
        if '_equity_curve' in stats and not stats['_equity_curve'].empty:
            eq_df = stats['_equity_curve']
            if warmup_days > 0:
                eq_df = eq_df[eq_df.index >= actual_start_date]

            # IMPORTANT: Normalize equity curve to start at initial capital
            if not eq_df.empty:
                first_equity_value = float(eq_df.iloc[0]['Equity'])
                equity_offset = cash - first_equity_value

                for dt, row in eq_df.iterrows():
                    date_str = dt.strftime('%Y-%m-%d')
                    normalized_value = float(row['Equity']) + equity_offset
                    equity_data.append({"time": date_str, "value": safe_float(normalized_value)})

        # Deduplicate equity
        unique_equity = []
        last_t = None
        for eq in equity_data:
            if eq["time"] != last_t:
                unique_equity.append(eq)
                last_t = eq["time"]

        # Calculate enhanced trade data
        trades_detailed = []
        profitable_count = 0
        losing_count = 0
        if not trades_df.empty:
            trades_detailed = calculate_trade_excursions(df, trades_df, cash)
            profitable_count = sum(1 for t in trades_detailed if t['pnl_usd'] > 0)
            losing_count = sum(1 for t in trades_detailed if t['pnl_usd'] < 0)

        # Calculate Buy & Hold
        buy_hold_return_pct, buy_hold_equity_curve = calculate_buy_hold(df, cash, start_date, end_date)

        # Calculate USD metrics
        final_equity_value = unique_equity[-1]['value'] if unique_equity else cash
        total_pnl_usd = final_equity_value - cash
        max_drawdown_usd = calculate_max_drawdown_usd(unique_equity)

        # IMPORTANT: Calculate return percentage from NORMALIZED equity curve
        normalized_return_pct = (total_pnl_usd / cash) * 100 if cash > 0 else 0.0

        # Generate code hash
        code_hash = generate_code_hash(strategy_code)

        print(f"[SIMULATOR] Rerun complete: {len(trades_df)} trades, Return: {normalized_return_pct:.2f}%")

        return {
            "status": "success",
            "message": "Strategy re-executed successfully.",
            "code": strategy_code,
            "code_hash": code_hash,
            "results": {
                "symbol": req.symbol,
                "return_pct": safe_float(normalized_return_pct),
                "win_rate": safe_float(stats.get('Win Rate [%]', 0.0)),
                "max_drawdown_pct": safe_float(stats.get('Max. Drawdown [%]', 0.0)),
                "sharpe": safe_float(stats.get('Sharpe Ratio', 0.0)),
                "profit_factor": safe_float(stats.get('Profit Factor', 0.0)),
                "total_pnl_usd": safe_float(total_pnl_usd),
                "max_drawdown_usd": safe_float(max_drawdown_usd),
                "total_trades": int(stats.get('# Trades', 0)),
                "profitable_trades": profitable_count,
                "losing_trades": losing_count,
                "buy_hold_return_pct": safe_float(buy_hold_return_pct),
                "buy_hold_equity_curve": buy_hold_equity_curve,
                "trades": trade_markers,
                "trades_detailed": trades_detailed,
                "equity_curve": unique_equity,
                "start_date": start_date,
                "end_date": end_date,
                "initial_capital": cash,
                "commission": comm
            }
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Backtest execution error: {traceback.format_exc()}"
        }
