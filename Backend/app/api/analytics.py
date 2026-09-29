"""Analytics endpoints (report Chapter 6): dataset profile, classification/severity metrics,
RAG retrieval stats, approval outcomes - the Data Analytics specialization layer."""
import json

import pandas as pd
from fastapi import APIRouter, HTTPException
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score

from app.core.config import settings
from app.storage import approval_store
from app.storage.db import fetch_all

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

SIMILARITY_THRESHOLD = 0.55  # cosine-similarity cut-off used for "relevant retrieval" (6.4)


def _predictions_df() -> pd.DataFrame:
    rows = fetch_all(
        "SELECT ticket_id, ref_category, pred_category, ref_severity, pred_severity, "
        "correct_cls, correct_sev, confidence, sources FROM eval_results"
    )
    return pd.DataFrame(rows)


def _per_class(y_true: pd.Series, y_pred: pd.Series, labels: list[str]) -> list[dict]:
    return [
        {
            "label": label,
            "precision": round(float(precision_score(y_true, y_pred, labels=[label], average="macro", zero_division=0)), 4),
            "recall": round(float(recall_score(y_true, y_pred, labels=[label], average="macro", zero_division=0)), 4),
            "f1": round(float(f1_score(y_true, y_pred, labels=[label], average="macro", zero_division=0)), 4),
            "support": int((y_true == label).sum()),
        }
        for label in labels
    ]


@router.get("/summary")
def dataset_profile() -> dict:
    """Report 6.1 dataset profile from the synthetic dataset."""
    path = settings.data_path / "tickets.csv"
    if not path.exists():
        raise HTTPException(503, "Dataset not generated yet")
    t = pd.read_csv(path)
    return {
        "total_tickets": int(len(t)),
        "dev_tickets": int((t["split"] == "dev").sum()),
        "test_tickets": int((t["split"] == "test").sum()),
        "categories": int(t["category"].nunique()),
        "severity_distribution": {k: int(v) for k, v in t["severity"].value_counts().items()},
        "category_distribution": {k: int(v) for k, v in t["category"].value_counts().items()},
    }


@router.get("/classification")
def classification_metrics() -> dict:
    """Report 6.2: accuracy, per-class precision/recall/F1, confusion matrix."""
    df = _predictions_df()
    if df.empty:
        return {"available": False, "message": "Run the evaluation first (see README)"}
    y_true = df["ref_category"].astype(str)
    y_pred = df["pred_category"].astype(str)
    labels = sorted(set(y_true) | set(y_pred))
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "available": True,
        "n": int(len(df)),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "per_class": _per_class(y_true, y_pred, labels),
        "labels": labels,
        "confusion_matrix": cm.tolist(),
    }


@router.get("/severity")
def severity_metrics() -> dict:
    """Report 6.3: severity detection performance."""
    df = _predictions_df()
    if df.empty:
        return {"available": False, "message": "Run the evaluation first (see README)"}
    df = df[df["ref_severity"].notna() & (df["ref_severity"] != "")]
    if df.empty:
        return {"available": False, "message": "No labeled severity rows in eval_results"}
    y_true = df["ref_severity"].astype(str)
    y_pred = df["pred_severity"].astype(str)
    labels = [l for l in ["Critical", "High", "Medium", "Low"] if l in set(y_true) | set(y_pred)]
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "available": True,
        "n": int(len(df)),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "per_class": _per_class(y_true, y_pred, labels),
        "labels": labels,
        "confusion_matrix": cm.tolist(),
    }


@router.get("/rag")
def rag_metrics() -> dict:
    """Report 6.4: retrieval success rates from logged retrieval events."""
    rows = fetch_all("SELECT output FROM stage_events WHERE stage = 'retrieve' AND status = 'ok'")
    queries = top1 = top3 = top5 = none_relevant = 0
    for r in rows:
        try:
            out = r["output"] if isinstance(r["output"], dict) else json.loads(r["output"] or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        chunks = out.get("chunks") or []
        queries += 1
        if not chunks:
            none_relevant += 1
            continue
        sims = [float(c.get("similarity", 0.0)) for c in chunks]
        if sims and sims[0] >= SIMILARITY_THRESHOLD:
            top1 += 1
        if any(s >= SIMILARITY_THRESHOLD for s in sims[:3]):
            top3 += 1
        if any(s >= SIMILARITY_THRESHOLD for s in sims[:5]):
            top5 += 1
    if queries == 0:
        return {"available": False, "message": "No retrieval events logged yet"}
    return {
        "available": True,
        "queries_evaluated": queries,
        "top1_rate": round(top1 / queries, 4),
        "top3_rate": round(top3 / queries, 4),
        "top5_rate": round(top5 / queries, 4),
        "no_relevant_retrieval": none_relevant,
    }


@router.get("/approvals")
def approval_metrics() -> dict:
    """Report 6.6: approval outcomes + rejection reason taxonomy."""
    stats = approval_store.approval_stats()
    reasons = approval_store.rejection_reasons()
    return {"available": stats["total"] > 0, **stats, "rejection_reasons": reasons}
