from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Optional

from ib_insync import IB


@dataclass
class IBConnConfig:
    host: str
    port: int
    client_id: int
    connect_timeout_s: float = 5.0
    heartbeat_s: float = 2.0
    reconnect_backoff_s: float = 3.0


class IBConnectionManager:
    """
    Single-process connection manager for IBKR TWS/IB Gateway using ib_insync.
    Keeps a connected IB() instance and a heartbeat timestamp.
    """

    def __init__(self, cfg: IBConnConfig):
        self.cfg = cfg
        self._ib = IB()
        self._lock = threading.RLock()
        self._stop = threading.Event()

        self.connected: bool = False
        self.last_heartbeat_ts: float = 0.0
        self.reconnect_count: int = 0
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="ib-conn-manager", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._lock:
            try:
                if self._ib.isConnected():
                    self._ib.disconnect()
            except Exception:
                pass
            self.connected = False

    def get_ib(self) -> IB:
        """
        Returns a connected IB instance or raises RuntimeError.
        """
        with self._lock:
            if not self._ib.isConnected():
                raise RuntimeError("IB is not connected")
            return self._ib

    def _connect_once(self) -> bool:
        try:
            self._ib.connect(
                host=self.cfg.host,
                port=self.cfg.port,
                clientId=self.cfg.client_id,
                timeout=self.cfg.connect_timeout_s,
            )
            return self._ib.isConnected()
        except Exception:
            return False

    def _run(self) -> None:
        # Initial connect loop
        while not self._stop.is_set():
            if self._ib.isConnected():
                self.connected = True
                self.last_heartbeat_ts = time.time()
                # Heartbeat tick
                time.sleep(self.cfg.heartbeat_s)
                continue

            self.connected = False
            ok = self._connect_once()
            if ok:
                self.connected = True
                self.last_heartbeat_ts = time.time()
            else:
                self.reconnect_count += 1
                time.sleep(self.cfg.reconnect_backoff_s)
