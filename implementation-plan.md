# Implementation Plan — AI-Based Telecom Incident Ticket Analyzer

**Project:** AI-Based Telecom Incident Ticket Analysis Using RAG and Multi-Agent Systems
**Student:** Adarsh Ajay (A9922524001819(el)) · BCA – Data Analytics · Amity University
**Plan date:** September 2026

This plan turns the submitted project report into a concrete, buildable system. It follows the
report's methodology (Chapter 3), architecture (Chapter 4), and implementation guidance
(Chapter 5) exactly, and prepares the ground for the results chapter (Chapter 6).

---

## 1. What We Are Building (One Paragraph)

A prototype system that ingests **synthetic telecom incident tickets**, runs them through a
**LangGraph multi-agent workflow** (summarization → classification → severity detection →
router → RAG retrieval → resolution suggestion → **human approval via interrupt**), and stores
every intermediate output so that a **data analytics layer** can compute classification/severity
metrics, RAG retrieval quality, and human-approval outcomes against the synthetic reference
labels. A **React dashboard** lets you submit tickets, watch the workflow, act as the human
approver, and view the evaluation charts needed for Chapter 6.

## 2. Technology Stack (Confirmed)

This matches the report's §5.2 "Suggested Technology Stack" — no deviation is needed.

| Layer | Choice | Role | Report ref |
|---|---|---|---|
| Frontend | **React + Vite** (plain CSS or Tailwind) | Ticket submission, approval UI, analytics dashboard | §5.9 |
| API | **FastAPI** (Python) | REST endpoints, CORS, static serving | §5.2 |
| Orchestration | **LangGraph** | Sequential graph + router + `interrupt()` HITL | §5.2, §3.9 |
| LLM / Embeddings | **Google Gemini** (`langchain-google-genai`) | Agents + document embeddings, single API key | §5.2 |
| RAG framework | **LangChain** (loaders, splitters, prompts, output parsers) | Document processing + agent prompts | §4.6 |
| Vector store | **ChromaDB** (persistent, local) | Knowledge-base index of troubleshooting chunks | §5.2 |
| Data | **Pandas**, CSV/JSON storage | Synthetic data generation, metrics, confusion matrices | §5.2, §6 |
| Evaluation | scikit-learn metrics + Matplotlib/Plotly | Precision/recall/F1, confusion matrices, charts | §3.10, §6.8 |
| Human-in-the-loop | LangGraph `interrupt()` + `SqliteSaver` | Graph pauses at approval node; decision resumes the same run | §4.8, Fig. 5 |

**Decisions already made with you:**
1. **Embeddings:** Gemini embedding model (`models/embedding-001` / `gemini-embedding-001`) — one API key for everything. Watch the free-tier daily quota; batch indexing once, not per query.
2. **Dataset size:** **~500 tickets** (≈300 dev + 200 held-out test per §3.7). Batch evaluation runs may need pacing to stay within Gemini free-tier limits.
3. **Human approval:** LangGraph native `interrupt()` with a SQLite checkpointer — no separate "pending queue" hack. This directly demonstrates report Fig. 5.

---

## 3. Project Structure

```
telecom-ticket-analyzer/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, CORS, routers
│   │   ├── api/
│   │   │   ├── tickets.py           # submit ticket, list, get trace
│   │   │   ├── approvals.py         # get pending approvals, submit decision (resumes graph)
│   │   │   └── analytics.py         # metrics endpoints for the dashboard
│   │   ├── core/
│   │   │   ├── config.py            # env settings (GEMINI_API_KEY, paths, thresholds)
│   │   │   └── logging_setup.py     # per-stage event logging (§5.10)
│   │   ├── data/
│   │   │   ├── generator.py         # synthetic ticket + outage-log generator (§3.3, §5.3)
│   │   │   ├── schemas.py           # Pydantic models = report Tables 4/5/6
│   │   │   └── documents.py         # sample troubleshooting PDF generator
│   │   ├── rag/
│   │   │   ├── ingest.py            # PDF → text → clean → chunk → embed → Chroma (§5.7)
│   │   │   └── retriever.py         # top-k retrieval with metadata + scores (§4.6)
│   │   ├── agents/
│   │   │   ├── summarizer.py        # intake summarization, no invented values (§4.2)
│   │   │   ├── classifier.py        # category + confidence + evidence (§4.3)
│   │   │   ├── severity.py          # severity + priority + rationale (§4.4)
│   │   │   └── resolution.py        # grounded recommendation + source IDs (§4.7)
│   │   ├── graph/
│   │   │   ├── state.py             # TicketState TypedDict (shared workflow state)
│   │   │   ├── workflow.py          # LangGraph build: nodes, edges, router, interrupt
│   │   │   └── router.py            # rule-based router (§5.8)
│   │   ├── evaluation/
│   │   │   ├── run_evaluation.py    # batch run over held-out test set
│   │   │   ├── metrics.py           # accuracy/precision/recall/F1, confusion matrices
│   │   │   └── charts.py            # Matplotlib/Plotly charts for §6.8
│   │   └── storage/
│   │       ├── runs_store.py        # run traces, stage events (JSON/SQLite)
│   │       └── approval_store.py    # approve/reject/revise + reasons (§4.8)
│   ├── data/
│   │   ├── tickets_dev.csv          # ≈300 tickets (prompt development)
│   │   ├── tickets_test.csv         # ≈200 tickets (held-out, never prompt-tuned)
│   │   ├── outage_logs.csv          # synthetic outage logs
│   │   ├── labels/                  # reference labels stored separately (§3.7 rule 12)
│   │   ├── documents/               # sample troubleshooting PDFs (DOC-001…DOC-0xx)
│   │   └── chroma/                  # persistent ChromaDB directory
│   ├── requirements.txt
│   └── .env                         # GEMINI_API_KEY (never committed)
└── frontend/
    └── src/
        ├── pages/  SubmitTicket · TicketTrace · Approvals · Analytics
        └── components/ StageTimeline · EvidencePanel · SourceCitations · Charts
```

---

## 4. Data Layer (Report Objectives O1, O4)

### 4.1 Synthetic ticket dataset — ~500 tickets

Use the report's exact schema (Table 4) and vocabularies (Tables 5 & 6):

- **Fields:** `ticket_id` (TKT-0001…), `timestamp`, `network_type` (5G/4G/VoLTE…), `region` (Region-A/B/C…), `service`, `description`, `category` (reference), `severity` (reference), `affected_users`, `status`.
- **Categories (7):** Network Outage · Connectivity Issue · Performance Degradation · Voice Service Issue · Infrastructure Issue · Configuration Issue · Unknown / Other.
- **Severities (4):** Critical · High · Medium · Low.

Generator design (`generator.py`):
1. **Template families per category** — e.g. outage template combines network technology × region × service × symptom phrase × user-impact value, as §5.3 specifies.
2. **Controlled randomization** over templates so similar incidents use different wording (the core problem in §1.1).
3. **Edge cases (~20% of dataset, §5.3):** incomplete descriptions, ambiguous symptoms, contradictory signals ("slow browsing" with a site alarm), unknown-category tickets. Without these, results would be misleadingly high — state this in Chapter 6.
4. **Severity follows the report's illustrative rules (Table 6):** broad outage / very high user impact → Critical; large area or important localized outage → High; moderate single-service impact → Medium; small isolated problem → Low.
5. **Split & leak protection (§3.7):** dev/test split is decided once; reference labels are stored in `labels/` separately from anything the prompts see; the test set is never used for prompt tuning (this is a validity threat the report calls out in §7.8).
6. Also generate **synthetic outage logs** (structured context: site ID, alarm codes, start/end time, affected cells) joinable by region/site so the summarizer can merge ticket + log context.

### 4.2 Knowledge base — sample telecom troubleshooting PDFs

1. Create **~15–25 short PDFs** (`DOC-001`…) covering the report's §3.2 topics: connectivity troubleshooting, service degradation/latency, base-station alarms, backhaul link troubleshooting, packet loss, VoLTE call failures, power/infrastructure checks, configuration drift, escalation policy.
2. Metadata per document: `doc_id`, `topic`, `service`, `network_type`, `version` (§3.6).
3. Ingestion (§5.7 steps 13–20): `pypdf` text extraction → strip repeated headers/footers → **recursive character splitting** (~800 chars, ~120 overlap, tuned by inspection) → Gemini embeddings → **ChromaDB persistent collection** with metadata → smoke-test retrieval with representative ticket queries → log retrieved chunk IDs during evaluation.

---

## 5. Agent Layer (Report §3.8, §4.2–4.7, §5.5–5.6)

Every agent uses **LangChain structured output** (Pydantic parsers) so outputs are JSON, matching Appendix B exactly. Prompts constrain each agent to its defined responsibility (§5.5).

| Agent | Input | Structured output | Prompt rules |
|---|---|---|---|
| **Summarizer** (§4.2) | Raw ticket + matching outage log | summary with symptoms, service, network type, region, affected users, timestamps, log info, `unknown` markers | Must not invent missing values — explicitly mark unknown |
| **Classifier** (§4.3) | Summary + ticket text | `category`, `confidence` (0–1), `evidence[]`, `uncertain: bool` | Only the 7 allowed categories; evidence must quote ticket text |
| **Severity Agent** (§4.4) | Ticket + category + affected_users + log impact | `severity`, `priority` (P1–P4), `reason` | Operational rules in prompt (affected users, service criticality, duration, scope, outage indicators) — not purely linguistic |
| **Resolution Agent** (§4.7) | Ticket + category + retrieved chunks | `suspected_issue`, `evidence[]`, `diagnostic_steps[]`, `expected_observations[]`, `escalation_conditions[]`, `sources[]` (doc IDs) | Grounded-only instruction: use retrieved context for technical claims; cite `doc_id`s; never claim an action was performed |

Model choice: `gemini-2.0-flash` (or current default flash model) for all agents — fast and free-tier friendly. Temperature 0–0.2 for classification/severity (determinism for evaluation), ≤0.4 for resolution text.

---

## 6. Workflow Layer — LangGraph (Report §3.9, §4.5, Fig. 3, Fig. 4)

### 6.1 Graph shape

```
START → summarize → classify → severity → route ─┬─ critical ──→ retrieve → resolve → approval (interrupt) → END
                                                 ├─ standard ──→ retrieve → resolve → approval (interrupt) → END
                                                 ├─ low_conf / unknown → manual_review → END
                                                 └─ critical also skips queue (accelerated flag)
```

- `state.py`: `TicketState` TypedDict carrying `ticket`, `log_context`, `summary`, `classification`, `severity`, `route`, `retrieved_chunks`, `recommendation`, `approval`, `stage_events[]`.
- **Router (§5.8)** is a plain Python conditional edge (rule-assisted, not LLM — the report prefers this first because it keeps the experiment interpretable):
  - `severity == Critical` → priority path (accelerated, mandatory review)
  - `confidence < 0.6` or `uncertain` → human review path (no auto resolution)
  - `category == Unknown / Other` → manual review path
  - otherwise → standard RAG path
- **Human approval (§4.8):** the approval node calls `interrupt()`; the graph state is persisted with `SqliteSaver`. The FastAPI approvals endpoint resubmits the decision (`Approve / Reject / Request Revision` + reason) and the graph resumes to END. Decision, reviewer, reason, and timestamp are stored in `approval_store` for §6.6 analysis.
- **If LLM routes to `reject/revise`:** a revise loop re-enters resolution once (bounded) so the approval decision actually has effect; record loop count.

### 6.2 Traceability (§5.10)

Every node appends an event: `{ticket_id, stage, timestamp, input_ref, output, status}`. Retrieval events additionally store `doc_id`, `chunk_id`, `similarity_score` for the §6.4 retrieval analysis. Runs are persisted as one JSON trace per ticket in `runs_store`.

---

## 7. API Layer — FastAPI

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/tickets` | POST | Submit ticket → start graph run → return run_id (+ `interrupted` if awaiting approval) |
| `/api/tickets` | GET | List runs with status |
| `/api/tickets/{id}` | GET | Full stage-by-stage trace (feeds the React timeline) |
| `/api/approvals/pending` | GET | Interrupted runs awaiting review (summary + evidence + sources + recommendation) |
| `/api/approvals/{run_id}` | POST | Submit decision → resume graph |
| `/api/analytics/summary` | GET | Dataset profile (§6.1) |
| `/api/analytics/classification` | GET | Per-class P/R/F1 + confusion matrix (§6.2) |
| `/api/analytics/severity` | GET | Severity P/R/F1 + confusion matrix (§6.3) |
| `/api/analytics/rag` | GET | Retrieval rates (§6.4) |
| `/api/analytics/approvals` | GET | Approval outcome + rejection reasons (§6.6) |

---

## 8. Frontend — React (Report §5.9, Fig. 5)

1. **Submit Ticket:** paste/import a ticket (or pick a random synthetic one) → live status as the workflow progresses (poll run trace).
2. **Ticket Trace:** stage timeline showing each agent's structured output — classification with confidence + evidence chips, severity with rationale, retrieved chunks with similarity scores, resolution with clickable source citations (`DOC-005` → opens the PDF section).
3. **Approvals (the HITL screen):** pending list; each card shows original ticket, summary, predicted category/severity, evidence, retrieved documents, and proposed resolution; buttons **Approve / Reject / Request Revision** + reason box → resumes the LangGraph run.
4. **Analytics dashboard:** the §6.8 chart list — category & severity distribution bars, both confusion matrices (heatmaps), per-class P/R/F1 chart, RAG retrieval success chart, approval outcome chart, error-by-stage chart. Matplotlib on the backend rendering to images, or Plotly via JSON if you prefer interactivity.

---

## 9. Evaluation Layer (Report Chapter 6 — Objectives O8)

This is where the Data Analytics specialization earns its marks. `run_evaluation.py` batch-processes the **200 held-out test tickets** through the full workflow (auto-approving where the rubric allows, plus a manual reviewer pass over a sample of ~50 resolutions).

| Report section | What we produce |
|---|---|
| §6.1 Dataset profile | Counts + category/severity distribution; imbalance discussion |
| §6.2 Classification | sklearn `classification_report` + confusion matrix per category |
| §6.3 Severity | Same, per severity level; over/under-estimation analysis |
| §6.4 RAG retrieval | Top-1/Top-3/Top-5 relevant-retrieval rates against a manually labeled relevance set; % queries with no relevant retrieval |
| §6.5 Resolution rubric | 1–5 scale on relevance, grounding, completeness, clarity, operational appropriateness (reviewer instructions written down) |
| §6.6 Approvals | approve/reject/revise counts + rejection reason taxonomy |
| §6.7 Error analysis | Link each error to its stage (classification vs retrieval vs generation) using the stage event log |
| §6.8 Visualizations | All listed charts, saved to `evaluation/charts/` and served in the dashboard |

**Cost/quota plan (500 tickets):** batch the test run with small sleeps between tickets; if the free-tier daily limit hits, run in chunks across days — the run store makes this resumable. Keep dev-set prompt iteration light to protect the quota.

---

## 10. Build Phases & Milestones

**Phase 1 — Foundations (Week 1)**
Repo scaffold, `.env` + config, Pydantic schemas (Tables 4/5/6), synthetic ticket + outage-log generator with edge cases, CSV outputs + dev/test split. ✔ *O1*

**Phase 2 — Knowledge base & RAG (Week 2)**
Sample troubleshooting PDFs, ingestion pipeline, ChromaDB index, retriever with metadata/scores, retrieval smoke tests. ✔ *O4*

**Phase 3 — Agents (Weeks 3–4)**
LangChain prompts + structured outputs for summarizer, classifier, severity, resolution. Test each agent standalone on ~30 dev tickets; iterate prompts **only on dev data**. ✔ *O2, O3, O5*

**Phase 4 — LangGraph workflow (Week 4–5)**
State, nodes, rule-based router, `interrupt()` + SqliteSaver approval resume, stage event logging, run persistence. ✔ *O6, O7*

**Phase 5 — API + Frontend (Week 5–6)**
FastAPI endpoints, React pages (submit, trace, approvals, analytics), end-to-end manual walkthrough.

**Phase 6 — Evaluation & results (Week 6–7)**
Manual relevance labeling for the RAG test set, batch evaluation run, metrics + charts, rubric scoring sessions, error analysis. ✔ *O8*

**Phase 7 — Report finalization (Week 7–8)**
Populate Chapter 6 tables with **actual** values, insert Figures 1–6, write interpretation (§6.9), Discussion (Ch. 7) against observed results, finalize references ([5]–[7] with the exact libraries used).

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemini free-tier quota exhaustion during batch eval | Pacing + resumable run store; chunk eval across days; embeddings indexed once |
| Misleadingly high accuracy on easy templates | ~20% hard edge cases in the generator (§5.3) |
| Prompt-tuning leakage into test set (§7.8 threat) | Locked dev/test split; test set touched only once in Phase 6 |
| Unstable/invalid JSON from LLM | LangChain structured-output parsing with fallback retry at temperature 0 |
| Interrupt/resume complexity in LangGraph | Use the official `interrupt()` + `SqliteSaver` pattern; keep a plain DB "pending" fallback if needed |
| Chroma retrieval misses for short PDFs | Chunk-size/overlap tuning on dev queries; keep metadata filters (service, network_type) as a second retrieval strategy |
| Human rubric subjectivity (§7.7) | Written reviewer instructions + a fixed sample size; note it as a limitation |

---

## 12. Definition of Done

- [ ] 500 synthetic tickets + outage logs generated with separate reference labels; locked test split
- [ ] ≥15 troubleshooting PDFs indexed in ChromaDB with doc-level metadata
- [ ] All four agents return validated structured outputs on dev set
- [ ] LangGraph runs end-to-end: sequential path, all three router branches, interrupt-based approval resume
- [ ] React dashboard: submit, live trace, approve/reject/revise with reasons, all §6.8 charts
- [ ] Evaluation run over 200 test tickets produces every Chapter 6 table with real values
- [ ] Per-stage event logs enable the §6.7 error analysis
- [ ] Chapter 6 populated with actual results; no invented numbers anywhere
