"""FastAPI application (report 5.2: API layer)."""
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import approvals, analytics, tickets
from app.storage.db import init_schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_schema()
    # Re-sync recent runs against the LangGraph checkpoints (source of truth):
    # runs orphaned mid-flight or paused at an interrupt by a previous process get
    # their true status back (e.g. awaiting_approval) and stay resumable. Idempotent
    # for finished runs - they recompute to the same terminal status.
    try:
        from app.graph import runner
        from app.storage import runs_store

        for r in runs_store.list_runs(200):
            runner.recover_run(r["run_id"])
    except Exception:  # noqa: BLE001 - recovery must never block startup
        pass
    yield


app = FastAPI(
    title="AI-Based Telecom Incident Ticket Analyzer",
    description="RAG + Multi-Agent workflow with human approval (BCA major project)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tickets.router)
app.include_router(approvals.router)
app.include_router(analytics.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "telecom-ticket-analyzer"}
