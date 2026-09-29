"""Rule-assisted router (report 5.8): interpretable conditions, no LLM routing."""
from app.core.config import settings

ROUTE_PRIORITY = "priority_path"
ROUTE_STANDARD = "standard_path"
ROUTE_MANUAL = "manual_review"


def route_incident(state: dict) -> str:
    """Return the next node after severity detection.

    Rules (report 5.8):
    - critical severity -> priority path (accelerated, mandatory review)
    - low confidence / uncertain -> manual review
    - unknown category -> manual review
    - otherwise -> standard RAG resolution path
    """
    classification = state.get("classification") or {}
    severity = state.get("severity") or {}

    category = str(getattr(classification.get("category"), "value", classification.get("category", "")))
    confidence = float(classification.get("confidence", 0.0))
    uncertain = bool(classification.get("uncertain", False))
    sev = str(getattr(severity.get("severity"), "value", severity.get("severity", "")))

    if sev == "Critical":
        return ROUTE_PRIORITY
    if uncertain or confidence < settings.confidence_threshold:
        return ROUTE_MANUAL
    if category in ("Unknown / Other", ""):
        return ROUTE_MANUAL
    return ROUTE_STANDARD
