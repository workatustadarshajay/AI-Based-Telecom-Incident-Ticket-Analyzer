"""LangGraph workflow (report 3.9, 4.5, Fig. 3-5).

Sequential path: summarize -> classify -> severity -> route -> retrieve -> resolve
-> approval (interrupt) -> finalize.

The approval node uses LangGraph interrupt(): the graph pauses and the FastAPI
approvals endpoint resumes it with Command(resume=...). A "Revision Requested"
decision loops back to resolution once (bounded), per report 4.8.
"""
import json
import time

from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command

from app.agents.summarizer import summarize_ticket
from app.agents.classifier import classify_ticket
from app.agents.severity import detect_severity
from app.agents.resolution import suggest_resolution
from app.core.config import settings
from app.data.schemas import build_stage_event
from app.graph.router import ROUTE_MANUAL, ROUTE_PRIORITY, ROUTE_STANDARD, route_incident
from app.graph.state import TicketState
from app.rag.retriever import build_query, retrieve

MAX_REVISIONS = 1


def _evt(state: dict, stage: str, output, status: str = "ok", started: float | None = None) -> dict:
    ev = build_stage_event(
        ticket_id=(state.get("ticket") or {}).get("ticket_id", "?"),
        stage=stage,
        output=output if isinstance(output, (dict, list, str, int, float, bool, type(None))) else str(output),
        status=status,
        duration_ms=int((time.time() - started) * 1000) if started else 0,
    )
    return ev.model_dump(mode="json")


def _enum(v):
    return getattr(v, "value", v)


def summarize_node(state: TicketState) -> dict:
    started = time.time()
    try:
        summary = summarize_ticket(state["ticket"], state.get("log"))
        out = summary.model_dump()
        return {"summary": out, "stage_events": [_evt(state, "summarize", out, started=started)]}
    except Exception as e:  # keep the run traceable even on agent failure
        return {"error": f"summarize failed: {e}",
                "stage_events": [_evt(state, "summarize", None, status="error", started=started)]}


def classify_node(state: TicketState) -> dict:
    started = time.time()
    if state.get("error"):
        return {}
    try:
        result = classify_ticket(state["ticket"], state.get("log"))
        out = result.model_dump(mode="json")
        out["category"] = _enum(out["category"])
        return {"classification": out,
                "stage_events": [_evt(state, "classify", out, started=started)]}
    except Exception as e:
        return {"error": f"classify failed: {e}",
                "stage_events": [_evt(state, "classify", None, status="error", started=started)]}


def severity_node(state: TicketState) -> dict:
    started = time.time()
    if state.get("error"):
        return {}
    cls = state.get("classification") or {}
    try:
        result = detect_severity(state["ticket"], str(_enum(cls.get("category", ""))), state.get("log"))
        out = result.model_dump(mode="json")
        out["severity"] = _enum(out["severity"])
        return {"severity": out, "stage_events": [_evt(state, "severity", out, started=started)]}
    except Exception as e:
        return {"error": f"severity failed: {e}",
                "stage_events": [_evt(state, "severity", None, status="error", started=started)]}


def router_node(state: TicketState) -> dict:
    route = route_incident(state)
    return {"route": route, "stage_events": [_evt(state, "route", {"route": route})]}


def retrieve_node(state: TicketState) -> dict:
    started = time.time()
    if state.get("error"):
        return {}
    cls = state.get("classification") or {}
    summary = state.get("summary") or {}
    query = build_query(
        summary.get("symptoms", "") or str(summary),
        str(_enum(cls.get("category", ""))),
        (state.get("ticket") or {}).get("network_type", ""),
    )
    try:
        chunks = retrieve(query)
        out = [c.model_dump() for c in chunks]
        return {"retrieved_chunks": out,
                "stage_events": [_evt(state, "retrieve", {"query": query, "chunks": out}, started=started)]}
    except Exception as e:
        return {"retrieved_chunks": [],
                "error": f"retrieve failed: {e}",
                "stage_events": [_evt(state, "retrieve", None, status="error", started=started)]}


def resolve_node(state: TicketState) -> dict:
    started = time.time()
    if state.get("error"):
        return {}
    cls = state.get("classification") or {}
    sev = state.get("severity") or {}
    try:
        from app.data.schemas import RetrievedChunk
        chunks = [RetrievedChunk(**c) for c in state.get("retrieved_chunks", [])]
        result = suggest_resolution(
            ticket=state["ticket"],
            category=str(_enum(cls.get("category", ""))),
            confidence=float(cls.get("confidence", 0.0)),
            severity=str(_enum(sev.get("severity", ""))),
            priority=str(sev.get("priority", "")),
            chunks=chunks,
        )
        out = result.model_dump()
        return {"recommendation": out,
                "stage_events": [_evt(state, "resolve", out, started=started)]}
    except Exception as e:
        return {"error": f"resolve failed: {e}",
                "stage_events": [_evt(state, "resolve", None, status="error", started=started)]}


def approval_node(state: TicketState) -> dict:
    """Human approval via interrupt (report 4.8, Fig. 5).

    NOTE: the whole node re-runs on resume; interrupt() must be called before any
    side effect (skill: langgraph-human-in-the-loop idempotency rules).
    """
    rec = state.get("recommendation") or {}
    cls = state.get("classification") or {}
    sev = state.get("severity") or {}
    summary = state.get("summary") or {}
    ticket = state.get("ticket") or {}

    # Demo bypass (explicit submitter opt-in): skip the interrupt entirely.
    if state.get("auto_approve"):
        auto = {"decision": "Approved", "reviewer": "auto",
                "reason": "auto-approved at submission (demo mode)"}
        return {"approval_decision": auto, "final_status": "approved",
                "stage_events": [_evt(state, "approval", auto)]}

    payload = {
        "ticket_id": ticket.get("ticket_id", ""),
        "ticket_description": ticket.get("description", ""),
        "summary": summary.get("symptoms", ""),
        "category": str(_enum(cls.get("category", ""))),
        "severity": str(_enum(sev.get("severity", ""))),
        "recommendation": json.dumps(rec.get("diagnostic_steps", [])),
        "sources": rec.get("sources", []),
        "route": state.get("route", ROUTE_STANDARD),
    }

    decision = interrupt(payload)  # pauses here; resumed via Command(resume=...)

    # --- side effects only AFTER the interrupt (safe on resume) ---
    # The resume value carries the ApprovalDecision enum (pydantic model_dump keeps
    # enum instances) - normalize via .value before comparing (str(enum) would
    # yield 'ApprovalDecision.APPROVED' and break every decision comparison).
    if isinstance(decision, dict):
        normalized = {k: _enum(v) for k, v in decision.items()}
    else:
        normalized = {"decision": _enum(decision)}
    events = [_evt(state, "approval", normalized)]
    decision_name = str(normalized.get("decision", ""))

    if decision_name == "Revision Requested":
        revisions = state.get("revision_count", 0)
        if revisions < MAX_REVISIONS:
            return {"revision_count": revisions + 1,
                    "stage_events": events}
        # revision budget exhausted -> record and finish
        return {"approval_decision": {**normalized, "decision": "Rejected",
                                      "reason": normalized.get("reason") or "revision budget exhausted"},
                "final_status": "rejected",
                "stage_events": events}

    approved = decision_name == "Approved"
    return {
        "approval_decision": normalized,
        "final_status": "approved" if approved else "rejected",
        "stage_events": events,
    }


def finalize_node(state: TicketState) -> dict:
    status = state.get("final_status") or "completed"
    return {"final_status": status, "stage_events": [_evt(state, "finalize", {"status": status})]}


def _route_after_approval(state: TicketState) -> str:
    if state.get("final_status") in ("approved", "rejected"):
        return "finalize"
    if not state.get("recommendation"):
        return "finalize"  # manual-review path has nothing to revise
    return "resolve"  # revision loop


def build_workflow():
    builder = StateGraph(TicketState)
    builder.add_node("summarize", summarize_node)
    builder.add_node("classify", classify_node)
    builder.add_node("severity", severity_node)
    builder.add_node("route", router_node)
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("resolve", resolve_node)
    builder.add_node("approval", approval_node)
    builder.add_node("finalize", finalize_node)

    builder.add_edge(START, "summarize")
    builder.add_edge("summarize", "classify")
    builder.add_edge("classify", "severity")
    builder.add_edge("severity", "route")
    # If any agent failed, end the run as 'failed' instead of routing it to the
    # approval interrupt - a broken pipeline has nothing for a human to approve.
    builder.add_conditional_edges("route", lambda s: END if s.get("error") else s.get("route"),
                                  {
                                      ROUTE_PRIORITY: "retrieve",
                                      ROUTE_STANDARD: "retrieve",
                                      ROUTE_MANUAL: "approval",  # manual review = approval stage without AI recommendation
                                      END: END,
                                  })
    builder.add_edge("retrieve", "resolve")
    builder.add_edge("resolve", "approval")
    builder.add_conditional_edges("approval", _route_after_approval,
                                  {"finalize": "finalize", "resolve": "resolve"})
    builder.add_edge("finalize", END)
    return builder


def compile_workflow(checkpointer: PostgresSaver):
    return build_workflow().compile(checkpointer=checkpointer)


def make_resume_command(decision: dict) -> Command:
    return Command(resume=decision)
