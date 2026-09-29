<div align="center">

<img src="docs/hero.jpg" alt="AI Telecom Incident Ticket Analyzer" width="100%" />

# AI-Based Telecom Incident Ticket Analyzer

**Multi-agent AI that triages telecom incidents — grounded in RAG, decided by humans.**

React 19 · FastAPI · LangGraph · Google Gemini · ChromaDB · PostgreSQL

[Report an issue](../../issues) · [View the demo video](#-demo-video) · [Setup guide](#-quick-start-5-minutes)

</div>

---

## What is this?

Telecom support teams drown in incident tickets. This project builds an **AI analyst** that does the
first pass on every ticket — reading, classifying, prioritizing, and drafting a resolution — while a
**human always makes the final call**.

It was designed and evaluated as a BCA Data Analytics major project (Amity University, 2026) using
**500 synthetic incident tickets**, so every metric in the dashboard comes from real, reproducible runs.

| | |
|---|---|
| 🎫 **Reads** | Unstructured telecom ticket descriptions + structured outage logs |
| 🏷️ **Classifies** | 7 incident categories with confidence + quoted evidence |
| 🚨 **Prioritizes** | Critical / High / Medium / Low severity + P1–P4 priority |
| 📚 **Grounds** | Retrieval-Augmented Generation over a ChromaDB knowledge base of troubleshooting PDFs — every suggestion cites its source documents |
| 🧑‍⚖️ **Escalates** | Low-confidence or critical tickets **pause at a human approval gate** (LangGraph `interrupt()`) before anything is finalized |
| 📊 **Measures** | Confusion matrices, per-class precision/recall/F1, retrieval hit rates, approval outcomes |

> ⚠️ **Scope:** a prototype trained/evaluated purely on synthetic data. It never connects to a real
> telecom network and never executes remediation actions — it produces recommendations only.

---

## 🎬 Demo video

**[▶ Watch the full 2½-minute walkthrough](video/demo-video.mp4)** — narrated explanation of the
architecture, the full setup, and three real end-to-end ticket examples (including one that pauses
for human approval).

<a href="video/demo-video.mp4"><img src="docs/demo-poster.jpg" alt="Demo video" width="720" /></a>

---

## 🏗️ How it works

```mermaid
flowchart LR
    A[Ticket + Outage Log] --> B[Summarize]
    B --> C[Classify<br/>category + confidence]
    C --> D[Severity<br/>impact + priority]
    D --> E{Router}
    E -->|Critical| F[Retrieve<br/>ChromaDB top-5]
    E -->|Standard| F
    E -->|Low confidence /<br/>Unknown| H
    F --> G[Resolve<br/>grounded + cited]
    G --> H[⏸ Human Approval<br/>LangGraph interrupt]
    H -->|Approve / Reject /<br/>Request revision| I[Finalize]
```

**The key design decision:** the workflow is a **LangGraph state machine**, and the approval stage is
a real graph **interrupt** — the run checkpoints to PostgreSQL and fully stops. It can sit there for
hours; when a reviewer clicks *Approve* in the dashboard, the exact same run resumes from where it
paused. Nothing is "queued in a fake status column."

Every stage writes an auditable event (input, output, duration) to PostgreSQL, so any wrong answer
can be traced back to the exact agent that produced it.

---

## 🧰 Technology stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | **React 19 + Vite + Tailwind CSS 4** | Aurora-style landing page + 4-tab operations dashboard |
| API | **FastAPI** (Python 3.10+) | Async REST endpoints, OpenAPI docs at `/docs` |
| Orchestration | **LangGraph** | State-machine workflow, conditional routing, `interrupt()`-based human-in-the-loop |
| LLM | **Google Gemini** (`gemini-3.8-flash` + `gemini-3.5-flash-lite`) | One API key for agents *and* embeddings; separate models stay under separate rate-limit buckets |
| RAG | **LangChain + ChromaDB** | PDF → chunk → embed → retrieve with similarity scores and doc citations |
| Checkpointing | **PostgreSQL** (`langgraph-checkpoint-postgres`) | Durable pause/resume for the approval gate + run traces |
| Analytics | **Pandas + scikit-learn** | Accuracy, per-class P/R/F1, confusion matrices (report Chapter 6) |
| Data | Synthetic generator (seeded) | 500 tickets, 315 dev / 185 held-out test, ~20% hard edge cases |

---

## 🚀 Quick start (5 minutes)

### Prerequisites

- **Python 3.10+** and [`uv`](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Node 18+** and npm
- **Docker** (for PostgreSQL) — any Postgres 14+ works
- A **Gemini API key** — free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (looks like `AIza…`)

### 1 · Database

```bash
# start Postgres (skip if you already run one)
docker run -d --name telecom-pg -e POSTGRES_USER=careloop -e POSTGRES_PASSWORD=careloop \
  -e POSTGRES_DB=telecom_analyzer -p 5432:5432 postgres:16-alpine
```

### 2 · Backend

```bash
cd Backend
uv sync                       # install dependencies

cp .env .env.local            # keep a backup of defaults, then edit .env:
#   GEMINI_API_KEY=AIza...    <- your key
#   DATABASE_URL=postgresql://careloop:careloop@localhost:5432/telecom_analyzer

uv run python -m app.data.generator      # 500 synthetic tickets + outage logs + 12 PDFs
uv run python -m app.data.documents      # (already done by generator, safe to re-run)
uv run python -m app.rag.ingest          # chunk + embed knowledge base into ChromaDB

uv run uvicorn app.main:app --host 0.0.0.0 --port 8001
```

> API docs now live at <http://localhost:8001/docs> ✔

### 3 · Frontend

```bash
cd Frontend
npm install
npm run dev        # → http://localhost:5173  (proxies /api → :8001)
```

### 4 · Run your first incident

1. Open **http://localhost:5173** → click **Open Dashboard**
2. **Submit Ticket** → *Load random ticket* → **Run workflow**
3. Watch the seven stages complete **live**
4. Critical / low-confidence tickets pause → open the **Approvals** tab → decide
5. **Analytics** fills up as runs accumulate

---

## 📊 Evaluation (report Chapter 6)

The dataset ships with a **locked, held-out test split** (never used for prompt tuning):

```bash
cd Backend
uv run python -m app.evaluation.run_evaluation --limit 60    # paced for free-tier quotas
uv run python -m app.evaluation.run_evaluation --limit 185   # full test set
```

This populates every chart in the **Analytics** tab and every table in Chapter 6:

| Endpoint | Report section |
|---|---|
| `/api/analytics/classification` | 6.2 — per-class P/R/F1 + confusion matrix |
| `/api/analytics/severity` | 6.3 — severity confusion matrix |
| `/api/analytics/rag` | 6.4 — top-1/3/5 retrieval hit rates |
| `/api/analytics/approvals` | 6.6 — approve/reject/revise outcomes + reasons |

---

## 📁 Project structure

```
├── Frontend/                 # React 19 landing page + operations dashboard
│   └── src/
│       ├── components/       # ui.tsx design system · Aurora hero
│       ├── dashboard/        # Submit · Trace · Approvals · Analytics tabs
│       └── api.ts            # typed API client
├── Backend/
│   ├── app/
│   │   ├── agents/           # summarize · classify · severity · resolve (Gemini)
│   │   ├── graph/            # LangGraph workflow · router · Postgres-checkpointed runner
│   │   ├── rag/              # ChromaDB ingest + cited retriever
│   │   ├── api/              # FastAPI routers (tickets, approvals, analytics)
│   │   ├── data/             # seeded synthetic generator + PDF documents
│   │   ├── evaluation/       # batch runner over the held-out test split
│   │   └── storage/          # runs · stage events · approvals (PostgreSQL)
│   └── data/                 # generated CSVs · 12 troubleshooting PDFs · Chroma index
├── video/                    # narrated demo video (HyperFrames composition + render)
├── docs/                     # hero image · video poster
└── implementation-plan.md    # the full project implementation plan
```

---

## 🔌 API reference

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/tickets` | Submit a ticket, start the workflow (opts: `auto_approve` demo mode) |
| `GET` | `/api/tickets/sample` | Random synthetic ticket + its outage log |
| `GET` | `/api/tickets` | List runs · `GET /api/tickets/{run_id}` for the full trace |
| `GET` | `/api/approvals/pending` | Runs paused at the human gate |
| `POST` | `/api/approvals/{run_id}` | Approve / Reject / Request revision → resumes the graph |
| `GET` | `/api/analytics/*` | Dataset profile, classification, severity, RAG, approvals |

---

## 🛡️ Safety & limitations

- **Synthetic data only** — no real customer data, no real network access
- **Decision support, not autonomy** — the system never executes network changes; every recommendation requires a recorded human approval
- Reference labels are stored separately from prompt-visible data; the test split is locked before any prompt iteration (validity threat controlled, per the report)
- Results generalize to *synthetic* ticket distributions; production deployment would require real-data validation, security review, and ITSM integration

---

## 👤 Author

**Adarsh Ajay** — BCA Data Analytics, Amity University (2026)
Supervised by *Gayathri Prasad Sarada Devi* · Register № A9922524001819(el)

<sub>Synthetic dataset, sample documents, and the demo video were produced for academic evaluation only.</sub>
