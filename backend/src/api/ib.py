# src/api/ib.py
import json
import time
import uuid
import redis
import os
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal, Optional

router = APIRouter()

class LoginReq(BaseModel):
    username: str
    password: str
    mode: Literal["paper", "live"] = "paper"

class BaseModeReq(BaseModel):
    mode: Literal["paper", "live"] = "paper"

class HistBarsReq(BaseModeReq):
    symbol: str
    bar_size: str = "1 min"
    duration: str = "1 D"
    end: str = ""
    useRTH: int = 1
    max_rows: int = 5000

class SymbolSearchReq(BaseModeReq):
    query: str
    max_results: int = 10

def rconn() -> redis.Redis:
    url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    return redis.Redis.from_url(url, decode_responses=True)

def wait_for_reply(r: redis.Redis, stream: str, timeout_s: float = 5.0):
    last_id = "0-0"
    start = time.time()
    while time.time() - start < timeout_s:
        resp = r.xread({stream: last_id}, block=2000, count=1)
        if resp:
            return resp[0][1][0][1].get("json")
    return None

# --- AUTHENTICATION ENDPOINTS ---
@router.post("/login")
def ib_login(req: LoginReq):
    """Verifies credentials against server environment and generates a Web Session."""
    env_user = os.getenv(f"IB_{req.mode.upper()}_USER")
    env_pass = os.getenv(f"IB_{req.mode.upper()}_PASS")

    if not env_user or not env_pass:
        return {"status": "ERROR", "error": f"Server missing configuration for {req.mode} mode."}

    if req.username == env_user and req.password == env_pass:
        session_id = str(uuid.uuid4())
        r = rconn()
        r.setex(f"web_session:{session_id}", 86400, req.mode) 
        return {"status": "OK", "session_id": session_id, "mode": req.mode}
    else:
        return {"status": "ERROR", "error": "Invalid credentials."}

@router.post("/logout")
def ib_logout(session_id: str = None):
    if session_id:
        rconn().delete(f"web_session:{session_id}")
    return {"status": "OK", "message": "Session terminated."}

# --- CROSS-ROUTED DATA ENDPOINTS (DATA MASTER) ---
@router.post("/symbol_search")
def symbol_search(req: SymbolSearchReq):
    r = rconn()
    cmd_id = str(uuid.uuid4())
    
    target_mode = "live" 
    
    cmd = {"cmd_id": cmd_id, "type": "SYMBOL_SEARCH", "payload": {"query": req.query.upper(), "max_results": req.max_results}}
    r.xadd(f"ib:cmd:{target_mode}", {"json": json.dumps(cmd)})
    reply = wait_for_reply(r, f"ib:reply:{target_mode}:{cmd_id}", 10.0)
    
    if reply:
        data = json.loads(reply)
        if data.get("status") == "OK":
            return {"status": "OK", "matches": data.get("payload", {}).get("matches", [])}
        return {"status": "ERROR", "error": data.get("error")}
        
    return {"status": "ERROR", "error": "timeout", "matches": []}

@router.post("/hist_bars")
def ib_hist_bars(req: HistBarsReq):
    r = rconn()
    cmd_id = str(uuid.uuid4())
    
    target_mode = "live" 
    
    payload = req.model_dump()
    payload["mode"] = target_mode 
    
    cmd = {"cmd_id": cmd_id, "type": "HIST_BARS", "payload": payload}
    r.xadd(f"ib:cmd:{target_mode}", {"json": json.dumps(cmd)})
    reply = wait_for_reply(r, f"ib:reply:{target_mode}:{cmd_id}", 30.0)
    return json.loads(reply) if reply else {"ok": False, "error": "timeout"}

# --- STABLE DATA FEED (DIRECT IBKR LIVE PROXY) ---
@router.get("/profile/{symbol}")
def symbol_profile(symbol: str):
    """Fetches high-quality fundamental data securely from the Live IBKR gateway."""
    r = rconn()
    cmd_id = str(uuid.uuid4())
    
    target_mode = "live" 
    
    cmd = {"cmd_id": cmd_id, "type": "GET_PROFILE", "payload": {"symbol": symbol}}
    r.xadd(f"ib:cmd:{target_mode}", {"json": json.dumps(cmd)})
    reply = wait_for_reply(r, f"ib:reply:{target_mode}:{cmd_id}", 15.0)
    
    if reply:
        data = json.loads(reply)
        if data.get("status") == "OK":
            return {"status": "OK", "profile": data.get("payload", {}).get("profile", {})}
        return {"status": "ERROR", "error": data.get("error")}
        
    return {"status": "ERROR", "error": "timeout"}

# --- MODE-SPECIFIC ENDPOINTS (EXECUTION SLAVE) ---
@router.post("/ping")
def ib_ping(req: BaseModeReq):
    r = rconn()
    cmd_id = str(uuid.uuid4())
    cmd = {"cmd_id": cmd_id, "type": "PING", "payload": {}}
    r.xadd(f"ib:cmd:{req.mode}", {"json": json.dumps(cmd)})
    reply = wait_for_reply(r, f"ib:reply:{req.mode}:{cmd_id}", 5.0)
    return json.loads(reply) if reply else {"ok": False, "error": "timeout"}

@router.post("/reconnect")
def ib_reconnect(req: BaseModeReq):
    r = rconn()
    cmd_id = str(uuid.uuid4())
    cmd = {"cmd_id": cmd_id, "type": "RECONNECT", "payload": {}}
    r.xadd(f"ib:cmd:{req.mode}", {"json": json.dumps(cmd)})
    return {"status": "OK"}