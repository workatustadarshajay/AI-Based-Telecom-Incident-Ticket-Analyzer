"""Domain models: ticket schema (report Table 4), categories (Table 5), severity (Table 6),
agent structured outputs (Appendix B) and API request/response shapes."""
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

# --- Controlled vocabularies (report Tables 5 and 6) ---


class IncidentCategory(str, Enum):
    NETWORK_OUTAGE = "Network Outage"
    CONNECTIVITY_ISSUE = "Connectivity Issue"
    PERFORMANCE_DEGRADATION = "Performance Degradation"
    VOICE_SERVICE_ISSUE = "Voice Service Issue"
    INFRASTRUCTURE_ISSUE = "Infrastructure Issue"
    CONFIGURATION_ISSUE = "Configuration Issue"
    UNKNOWN_OTHER = "Unknown / Other"


class Severity(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class ApprovalDecision(str, Enum):
    APPROVED = "Approved"
    REJECTED = "Rejected"
    REVISION_REQUESTED = "Revision Requested"


NETWORK_TYPES = ["5G", "4G", "VoLTE", "Fiber", "Fixed Wireless"]
REGIONS = ["Region-A", "Region-B", "Region-C", "Region-D"]
SERVICES = ["Mobile Data", "Voice", "Broadband", "Enterprise VPN", "SMS", "IoT"]

CATEGORIES = [c.value for c in IncidentCategory]
SEVERITIES = [s.value for s in Severity]


# --- Synthetic ticket schema (report Table 4) ---


class SyntheticTicket(BaseModel):
    ticket_id: str
    timestamp: str
    network_type: str
    region: str
    service: str
    description: str
    category: str  # reference label
    severity: str  # reference label
    affected_users: int
    status: str = "Open"


class OutageLog(BaseModel):
    log_id: str
    ticket_id: str
    site_id: str
    region: str
    network_type: str
    alarm_code: str
    alarm_message: str
    start_time: str
    end_time: Optional[str] = None
    affected_cells: int


# --- Agent structured outputs (report 4.3-4.7, Appendix B) ---


class TicketSummary(BaseModel):
    symptoms: str
    affected_service: str
    network_type: str
    region: str
    affected_users: Optional[int] = None
    timestamps: Optional[str] = None
    log_context: str = ""
    unknown_fields: list[str] = Field(default_factory=list)


class ClassificationOutput(BaseModel):
    """Classification agent output (report 4.3, 5.6)."""

    ticket_id: str = ""
    category: IncidentCategory
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    uncertain: bool = False


class SeverityOutput(BaseModel):
    """Severity agent output (report 4.4, Appendix B)."""

    severity: Severity
    priority: str  # P1..P4
    reason: str


class RetrievedChunk(BaseModel):
    doc_id: str
    chunk_id: str
    topic: str = ""
    service: str = ""
    network_type: str = ""
    content: str
    similarity: float


class ResolutionOutput(BaseModel):
    """Resolution agent output (report 4.7, Appendix B)."""

    suspected_issue: str
    evidence: list[str] = Field(default_factory=list)
    diagnostic_steps: list[str] = Field(default_factory=list)
    expected_observations: list[str] = Field(default_factory=list)
    escalation_conditions: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)  # DOC-xxx ids


class ApprovalPayload(BaseModel):
    """Value surfaced by the LangGraph interrupt for human review (report 4.8)."""

    ticket_id: str
    ticket_description: str
    summary: str
    category: str
    severity: str
    recommendation: str
    sources: list[str] = Field(default_factory=list)
    route: str = "standard"


class ApprovalDecisionPayload(BaseModel):
    """Resume value submitted by the reviewer through the API."""

    decision: ApprovalDecision
    reviewer: str = "analyst"
    reason: str = ""
    edited_recommendation: Optional[str] = None


# --- API request/response shapes ---


class TicketSubmitRequest(BaseModel):
    description: str
    network_type: str = "5G"
    region: str = "Region-A"
    service: str = "Mobile Data"
    affected_users: int = 0
    auto_route: bool = True
    auto_approve: bool = False  # demo mode: skip the human-approval pause


class ApprovalSubmitRequest(BaseModel):
    decision: ApprovalDecision
    reviewer: str = "analyst"
    reason: str = ""
    edited_recommendation: Optional[str] = None


class StageEvent(BaseModel):
    ticket_id: str
    stage: str
    timestamp: str
    input_ref: str = ""
    output: Any = None
    status: str = "ok"
    duration_ms: int = 0


class RunTrace(BaseModel):
    run_id: str
    ticket_id: str
    status: str  # running | awaiting_approval | completed | manual_review | failed
    route: Optional[str] = None
    created_at: str
    stages: list[StageEvent] = Field(default_factory=list)
    final_state: dict[str, Any] = Field(default_factory=dict)


class RunSummary(BaseModel):
    run_id: str
    ticket_id: str
    status: str
    route: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    created_at: str


def build_stage_event(ticket_id: str, stage: str, output: Any, status: str = "ok",
                      input_ref: str = "", duration_ms: int = 0) -> StageEvent:
    return StageEvent(
        ticket_id=ticket_id,
        stage=stage,
        timestamp=datetime.now().isoformat(timespec="seconds"),
        input_ref=input_ref,
        output=output,
        status=status,
        duration_ms=duration_ms,
    )
