# src/api/websocket.py
from __future__ import annotations
import asyncio
import json
import math
import os
import time
import uuid
from datetime import datetime, timedelta, date, timezone
from typing import Dict, Set, Optional
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0").strip("'\"")

class SafeJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, float) and (math.isnan(o) or math.isinf(o)): return None
        return super().default(o)

def safe_json_dumps(data: dict) -> str:
    return json.dumps(data, cls=SafeJSONEncoder)

def get_market_status() -> dict:
    now = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=5) 
    
    is_weekday = now.weekday() in [0, 1, 2, 3, 4]
    session = "closed"
    
    if is_weekday:
        if 4 <= now.hour < 9 or (now.hour == 9 and now.minute < 30):
            session = "pre-market"
        elif (now.hour == 9 and now.minute >= 30) or (10 <= now.hour < 16):
            session = "open"
        elif 16 <= now.hour < 20:
            session = "post-market"
            
    return {
        "isOpen": session == "open", 
        "session": session, 
        "timezone": "UTC-5"
    }

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, dict] = {}
        self._redis: Optional[aioredis.Redis] = None

    async def get_redis(self) -> aioredis.Redis:
        if self._redis is None: 
            self._redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        return self._redis

    async def connect(self, websocket: WebSocket, session_id: str) -> Optional[str]:
        r = await self.get_redis()
        mode = await r.get(f"web_session:{session_id}")
        
        if not mode:
            await websocket.close(code=1008)
            return None

        await websocket.accept()
        connection_id = str(uuid.uuid4())
        self.active_connections[connection_id] = {"ws": websocket, "mode": mode}
        
        asyncio.create_task(self._send_status_loop(connection_id))
        return connection_id

    async def disconnect(self, connection_id: str):
        if connection_id in self.active_connections: del self.active_connections[connection_id]

    async def subscribe_symbol(self, connection_id: str, symbol: str):
        if connection_id not in self.active_connections: return
        
        r = await self.get_redis()
        cmd = {"cmd_id": str(uuid.uuid4()), "type": "SUBSCRIBE_BARS", "payload": {"symbol": symbol}}
        await r.xadd("ib:cmd:live", {"json": json.dumps(cmd)})
        
        asyncio.create_task(self._listen_for_bar_updates(symbol))

    async def _send_status_loop(self, conn_id: str):
        r = await self.get_redis()
        while conn_id in self.active_connections:
            try:
                ws = self.active_connections[conn_id]["ws"]
                
                await ws.send_text(safe_json_dumps({
                    "type": "market_status",
                    "payload": get_market_status()
                }))
                
                # Fetch and send LIVE status
                live_status_json = await r.get("ib:status:live")
                if live_status_json:
                    status = json.loads(live_status_json)
                    hb_seconds = status.get("last_heartbeat")
                    await ws.send_text(safe_json_dumps({
                        "type": "ib_status_live", 
                        "payload": {
                            "connected": status.get("connected"), 
                            "error": status.get("error"),
                            "lastHeartbeat": (hb_seconds * 1000) if hb_seconds else None 
                        }
                    }))
                else:
                    await ws.send_text(safe_json_dumps({
                        "type": "ib_status_live", 
                        "payload": {"connected": False, "error": "Daemon offline or unreachable", "lastHeartbeat": None}
                    }))

                # Fetch and send PAPER status
                paper_status_json = await r.get("ib:status:paper")
                if paper_status_json:
                    status = json.loads(paper_status_json)
                    hb_seconds = status.get("last_heartbeat")
                    await ws.send_text(safe_json_dumps({
                        "type": "ib_status_paper", 
                        "payload": {
                            "connected": status.get("connected"), 
                            "error": status.get("error"),
                            "lastHeartbeat": (hb_seconds * 1000) if hb_seconds else None 
                        }
                    }))
                else:
                    await ws.send_text(safe_json_dumps({
                        "type": "ib_status_paper", 
                        "payload": {"connected": False, "error": "Daemon offline or unreachable", "lastHeartbeat": None}
                    }))

            except Exception as e: 
                # CRITICAL FIX: Stop the loop cleanly when the client unmounts or navigates away
                if "closed" not in str(e).lower() and "disconnect" not in str(type(e)).lower():
                    print(f"🚨 [WS ERROR] {e}")
                break
                
            await asyncio.sleep(2)

    async def _listen_for_bar_updates(self, symbol: str):
        r = await self.get_redis()
        pubsub = r.pubsub()
        
        channel = f"ib:bars:live:{symbol}"
        await pubsub.subscribe(channel)
        
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = json.loads(message["data"])
                    for conn in list(self.active_connections.values()):
                        await conn["ws"].send_text(safe_json_dumps({
                            "type": "bar_update", 
                            "payload": {"symbol": symbol, "bar": data}
                        }))
        except Exception as e: 
            pass


manager = ConnectionManager()

@router.websocket("/ws/status")
async def websocket_status(websocket: WebSocket, session_id: str):
    connection_id = None
    try:
        connection_id = await manager.connect(websocket, session_id)
        if not connection_id: return
        
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "subscribe" and data.get("symbol"):
                await manager.subscribe_symbol(connection_id, data.get("symbol"))
    except WebSocketDisconnect: pass
    except Exception as e: pass
    finally:
        if connection_id: await manager.disconnect(connection_id)