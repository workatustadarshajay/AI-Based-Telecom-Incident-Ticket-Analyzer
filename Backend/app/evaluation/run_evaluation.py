"""Batch evaluation runner (report 6, Objective O8).

Processes the held-out test split through the full agent pipeline (no human interrupt -
auto-recorded), writes predictions into eval_results, and prints the Chapter 6 metrics.

Usage:
    uv run python -m app.evaluation.run_evaluation            # 60 test tickets
    uv run python -m app.evaluation.run_evaluation --limit 200
"""
import argparse
import json
import time

import pandas as pd

from app.core.config import settings
from app.agents.summarizer import summarize_ticket
from app.agents.classifier import classify_ticket
from app.agents.severity import detect_severity
from app.agents.resolution import suggest_resolution
from app.rag.retriever import build_query, retrieve
from app.storage.db import get_pool, init_schema


def _load_test(limit: int) -> pd.DataFrame:
    path = settings.data_path / "tickets_test.csv"
    if not path.exists():
        raise SystemExit("Test split missing - run: uv run python -m app.data.generator")
    df = pd.read_csv(path)
    return df.head(limit)


def _load_logs() -> dict[str, dict]:
    path = settings.data_path / "outage_logs.csv"
    if not path.exists():
        return {}
    logs = pd.read_csv(path)
    first = logs.groupby("ticket_id").first().reset_index()
    return {r["ticket_id"]: r.to_dict() for _, r in first.iterrows()}


def run_evaluation(limit: int = 60) -> None:
    init_schema()
    test = _load_test(limit)
    logs = _load_logs()
    print(f"Evaluating {len(test)} held-out test tickets...")

    conn_pool = get_pool()
    done = 0
    for _, row in test.iterrows():
        ticket = {k: (None if pd.isna(v) else v) for k, v in row.to_dict().items() if k != "split"}
        log = logs.get(ticket["ticket_id"])
        try:
            classification = classify_ticket(ticket, log)
            cls_out = classification.model_dump(mode="json")
            cls_out["category"] = getattr(cls_out["category"], "value", cls_out["category"])

            severity = detect_severity(ticket, cls_out["category"], log)
            sev_out = severity.model_dump(mode="json")
            sev_out["severity"] = getattr(sev_out["severity"], "value", sev_out["severity"])

            summary = summarize_ticket(ticket, log)
            query = build_query(summary.symptoms, cls_out["category"], ticket.get("network_type", ""))
            chunks = retrieve(query)

            recommendation = suggest_resolution(
                ticket=ticket,
                category=cls_out["category"],
                confidence=classification.confidence,
                severity=sev_out["severity"],
                priority=sev_out["priority"],
                chunks=chunks,
            )

            with conn_pool.connection() as conn:
                conn.execute(
                    "INSERT INTO eval_results (ticket_id, ref_category, pred_category, ref_severity, "
                    "pred_severity, correct_cls, correct_sev, confidence, sources) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        ticket["ticket_id"],
                        ticket.get("category", ""),
                        cls_out["category"],
                        ticket.get("severity", ""),
                        sev_out["severity"],
                        ticket.get("category", "") == cls_out["category"],
                        ticket.get("severity", "") == sev_out["severity"],
                        float(classification.confidence),
                        json.dumps(recommendation.sources),
                    ),
                )
                conn.commit()
        except Exception as e:  # noqa: BLE001 - log and continue the batch
            print(f"  {ticket['ticket_id']}: FAILED ({e})")
            time.sleep(1.0)
            continue

        done += 1
        if done % 10 == 0:
            print(f"  {done}/{len(test)} evaluated")
        time.sleep(0.4)  # free-tier pacing

    _report()


def _report() -> None:
    from app.storage.db import fetch_all

    rows = fetch_all(
        "SELECT ticket_id, ref_category, pred_category, ref_severity, pred_severity, "
        "correct_cls, correct_sev, confidence FROM eval_results"
    )
    if not rows:
        print("No evaluation results recorded yet.")
        return
    df = pd.DataFrame(rows)
    print("\n=== Classification (6.2) ===")
    print(f"accuracy: {df['correct_cls'].mean():.4f}  n={len(df)}")
    print("\n=== Severity (6.3) ===")
    labeled = df[df["ref_severity"].notna() & (df["ref_severity"] != "")]
    print(f"accuracy: {labeled['correct_sev'].mean():.4f}  n={len(labeled)}")
    print("\nFull per-class metrics: GET /api/analytics/classification and /api/analytics/severity")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=60, help="number of test tickets to evaluate")
    args = parser.parse_args()
    run_evaluation(limit=args.limit)
