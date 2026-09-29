const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail || `GET ${path} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail || `POST ${path} failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// --- Types mirroring backend schemas ---

export interface SampleTicket {
  ticket: {
    ticket_id: string
    timestamp: string
    network_type: string
    region: string
    service: string
    description: string
    affected_users: number
    status: string
  }
  log: Record<string, unknown> | null
}

export interface SubmitResponse {
  run_id: string | null
  ticket_id: string
}

export interface RunSummary {
  run_id: string
  ticket_id: string
  status: string
  route?: string | null
  category?: string | null
  severity?: string | null
  created_at: string
}

export interface StageEvent {
  stage: string
  ts: string
  output: unknown
  status: string
  duration_ms: number
}

export interface RunTrace extends RunSummary {
  stages: StageEvent[]
  final_state: Record<string, unknown>
}

export interface ApprovalItem {
  run_id: string
  ticket_id: string
  route?: string | null
  payload: {
    ticket_id: string
    ticket_description: string
    summary: string
    category: string
    severity: string
    recommendation: string
    sources: string[]
    route: string
  }
}

export interface PerClassMetric {
  label: string
  precision: number
  recall: number
  f1: number
  support: number
}

export interface MetricsResult {
  available: boolean
  message?: string
  n?: number
  accuracy?: number
  per_class?: PerClassMetric[]
  labels?: string[]
  confusion_matrix?: number[][]
}

export interface RagMetrics {
  available: boolean
  message?: string
  queries_evaluated?: number
  top1_rate?: number
  top3_rate?: number
  top5_rate?: number
  no_relevant_retrieval?: number
}

export interface ApprovalMetrics {
  available: boolean
  total?: number
  outcomes?: Record<string, { count: number; percentage: number }>
  rejection_reasons?: { reason: string; count: number }[]
}

export interface DatasetProfile {
  total_tickets: number
  dev_tickets: number
  test_tickets: number
  categories: number
  severity_distribution: Record<string, number>
  category_distribution: Record<string, number>
}

// --- Endpoints ---

export const api = {
  health: () => get<{ status: string }>('/health'),
  datasetProfile: () => get<DatasetProfile>('/analytics/summary'),
  sampleTicket: () => get<SampleTicket>('/tickets/sample'),
  submitTicket: (body: {
    description: string
    network_type: string
    region: string
    service: string
    affected_users: number
    auto_approve?: boolean
  }) => post<SubmitResponse>('/tickets', body),
  listRuns: (limit = 50) => get<RunSummary[]>(`/tickets?limit=${limit}`),
  getRun: (runId: string) => get<RunTrace>(`/tickets/${runId}`),
  pendingApprovals: () => get<ApprovalItem[]>('/approvals/pending'),
  submitApproval: (
    runId: string,
    body: { decision: string; reviewer: string; reason: string; edited_recommendation?: string },
  ) => post<{ run_id: string; resumed: boolean }>(`/approvals/${runId}`, body),
  classificationMetrics: () => get<MetricsResult>('/analytics/classification'),
  severityMetrics: () => get<MetricsResult>('/analytics/severity'),
  ragMetrics: () => get<RagMetrics>('/analytics/rag'),
  approvalMetrics: () => get<ApprovalMetrics>('/analytics/approvals'),
}
