"""Shared LangGraph workflow state (report 4.10 data flow)."""
import operator
from typing import Annotated, Any, Optional

from typing_extensions import TypedDict


def merge_list(left: list | None, right: list | None) -> list:
    """Append stage events; idempotent for identical replays after interrupt-resume."""
    left = left or []
    right = right or []
    if right and left[-len(right):] == right:
        return left
    return left + right


class TicketState(TypedDict, total=False):
    # inputs
    run_id: str
    ticket: dict
    log: Optional[dict]
    auto_route: bool
    auto_approve: bool
    # agent outputs
    summary: Optional[dict]
    classification: Optional[dict]
    severity: Optional[dict]
    route: Optional[str]
    retrieved_chunks: list[dict]
    recommendation: Optional[dict]
    # approval
    approval_decision: Optional[dict]
    revision_count: int
    final_status: Optional[str]
    # observability
    stage_events: Annotated[list[dict], merge_list]
    error: Optional[str]
