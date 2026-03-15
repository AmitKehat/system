from __future__ import annotations

import os
from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("CELERY_RESULT_BACKEND", BROKER_URL)

celery_app = Celery(
    "trading_sim",
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=["src.worker.tasks"],  # IMPORTANT: explicit module path
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
