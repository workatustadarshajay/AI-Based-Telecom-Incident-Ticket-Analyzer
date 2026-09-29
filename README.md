# AI-Based Telecom Incident Ticket Analyzer

RAG + Multi-Agent system that classifies synthetic telecom incident tickets, detects severity,
retrieves troubleshooting knowledge, suggests grounded resolutions, and requires **human approval**
before finalizing — built for the BCA Data Analytics major project (Amity University).

**Stack:** React 19 + Vite + Tailwind v4 · FastAPI · LangGraph (interrupt-based HITL) · Gemini
(`gemini-3.8-flash` + `gemini-embedding-001`) · ChromaDB · PostgreSQL (Docker)

## Architecture

```
Ticket → Summarize → Classify → Severity → Router ─┬─ critical ─┐
                                                   ├─ standard ─┴→ Retrieve (Chroma) → Resolve → ⏸ Approval → Finalize
                                                   └─ low-confidence / unknown → ⏸ Approval (manual review)
```

- **Router** (rule-based, report §5.8): Critical → priority path; confidence < 0.6 or unknown
  category → manual review; else standard RAG path.
- **Human approval**: the LangGraph `approval` node calls `interrupt()`; the graph state is
  persisted with a **Postgres checkpointer**. The reviewer's decision resumes the run via
  `Command(resume=...)`. "Revision Requested" loops back to resolution once (bounded).
- **Traceability**: every stage writes an event row (input, output, duration); retrieval events
  keep `doc_id` + similarity so recommendations always cite their sources.

## Layout

```
Frontend/   Aurora landing page + dashboard (Submit · Trace · Approvals · Analytics)
Backend/    FastAPI app (Backend/app/...) + synthetic data (Backend/data/)
```

## Setup

### 1. Database

A Dockerized Postgres must be reachable on `localhost:5432`. Create the database once:

```bash
docker exec <pg-container> psql -U careloop -d careloop -c "CREATE DATABASE telecom_analyzer"
```

### 2. Backend

```bash
cd Backend
uv sync --system-certs          # --system-certs needed on SSL-inspected corporate networks
```

Edit `Backend/.env`:

```
GEMINI_API_KEY=<your key from https://aistudio.google.com/apikey>
DATABASE_URL=postgresql://careloop:careloop@localhost:5432/telecom_analyzer
API_PORT=8001                   # 8000 is taken by another local project
```

Generate the synthetic data (500 tickets + outage logs + 12 troubleshooting PDFs):

```bash
uv run python -m app.data.generator
uv run python -m app.data.documents
```

Ingest the PDFs into ChromaDB (needs the Gemini key for embeddings):

```bash
uv run python -m app.rag.ingest
```

Start the API:

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### 3. Frontend

```bash
cd Frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api → 127.0.0.1:8001)
```

## Using the app

1. **Landing page** (`/`) — Aurora hero; "Open Dashboard" enters the app.
2. **Submit Ticket** — load a random synthetic ticket or write one → *Run workflow*; watch the
   pipeline stages complete live.
3. **Approvals** — tickets routed to review (critical, low-confidence, unknown) pause here;
   choose **Approve / Reject / Revision Requested** with a reason → the graph resumes.
4. **Ticket Trace** — full stage-by-stage structured output for every run.
5. **Analytics** — dataset profile, classification/severity confusion matrices, RAG retrieval
   rates, approval outcomes (report Chapter 6).

## Evaluation (report Chapter 6)

Batch evaluation over the held-out test split (never used for prompt tuning):

```bash
cd Backend
uv run python -m app.evaluation.run_evaluation --limit 60
```

Results land in `eval_results` and populate `/api/analytics/classification` and
`/api/analytics/severity`. Raise `--limit 185` for the full test set (mind the Gemini free-tier
quota; the runner paces requests).

## API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness |
| POST | `/api/tickets` | Submit ticket, start workflow |
| GET | `/api/tickets/sample` | Random synthetic ticket + outage log |
| GET | `/api/tickets` | List runs |
| GET | `/api/tickets/{run_id}` | Full run trace |
| GET | `/api/approvals/pending` | Interrupted runs awaiting review |
| POST | `/api/approvals/{run_id}` | Submit decision, resume graph |
| GET | `/api/analytics/summary` | Dataset profile (6.1) |
| GET | `/api/analytics/classification` | Per-class P/R/F1 + confusion matrix (6.2) |
| GET | `/api/analytics/severity` | Severity metrics (6.3) |
| GET | `/api/analytics/rag` | Retrieval success rates (6.4) |
| GET | `/api/analytics/approvals` | Approval outcomes + rejection reasons (6.6) |

Interactive docs: <http://127.0.0.1:8001/docs>

## Notes

- The prototype never executes network actions; recommendations are decision support only.
- Reference labels are stored separately (`Backend/data/labels/`) from prompt-visible data.
- `Backend/.env` is gitignored — never commit API keys.
