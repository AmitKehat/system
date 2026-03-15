from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session



@dataclass(frozen=True)
class DBSettings:
    host: str
    port: int
    name: str
    user: str
    password: str


def load_db_settings() -> DBSettings:
    return DBSettings(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        name=os.getenv("DB_NAME", "trading"),
        user=os.getenv("DB_USER", "app"),
        password=os.getenv("DB_PASSWORD", "app_pw"),
    )


def make_db_url(s: DBSettings) -> str:
    # SQLAlchemy 2 + psycopg3
    return f"postgresql+psycopg://{s.user}:{s.password}@{s.host}:{s.port}/{s.name}"


def get_engine() -> Engine:
    s = load_db_settings()
    url = make_db_url(s)
    return create_engine(url, pool_pre_ping=True)


SessionLocal = sessionmaker(bind=get_engine(), autocommit=False, autoflush=False)


def get_session() -> Session:
    return SessionLocal()
