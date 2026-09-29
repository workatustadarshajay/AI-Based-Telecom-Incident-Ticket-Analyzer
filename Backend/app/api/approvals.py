"""Human approval endpoints (report 4.8 / Fig. 5).

GET  /pending: interrupted runs awaiting review - resurfaces the interrupt payload.
POST /{run_id}: records the decision and resumes the LangGraph run with Command(resume=...).
"""
import json

from fastapi import APIRouter, HTTPException

from app.data.schemas import ApprovalSubmitRequest
from app.graph import runner
from app.storage import approval_store, runs_store

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


def _extract_interrupt_payload(run_id: str) -> dict | None:
    """Read the interrupt payload straight from the paused graph state.

    Pending tasks expose 'interrupts' (a tuple of Interrupt objects).
    """
    graph = runner.get_graph()
    snapshot = graph.get_state({"configurable": {"thread_id": run_id}})
    if not snapshot.next:
        return None
    for task in getattr(snapshot, "tasks", None) or []:
        for intr in getattr(task, "interrupts", None) or () or [getattr(task, "interrupt", None)]:
            value = getattr(intr, "value", None) if intr is not None else None
            if isinstance(value, dict):
                return value
    return None


@router.get("/pending")
def pending_approvals() -> list[dict]:
    runs = runs_store.list_runs(200)
    pending = [r for r in runs if r["status"] == "awaiting_approval"]
    return [
        {
            "run_id": r["run_id"],
            "ticket_id": r["ticket_id"],
            "route": r.get("route"),
            "payload": _extract_interrupt_payload(r["run_id"]) or {},
        }
        for r in pending
    ]


@router.post("/{run_id}")
def submit_approval(run_id: str, req: ApprovalSubmitRequest) -> dict:
    run = runs_store.get_run(run_id)
    if not run:
        raise HTTPException(404, f"run {run_id} not found")
    if run["status"] != "awaiting_approval":
        raise HTTPException(409, f"run {run_id} is not awaiting approval (status={run['status']})")

    decision = req.model_dump()
    approval_store.record_approval(
        run_id=run_id,
        ticket_id=run["ticket_id"],
        decision=req.decision.value,
        reviewer=req.reviewer,
        reason=req.reason,
        edited_recommendation=req.edited_recommendation,
    )
    runner.resume_run(run_id, decision)
    return {"run_id": run_id, "resumed": True, "decision": req.decision.value}
