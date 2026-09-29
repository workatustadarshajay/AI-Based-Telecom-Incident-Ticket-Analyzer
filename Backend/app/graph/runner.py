"""Workflow runner: executes the graph in a background thread pool and syncs the
run trace (status + stage events) into Postgres so the API/frontend can poll it."""
import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.types import Command
from psycopg_pool import ConnectionPool

from app.core.config import settings
from app.graph.workflow import compile_workflow
from app.storage import runs_store

_executor = ThreadPoolExecutor(max_workers=2)
# RLock (not Lock): get_graph() holds the lock while calling get_checkpointer(),
# which re-acquires it on the same thread - a plain Lock deadlocks there.
_lock = threading.RLock()
_checkpointer: PostgresSaver | None = None
_graph = None


def _trace(msg: str) -> None:
    """print-based tracing: visible in nohup logs regardless of logging config."""
    import sys

    print(f"[runner] {msg}", flush=True)


def get_checkpointer() -> PostgresSaver:
    """Postgres-backed checkpointer shared by API + runner threads.

    - A pool (not a single connection) is required: checkpoint writes happen from
      multiple executor threads concurrently.
    - autocommit: setup() runs CREATE INDEX CONCURRENTLY, which cannot run inside
      a transaction block.
    - setup() only runs when the checkpoint tables are missing; re-running it while
      another process holds the tables blocks on the CONCURRENTLY lock.
    """
    global _checkpointer
    if _checkpointer is None:
        with _lock:
            if _checkpointer is None:
                from psycopg.rows import dict_row

                _trace("creating checkpointer pool…")
                pool = ConnectionPool(
                    conninfo=settings.database_url,
                    min_size=1,
                    max_size=6,
                    kwargs={"row_factory": dict_row, "autocommit": True},
                    open=True,
                )
                saver = PostgresSaver(pool)
                with pool.connection() as conn:
                    exists = conn.execute(
                        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                        "WHERE table_schema='public' AND table_name='checkpoints')"
                    ).fetchone()
                _trace(f"checkpoint tables exist: {bool(exists and exists['exists'])}")
                if not (exists and exists["exists"]):
                    saver.setup()  # first boot only: creates checkpoint tables
                    _trace("setup() done")
                _checkpointer = saver
    return _checkpointer


def get_graph():
    global _graph
    if _graph is None:
        with _lock:
            if _graph is None:
                _graph = compile_workflow(get_checkpointer())
    return _graph


def _config(run_id: str) -> dict:
    return {"configurable": {"thread_id": run_id}}


def _sync_run(run_id: str, worker_alive: bool = False) -> None:
    """Copy graph state (status, route, category, severity, events) into Postgres.

    worker_alive=True while the invoke thread is running: between checkpoints the
    graph state looks settled (no pending interrupt, no final_status yet) but the
    run is NOT finished - it must sync as 'running', never as a terminal status,
    or the UI stops polling on a false 'completed'.
    """
    graph = get_graph()
    snapshot = graph.get_state(_config(run_id))
    values = snapshot.values or {}
    # Before the first checkpoint exists (graph still initializing) values is empty.
    # Syncing then would mark the run 'completed' and the UI would freeze on it.
    if not values:
        return
    # snapshot.next is non-empty BOTH while a node executes AND when paused at an
    # interrupt - distinguish by checking whether any pending task carries an
    # interrupt (attribute is 'interrupts', a tuple of Interrupt objects).
    tasks = list(getattr(snapshot, "tasks", None) or ())
    interrupted = any(
        getattr(t, "interrupts", None) or getattr(t, "interrupt", None) is not None
        for t in tasks
    )

    events = values.get("stage_events", []) or []
    persisted = runs_store.count_stage_events(run_id)
    for ev in events[persisted:]:
        runs_store.add_stage_event(run_id, ev)

    classification = values.get("classification") or {}
    severity = values.get("severity") or {}

    if values.get("error"):
        status = "failed"
    elif interrupted:
        status = "awaiting_approval"
    elif worker_alive:
        status = values.get("final_status") or "running"
    else:
        status = values.get("final_status") or "completed"

    runs_store.update_run(
        run_id,
        status=status,
        route=values.get("route"),
        category=str(getattr(classification.get("category"), "value", classification.get("category") or "")) or None,
        severity=str(getattr(severity.get("severity"), "value", severity.get("severity") or "")) or None,
        final_state=json.dumps({
            "ticket": values.get("ticket"),
            "summary": values.get("summary"),
            "classification": values.get("classification"),
            "severity": values.get("severity"),
            "retrieved_chunks": values.get("retrieved_chunks", []),
            "recommendation": values.get("recommendation"),
            "approval_decision": values.get("approval_decision"),
            "error": values.get("error"),
        }),
    )


def _execute_run(run_id: str, ticket: dict, log: dict | None, auto_approve: bool = False) -> None:
    _invoke_with_live_sync(
        run_id,
        {
            "run_id": run_id,
            "ticket": ticket,
            "log": log,
            "auto_approve": auto_approve,
            "retrieved_chunks": [],
            "revision_count": 0,
            "stage_events": [],
        },
    )


def _execute_resume(run_id: str, decision: dict) -> None:
    _invoke_with_live_sync(run_id, Command(resume=decision))


def _invoke_with_live_sync(run_id: str, graph_input) -> None:
    """Invoke the graph in a helper thread while syncing state every 2s so the
    dashboard sees stage-by-stage progress during (not just after) a run."""
    _trace(f"[{run_id}] runner thread starting")
    failed: list[Exception] = []

    def _invoke():
        try:
            _trace(f"[{run_id}] building graph…")
            graph = get_graph()
            _trace(f"[{run_id}] graph ready, invoking")
            graph.invoke(graph_input, _config(run_id))
            _trace(f"[{run_id}] invoke returned normally")
        except Exception as e:  # noqa: BLE001 - keep failure visible in the run trace
            import traceback

            _trace(f"[{run_id}] INVOKE FAILED: {e}\n{traceback.format_exc()}")
            failed.append(e)

    worker = threading.Thread(target=_invoke, daemon=True)
    worker.start()
    while worker.is_alive():
        try:
            _sync_run(run_id, worker_alive=True)
        except Exception:  # noqa: BLE001 - syncing must never kill the runner
            pass
        time.sleep(1.2)  # snappy live updates in the dashboard
    worker.join()

    if failed:
        runs_store.update_run(run_id, status="failed",
                              final_state=json.dumps({"error": str(failed[0])}))
    try:
        _sync_run(run_id)
    except Exception:  # noqa: BLE001
        pass


def start_run(ticket: dict, log: dict | None = None, auto_approve: bool = False) -> str:
    run_id = uuid.uuid4().hex[:12]
    runs_store.create_run(run_id, ticket.get("ticket_id", ""), status="running")
    _executor.submit(_execute_run, run_id, ticket, log, auto_approve)
    return run_id


def resume_run(run_id: str, decision: dict) -> None:
    runs_store.update_run(run_id, status="resuming")
    _executor.submit(_execute_resume, run_id, decision)


def recover_run(run_id: str) -> None:
    """Re-sync a run orphaned by a process restart (called from app startup)."""
    try:
        _sync_run(run_id)
    except Exception:  # noqa: BLE001
        pass
