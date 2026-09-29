"""Ticket classification agent (report 4.3, 5.5-5.6): category + confidence + evidence."""
from app.agents.llm import get_llm, invoke_structured
from app.data.schemas import CATEGORIES, ClassificationOutput

PROMPT = """You are the Ticket Classification agent in a telecom incident analysis system.
Classify the incident into exactly ONE of these categories:

{categories}

Rules:
- "Network Outage": complete or broad loss of network service (outage alarm, total loss of service).
- "Connectivity Issue": user or site connectivity failure WITHOUT a confirmed broad outage
  (intermittent connection, attach failures, handover drops, backhaul alarms).
- "Performance Degradation": slow service, latency, packet loss, throughput reduction.
- "Voice Service Issue": calling, VoLTE, or voice-service problems (call drops, one-way audio,
  call setup failures) while data works.
- "Infrastructure Issue": equipment, tower, power, or physical infrastructure problems.
- "Configuration Issue": incorrect or inconsistent configuration (VLAN, QoS, routing policy).
- "Unknown / Other": insufficient information or outside the defined set.

For every classification provide:
- confidence: 0.0 to 1.0
- evidence: short quotes or paraphrases from the ticket supporting the choice
- uncertain: true if the evidence is weak or ambiguous

Ticket:
{ticket}

Outage log (may be empty):
{log}
"""


def classify_ticket(ticket: dict, log: dict | None = None) -> ClassificationOutput:
    llm = get_llm(temperature=0.0)
    structured = llm.with_structured_output(ClassificationOutput)
    prompt = PROMPT.format(
        categories="\n".join(f"- {c}" for c in CATEGORIES),
        ticket=ticket.get("description", ""),
        log=str(log) if log else "(no outage log available)",
    )
    result: ClassificationOutput = invoke_structured(structured, prompt)
    result.ticket_id = ticket.get("ticket_id", "")
    if result.confidence < 0.6:
        result.uncertain = True
    return result
