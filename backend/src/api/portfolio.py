# src/api/portfolio.py
"""
Portfolio API endpoints for IB account data.
Provides account info, positions, orders, and trades.
Routed primarily to the Execution Slave (Paper Gateway).
"""

import json
import os
import time
import uuid
from typing import Optional, List

import redis
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

# ============== Redis Connection ==============
# CRITICAL FIX: Use a Connection Pool to safely support FastAPI multithreading
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
redis_pool = redis.ConnectionPool.from_url(redis_url, decode_responses=True)

def rconn() -> redis.Redis:
    return redis.Redis(connection_pool=redis_pool)


def send_ib_command(command: str, payload: dict, target_mode: str = "paper", timeout_s: float = 10.0) -> dict:
    """Send command to IB runner via Redis and wait for reply."""
    r = rconn()
    cmd_id = str(uuid.uuid4())
    reply_stream = f"ib:reply:{target_mode}:{cmd_id}"
    
    cmd = {
        "type": command,
        "cmd_id": cmd_id,
        "payload": payload
    }
    
    r.xadd(f"ib:cmd:{target_mode}", {"json": json.dumps(cmd)})
    
    # Wait for reply
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        msgs = r.xread({reply_stream: "0"}, count=1, block=1000)
        if msgs:
            for stream_name, entries in msgs:
                for entry_id, fields in entries:
                    r.delete(reply_stream)
                    data = json.loads(fields.get("json", "{}"))
                    return data
    
    raise TimeoutError(f"Timeout waiting for IB reply to {command} on {target_mode} gateway")

# ============== Pydantic Models ==============

class AccountSummary(BaseModel):
    account_id: str
    net_liquidation: float = 0
    excess_liquidity: float = 0
    maintenance_margin: float = 0
    available_funds: float = 0
    buying_power: float = 0
    total_cash: float = 0
    unrealized_pnl: float = 0
    realized_pnl: float = 0
    daily_pnl: Optional[float] = None
    currency: str = "USD"


class Position(BaseModel):
    account_id: str
    symbol: str
    sec_type: str
    exchange: str
    currency: str
    position: float
    avg_cost: float
    market_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    realized_pnl: float
    daily_pnl: Optional[float] = None


class Order(BaseModel):
    order_id: int
    perm_id: int
    account_id: str
    symbol: str
    sec_type: str
    action: str
    order_type: str
    quantity: float
    filled_quantity: float
    remaining_quantity: float
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    avg_fill_price: Optional[float] = None
    status: str
    created_at: Optional[str] = None
    filled_at: Optional[str] = None


class Trade(BaseModel):
    exec_id: str
    order_id: int
    account_id: str
    symbol: str
    sec_type: str
    action: str
    quantity: float
    price: float
    commission: float
    realized_pnl: Optional[float] = None
    executed_at: Optional[str] = None
    exchange: str


# ============== API Endpoints ==============
# CRITICAL FIX: 'async' keyword removed from all endpoints to enable true threading

@router.get("/accounts")
def get_accounts(mode: str = "paper"):
    """Get list of all managed accounts."""
    try:
        reply = send_ib_command("GET_ACCOUNTS", {}, target_mode=mode)
        
        if reply.get("error"):
            raise HTTPException(status_code=503, detail=reply["error"])
        
        return {
            "status": "OK",
            "accounts": reply.get("payload", {}).get("accounts", [])
        }
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="IB Gateway timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/{account_id}/summary")
def get_account_summary(account_id: str, mode: str = "paper"):
    """Get account summary with P&L and margin info."""
    try:
        reply = send_ib_command("GET_ACCOUNT_SUMMARY", {"account_id": account_id}, target_mode=mode)
        
        if reply.get("error"):
            raise HTTPException(status_code=503, detail=reply["error"])
        
        return {
            "status": "OK",
            "payload": reply.get("payload", {}).get("summary", {})
        }
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="IB Gateway timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/{account_id}/positions")
def get_positions(account_id: str, mode: str = "paper"):
    """Get all positions for an account."""
    try:
        reply = send_ib_command("GET_POSITIONS", {"account_id": account_id}, target_mode=mode)
        
        if reply.get("error"):
            raise HTTPException(status_code=503, detail=reply["error"])
        
        return {
            "status": "OK",
            "payload": reply.get("payload", {}).get("positions", [])
        }
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="IB Gateway timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/{account_id}/orders")
def get_orders(account_id: str, status: Optional[str] = None, mode: str = "paper"):
    """Get orders for an account."""
    try:
        reply = send_ib_command("GET_ORDERS", {
            "account_id": account_id,
            "status_filter": status
        }, target_mode=mode)
        
        if reply.get("error"):
            raise HTTPException(status_code=503, detail=reply["error"])
        
        return {
            "status": "OK",
            "payload": reply.get("payload", {}).get("orders", [])
        }
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="IB Gateway timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accounts/{account_id}/trades")
def get_trades(account_id: str, days: int = 1, mode: str = "paper"):
    """Get executed trades for an account."""
    try:
        reply = send_ib_command("GET_TRADES", {
            "account_id": account_id,
            "days": days
        }, target_mode=mode)
        
        if reply.get("error"):
            raise HTTPException(status_code=503, detail=reply["error"])
        
        return {
            "status": "OK",
            "payload": reply.get("payload", {}).get("trades", [])
        }
    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="IB Gateway timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Debug Endpoints ==============

@router.get("/debug/connection")
def debug_connection(mode: str = "paper"):
    """Debug endpoint to check IB connection status."""
    try:
        reply = send_ib_command("PING", {}, target_mode=mode, timeout_s=5)
        return {
            "status": "OK",
            "ib_connected": reply.get("status") == "OK",
            "reply": reply
        }
    except TimeoutError:
        return {
            "status": "ERROR",
            "ib_connected": False,
            "error": "Timeout waiting for IB Gateway"
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "ib_connected": False,
            "error": str(e)
        }


@router.get("/debug/raw-accounts")
def debug_raw_accounts(mode: str = "paper"):
    """Debug endpoint to see raw account data from IB."""
    try:
        reply = send_ib_command("DEBUG_ACCOUNTS", {}, target_mode=mode, timeout_s=10)
        return {
            "status": "OK",
            "data": reply
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "error": str(e)
        }


@router.get("/debug/raw-positions")
def debug_raw_positions(mode: str = "paper"):
    """Debug endpoint to see raw positions data from IB."""
    try:
        reply = send_ib_command("DEBUG_POSITIONS", {}, target_mode=mode, timeout_s=10)
        return {
            "status": "OK",
            "data": reply
        }
    except Exception as e:
        return {
            "status": "ERROR",
            "error": str(e)
        }