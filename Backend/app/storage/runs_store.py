"""Run + stage-event persistence (report 5.10: every stage logs an event record)."""
from app.storage.db import fetch_all, get_pool


def create_run(run_id: str, ticket_id: str, status: str = "running") -> None:
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO runs (run_id, ticket_id, status) VALUES (%s, %s, %s) "
            "ON CONFLICT (run_id) DO NOTHING",
            (run_id, ticket_id, status),
        )
        conn.commit()


def update_run(run_id: str, **fields) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k} = %s" for k in fields)
    values = list(fields.values()) + [run_id]
    with get_pool().connection() as conn:
        conn.execute(f"UPDATE runs SET {cols}, updated_at = now() WHERE run_id = %s", values)
        conn.commit()


def add_stage_event(run_id: str, event: dict) -> None:
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO stage_events (run_id, ticket_id, stage, input_ref, output, status, duration_ms) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (
                run_id,
                event.get("ticket_id"),
                event.get("stage"),
                event.get("input_ref", ""),
                _to_jsonb(event.get("output")),
                event.get("status", "ok"),
                event.get("duration_ms", 0),
            ),
        )
        conn.commit()


def _to_jsonb(value):
    import json

    return json.dumps(value) if value is not None else None


def list_runs(limit: int = 100) -> list[dict]:
    return fetch_all(
        "SELECT run_id, ticket_id, status, route, category, severity, created_at "
        "FROM runs ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )


def get_run(run_id: str) -> dict | None:
    runs = fetch_all("SELECT * FROM runs WHERE run_id = %s", (run_id,))
    if not runs:
        return None
    run = runs[0]
    run["stages"] = fetch_all(
        "SELECT ticket_id, stage, ts, input_ref, output, status, duration_ms "
        "FROM stage_events WHERE run_id = %s ORDER BY id",
        (run_id,),
    )
    return run


def count_stage_events(run_id: str) -> int:
    rows = fetch_all("SELECT COUNT(*) AS n FROM stage_events WHERE run_id = %s", (run_id,))
    return int(rows[0]["n"]) if rows else 0
