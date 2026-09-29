"""Ticket endpoints: submit (starts graph run), list runs, get full trace."""
import json
import random

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.data.schemas import TicketSubmitRequest
from app.graph import runner
from app.storage import runs_store

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


def _load_tickets() -> pd.DataFrame:
    path = settings.data_path / "tickets.csv"
    if not path.exists():
        raise HTTPException(503, "Dataset not generated yet. Run: uv run python -m app.data.generator")
    return pd.read_csv(path)


def _load_logs() -> pd.DataFrame:
    path = settings.data_path / "outage_logs.csv"
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def _sample_ticket() -> dict:
    df = _load_tickets()
    row = df.iloc[random.randrange(len(df))]
    log_row = None
    logs = _load_logs()
    if not logs.empty:
        matches = logs[logs["ticket_id"] == row["ticket_id"]]
        if not matches.empty:
            log_row = matches.iloc[0].to_dict()
    ticket = {k: (None if pd.isna(v) else v) for k, v in row.to_dict().items() if k != "split"}
    ticket["description"] = str(ticket.get("description", ""))
    return {"ticket": ticket, "log": log_row}


@router.post("")
def submit_ticket(req: TicketSubmitRequest) -> dict:
    """Submit a ticket: starts the LangGraph workflow in the background."""
    ticket_id = f"TKT-M-{random.randrange(10**6):06d}"
    ticket = {
        "ticket_id": ticket_id,
        "timestamp": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
        "network_type": req.network_type,
        "region": req.region,
        "service": req.service,
        "description": req.description,
        "category": "",  # reference label unknown for live tickets
        "severity": "",
        "affected_users": req.affected_users,
        "status": "Open",
    }
    log = None
    if req.auto_route:
        return {"run_id": runner.start_run(ticket, None, auto_approve=req.auto_approve),
                "ticket_id": ticket_id}
    return {"run_id": None, "ticket_id": ticket_id}


@router.get("/sample")
def sample_ticket() -> dict:
    """Pull a random synthetic ticket (with its outage log, if any) for one-click testing."""
    return _sample_ticket()


@router.get("")
def list_runs(limit: int = 100) -> list[dict]:
    return runs_store.list_runs(limit)


@router.get("/{run_id}")
def get_run_trace(run_id: str) -> dict:
    run = runs_store.get_run(run_id)
    if not run:
        raise HTTPException(404, f"run {run_id} not found")
    return run
