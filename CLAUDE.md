# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack trading platform with real-time market data streaming, backtesting capabilities, and Interactive Brokers integration. The system supports paper and live trading accounts.
The end goal is to be able to trade stocks with it, run simulations and backtests and run algo-trading strategies in live or paper accounts.

## System Description

The system is build with 2 main parts:
1. The remote cloud server part - runs on remote cloud server with the IP - 172.237.108.45
    * Contains all the backend components that should run always.
    * Operates FastAPI API server, Celery worker, Redis broker, PostgreSQL database, and an Interactive Brokers Gateway via ib_insync.
    * We’ll use Docker Compose to containerize each component for easy deployment and management. 
        * The plan is to use The "Data Master / Execution Slave" Architecture (Parallel Live & Paper Trading): need to run your algo strategies in Paper to test them, while simultaneously monitoring your Live account, but Interactive Brokers keeps cutting your data feed because they enforce a strict "One Active Market Data Stream" rule. we are going to permanently decouple your data from your execution using your Redis broker:
            * Live Gateway (Data Master): Will connect to IBKR, pull all real-time market data, and publish it to a Redis channel.
            * Paper Gateway (Execution Slave): Will connect to IBKR only to send buy/sell orders and manage your paper portfolio.
            * The Bridge: Your Paper Algos will secretly consume the market data from the Live Redis channel, but push their orders to the Paper Redis queue! IBKR will never know you are running two systems at once.
    * We use Docker Compose to define and run all parts of the backend. Containerizing each service (API, worker, DB, etc.) provides isolation and easy deployment. In one Docker Compose YAML file, we’ll define:
        * FastAPI API server (container running our FastAPI app, e.g. via Uvicorn/Gunicorn).
        * Celery worker (container running background tasks for simulations).
        * PostgreSQL database (for storing results and data).
        * Redis (as a message broker for Celery, possibly also for caching).
        * IB Gateway (Interactive Brokers Gateway + controller for IB API access).
        * Nginx (as a reverse proxy for HTTPS – we may run this separately on host or in Docker, but later steps will cover it).
        * Only the FastAPI API will be exposed to the internet (over HTTPS); all other services (database, Redis, IB Gateway, Celery) will remain internal.
2. The local part - run on local machine.
    * Holds the frontend part.
    * The local frontend UI will communicate with the remote API securely through HTTPS.

## Architecture

```
system/
├── frontend/          # React + Vite web UI (port 3000)
├── backend/           # FastAPI + Python trading engine (port 8000)
├── alembic/           # Database migrations
└── examples/          # Backtest examples with sample data
```

**Frontend**: React 18, Vite, Zustand (state), lightweight-charts (charting)

**Backend**: FastAPI, SQLAlchemy (PostgreSQL), Celery + Redis (task queue), ib_insync (IB API)

**Data Flow**: Frontend ↔ REST API + WebSocket → Backend → Redis pub/sub → IB Gateway / PostgreSQL

## Common Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Dev server on port 3000
npm run build        # Production build
```

### Backend
```bash
cd backend
pip install -r requirements.txt

# API server
uvicorn src.api.main:app --host 0.0.0.0 --port 8000

# Celery worker (separate terminal)
celery -A src.worker.celery_app.celery_app worker --loglevel=INFO
```

### Docker (Full Stack)
```bash
cd backend
docker-compose up -d              # Start all services
docker-compose logs -f api        # View API logs
docker-compose down               # Stop services
```

### Database Migrations
```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## Backend Module Structure

- `src/api/` - FastAPI routes (main.py, ib.py, portfolio.py, websocket.py, simulator.py, watchlist.py)
- `src/engine/` - Backtesting engine (backtest.py, strategy.py, runner.py, execution.py, portfolio.py)
- `src/data/` - Data loading (load_csv.py, load_ib.py, synth.py)
- `src/storage/` - Database layer (models.py, repo.py, write_repo.py, db.py)
- `src/ib/` - Interactive Brokers integration (connection.py, runner_daemon.py, history.py)
- `src/worker/` - Celery tasks (celery_app.py, tasks.py)
- `src/common/` - Pydantic schemas (schemas.py)

## Frontend Store Architecture

Zustand stores in `frontend/src/store/`:
- `chartStore` - Chart data, symbols, bar sizes, indicators
- `statusStore` - WebSocket/IB connection status
- `portfolioStore` - Positions, orders, trades, account
- `simulatorStore` - Backtest configurations and results
- `watchlistStore` - User watchlists

## Supported Strategies

- `BuyAndHold` - Single symbol buy-and-hold
- `DrawdownRotate` - Rotate between primary and hedge based on drawdown
- `TopNMomentum` - Top-N momentum with periodic rebalancing

## Environment Variables

Required in backend `.env`:
- `DB_USER`, `DB_PASSWORD`, `DB_NAME` - PostgreSQL credentials
- `IB_PAPER_USER`, `IB_PAPER_PASS` - IB paper account
- `IB_LIVE_USER`, `IB_LIVE_PASS` - IB live account
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
