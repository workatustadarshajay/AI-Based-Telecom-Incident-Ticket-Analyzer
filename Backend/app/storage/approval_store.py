"""Approval decisions (report 4.8: decision + reason stored with ticket and timestamp)."""
from app.storage.db import fetch_all, get_pool


def record_approval(run_id: str, ticket_id: str, decision: str, reviewer: str,
                    reason: str, edited_recommendation: str | None = None) -> None:
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO approvals (run_id, ticket_id, decision, reviewer, reason, edited_recommendation) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (run_id, ticket_id, decision, reviewer, reason, edited_recommendation),
        )
        conn.commit()


def approval_stats() -> dict:
    rows = fetch_all(
        "SELECT decision, COUNT(*) AS count FROM approvals GROUP BY decision"
    )
    total = sum(r["count"] for r in rows) or 0
    stats = {r["decision"]: {"count": r["count"],
                             "percentage": round(100 * r["count"] / total, 1) if total else 0.0}
             for r in rows}
    return {"total": total, "outcomes": stats}


def rejection_reasons() -> list[dict]:
    return fetch_all(
        "SELECT reason, COUNT(*) AS count FROM approvals "
        "WHERE decision IN ('Rejected', 'Revision Requested') AND reason IS NOT NULL AND reason <> '' "
        "GROUP BY reason ORDER BY count DESC"
    )
