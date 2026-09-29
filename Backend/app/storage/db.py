"""Postgres storage: connection pool + schema (report 5.10 logging, 4.8 approval storage)."""
import psycopg
from psycopg_pool import ConnectionPool

from app.core.config import settings

_pool: ConnectionPool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id        TEXT PRIMARY KEY,
    ticket_id     TEXT NOT NULL,
    status        TEXT NOT NULL,
    route         TEXT,
    category      TEXT,
    severity      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    final_state   JSONB
);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs (status);

CREATE TABLE IF NOT EXISTS stage_events (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    ticket_id   TEXT,
    stage       TEXT NOT NULL,
    ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    input_ref   TEXT,
    output      JSONB,
    status      TEXT,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_run ON stage_events (run_id);

CREATE TABLE IF NOT EXISTS approvals (
    id            BIGSERIAL PRIMARY KEY,
    run_id        TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    ticket_id     TEXT,
    decision      TEXT NOT NULL,
    reviewer      TEXT,
    reason        TEXT,
    edited_recommendation TEXT,
    decided_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_results (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT,
    ticket_id   TEXT NOT NULL,
    ref_category   TEXT,
    pred_category  TEXT,
    ref_severity   TEXT,
    pred_severity  TEXT,
    correct_cls    BOOLEAN,
    correct_sev    BOOLEAN,
    confidence     REAL,
    sources        JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=8,
            open=True,
        )
    return _pool


def init_schema() -> None:
    with get_pool().connection() as conn:
        conn.execute(SCHEMA)
        conn.commit()


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    with get_pool().connection() as conn:
        cur = conn.execute(query, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]
