import { useCallback, useEffect, useState } from 'react'
import { api, type ApprovalItem } from '../../api'
import {
  Badge, Button, Card, EmptyState, ErrorText, Label, RadioGroup, SectionTitle,
  Spinner, TextArea, tokens,
} from '../../components/ui'

type Decision = 'Approved' | 'Rejected' | 'Revision Requested'

const DECISION_OPTIONS: { value: Decision; label: string; color?: string }[] = [
  { value: 'Approved', label: 'Approve', color: tokens.emerald },
  { value: 'Rejected', label: 'Reject', color: tokens.red },
  { value: 'Revision Requested', label: 'Request revision', color: tokens.amber },
]

export default function Approvals({ onResolved }: { onResolved?: () => void }) {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { decision: Decision | null; reason: string }>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setItems(await api.pendingApprovals())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending approvals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh])

  const setDraft = (runId: string, patch: Partial<{ decision: Decision | null; reason: string }>) =>
    setDrafts((d) => ({
      ...d,
      [runId]: { decision: d[runId]?.decision ?? null, reason: d[runId]?.reason ?? '', ...patch },
    }))

  const submit = async (runId: string) => {
    const d = drafts[runId]
    if (!d?.decision) return
    if (d.decision !== 'Approved' && !d.reason.trim()) return
    setSubmitting(runId)
    setError(null)
    try {
      await api.submitApproval(runId, {
        decision: d.decision,
        reviewer: 'analyst',
        reason: d.reason.trim(),
      })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[runId]
        return next
      })
      onResolved?.()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit approval')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <SectionTitle
        right={<Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>}
      >
        Human approval queue {items.length > 0 && <Badge tone="amber">{items.length} waiting</Badge>}
      </SectionTitle>

      {error && <div style={{ marginBottom: 12 }}><ErrorText>{error}</ErrorText></div>}
      {loading && items.length === 0 && <Spinner />}
      {!loading && items.length === 0 && (
        <EmptyState
          icon="✓"
          title="Queue is clear"
          hint="Tickets pause here when the router sends them to human review (critical severity, low confidence, or unknown category). Submit a ticket to see it in action."
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((item) => {
          const p = item.payload
          const draft = drafts[item.run_id]
          const needsReason = draft?.decision != null && draft.decision !== 'Approved' && !draft.reason.trim()
          return (
            <Card key={item.run_id} accent={p.route === 'priority_path' ? 'red' : p.route === 'manual_review' ? 'amber' : 'none'}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 14.5, fontFamily: tokens.fontDisplay }}>{p.ticket_id || item.ticket_id}</strong>
                  <Badge tone={p.route === 'priority_path' ? 'red' : p.route === 'manual_review' ? 'amber' : 'emerald'}>
                    {p.route?.replaceAll('_', ' ') ?? 'standard'}
                  </Badge>
                </div>
                <code style={{ fontSize: 11, color: tokens.textMuted }}>{item.run_id}</code>
              </header>

              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.text, margin: '0 0 12px' }}>
                {p.ticket_description}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 9, marginBottom: 12 }}>
                <MiniFact label="Category" value={p.category} />
                <MiniFact label="Severity" value={p.severity} />
                <MiniFact label="Summary" value={p.summary || '—'} />
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '13px 15px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted, marginBottom: 7 }}>
                  AI-recommended action plan
                </div>
                {p.recommendation ? <RecommendationBody raw={p.recommendation} /> : (
                  <em style={{ fontSize: 13, color: tokens.textMuted }}>
                    No AI recommendation — this run was routed to manual review before resolution.
                  </em>
                )}
                {p.sources?.length > 0 && (
                  <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: tokens.textMuted }}>grounded in</span>
                    {p.sources.map((s) => <Badge key={s} tone="emerald">{s}</Badge>)}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div>
                  <Label required>Decision</Label>
                  <RadioGroup value={draft?.decision ?? null} onChange={(v) => setDraft(item.run_id, { decision: v })} options={DECISION_OPTIONS} />
                </div>
                <div>
                  <Label required={draft?.decision != null && draft.decision !== 'Approved'}>
                    Reason {draft?.decision === 'Approved' ? '(optional)' : '(stored for the approval analysis, report 6.6)'}
                  </Label>
                  <TextArea
                    rows={2}
                    value={draft?.reason ?? ''}
                    onChange={(v) => setDraft(item.run_id, { reason: v })}
                    invalid={needsReason}
                    placeholder={draft?.decision === 'Revision Requested' ? 'What should the resolution agent reconsider…' : 'Why this decision…'}
                  />
                </div>
                {needsReason && <ErrorText>A reason is required when rejecting or requesting a revision.</ErrorText>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    onClick={() => submit(item.run_id)}
                    busy={submitting === item.run_id}
                    disabled={!draft?.decision || needsReason || submitting === item.run_id}
                  >
                    Submit review
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function RecommendationBody({ raw }: { raw: string }) {
  let steps: string[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) steps = parsed.map(String)
  } catch {
    steps = raw ? [raw] : []
  }
  if (steps.length === 0) return null
  return (
    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65, color: tokens.text }}>
      {steps.map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '8px 12px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted }}>{label}</div>
      <div style={{ fontSize: 12.5, marginTop: 2, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: label === 'Summary' ? undefined : 'nowrap' }} title={value}>
        {value}
      </div>
    </div>
  )
}
