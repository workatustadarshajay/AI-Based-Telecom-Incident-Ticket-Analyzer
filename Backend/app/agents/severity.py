"""Severity detection agent (report 4.4): operational impact, not just language."""
from app.agents.llm import get_llm, invoke_structured
from app.data.schemas import SEVERITIES, SeverityOutput

PROMPT = """You are the Severity Detection agent in a telecom incident analysis system.
Estimate operational severity and priority from IMPACT INDICATORS, not from wording alone.

Severity rules (apply in order, first match wins):
- Critical: broad outage, multiple sites down, or more than 500 users affected.
- High: large-area impact, important localized outage, single-site repeated faults, or
  150-500 users affected with service unavailable.
- Medium: moderate impact; a single service degraded (latency, packet loss) with service
  still available.
- Low: small isolated problem (few users), minor degradation, or informational.

Allowed severity values: {severities}.
Priority mapping: Critical=P1, High=P2, Medium=P3, Low=P4.
Give a one-sentence reason citing the operational indicators you used.

Ticket:
{ticket}

Incident category (from classifier): {category}

Outage log (may be empty):
{log}
"""


def detect_severity(ticket: dict, category: str, log: dict | None = None) -> SeverityOutput:
    llm = get_llm(temperature=0.0, lite=True)  # lite model = separate quota bucket
    structured = llm.with_structured_output(SeverityOutput)
    prompt = PROMPT.format(
        severities=", ".join(SEVERITIES),
        ticket=ticket.get("description", ""),
        category=category,
        log=str(log) if log else "(no outage log available)",
    )
    return invoke_structured(structured, prompt)
