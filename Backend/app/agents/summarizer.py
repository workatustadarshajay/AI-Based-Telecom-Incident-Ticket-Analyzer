"""Ticket summarization agent (report 4.2): structured summary that never invents values."""
from app.agents.llm import get_llm, invoke_structured
from app.data.schemas import TicketSummary

PROMPT = """You are the Ticket Summarization agent in a telecom incident analysis system.
Summarize the incident ticket below. Extract only facts present in the ticket or the
outage log. If a field's value is not available, put "unknown" in it and list the field
name in unknown_fields. Do not guess or invent values.

Ticket:
{ticket}

Outage log (may be empty):
{log}

Return a structured summary with symptoms, affected_service, network_type, region,
affected_users, timestamps, log_context and unknown_fields."""


def summarize_ticket(ticket: dict, log: dict | None = None) -> TicketSummary:
    llm = get_llm(temperature=0.0, lite=True)  # lite model = separate quota bucket
    structured = llm.with_structured_output(TicketSummary)
    prompt = PROMPT.format(
        ticket=ticket.get("description", ""),
        log=str(log) if log else "(none)",
    )
    summary = invoke_structured(structured, prompt)
    # Enrich with structured fields the ticket already carries (they are facts, not guesses)
    summary.affected_service = summary.affected_service if summary.affected_service != "unknown" else ticket.get("service", "unknown")
    if ticket.get("affected_users") and (summary.affected_users is None or summary.affected_users == 0):
        summary.affected_users = int(ticket["affected_users"])
    if summary.network_type == "unknown":
        summary.network_type = ticket.get("network_type", "unknown")
    if summary.region == "unknown":
        summary.region = ticket.get("region", "unknown")
    if summary.timestamps in (None, "unknown") and ticket.get("timestamp"):
        summary.timestamps = ticket["timestamp"]
    return summary
