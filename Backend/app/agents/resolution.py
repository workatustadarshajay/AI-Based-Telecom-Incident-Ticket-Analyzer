"""Resolution suggestion agent (report 4.7): grounded, cited, no invented procedures."""
from app.agents.llm import get_llm, invoke_structured
from app.data.schemas import ResolutionOutput, RetrievedChunk

PROMPT = """You are the Resolution Suggestion agent in a telecom incident analysis system.
Produce a recommended action plan for the ticket using ONLY the retrieved knowledge-base
context. Do not invent procedures that are not supported by the retrieved documents.

Rules:
- Base diagnostic steps on the retrieved context.
- Cite the doc_id of every document you used in the sources list.
- If the retrieved context is insufficient, say so in suspected_issue and keep steps minimal.
- Never claim any network action has been performed; this is a recommendation only.
- Include escalation conditions consistent with the documents.

Ticket:
{ticket}

Classification: {category} (confidence {confidence})
Severity: {severity} ({priority})

Retrieved knowledge-base context:
{context}
"""


def _format_context(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "(no documents retrieved - state that knowledge base context is unavailable)"
    parts = []
    for c in chunks:
        parts.append(f"[{c.doc_id} | topic: {c.topic} | similarity {c.similarity}]\n{c.content}")
    return "\n\n---\n\n".join(parts)


def suggest_resolution(
    ticket: dict,
    category: str,
    confidence: float,
    severity: str,
    priority: str,
    chunks: list[RetrievedChunk],
) -> ResolutionOutput:
    llm = get_llm(temperature=0.2)
    structured = llm.with_structured_output(ResolutionOutput)
    prompt = PROMPT.format(
        ticket=ticket.get("description", ""),
        category=category,
        confidence=confidence,
        severity=severity,
        priority=priority,
        context=_format_context(chunks),
    )
    result: ResolutionOutput = invoke_structured(structured, prompt)
    # Traceability: keep only doc_ids that were actually retrieved (report 4.6)
    valid_ids = {c.doc_id for c in chunks}
    result.sources = [s for s in result.sources if s in valid_ids]
    return result
