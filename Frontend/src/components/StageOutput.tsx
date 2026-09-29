import type { StageEvent } from '../api'
import { Badge, tokens } from './ui'

/* Renders structured agent outputs as readable cards instead of raw JSON. */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted }}>{label}</span>
      <span style={{ fontSize: 13, color: tokens.text, lineHeight: 1.5 }}>{String(children)}</span>
    </div>
  )
}

function List({ items, color = tokens.emerald }: { items: string[]; color?: string }) {
  return (
    <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map((s, i) => (
        <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: tokens.textSecondary }}>
          <span style={{ color, marginRight: 6, fontWeight: 600 }}>{i + 1}.</span>{s}
        </li>
      ))}
    </ol>
  )
}

function Fallback({ output }: { output: unknown }) {
  return (
    <pre style={{
      margin: 0, fontSize: 12, lineHeight: 1.55, color: tokens.textSecondary,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace',
    }}>
      {JSON.stringify(output, null, 2)}
    </pre>
  )
}

function SummaryView({ o }: { o: Record<string, unknown> }) {
  const unknowns = (o.unknown_fields as string[] | undefined) ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Row label="Symptoms">{String(o.symptoms ?? '—')}</Row>
      <Row label="Service">{String(o.affected_service ?? '—')}</Row>
      <Row label="Network">{String(o.network_type ?? '—')}</Row>
      <Row label="Region">{String(o.region ?? '—')}</Row>
      <Row label="Users affected">{o.affected_users != null ? String(o.affected_users) : 'unknown'}</Row>
      {o.timestamps ? <Row label="Timestamps">{String(o.timestamps)}</Row> : null}
      {unknowns.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>unknown:</span>
          {unknowns.map((u) => <Badge key={u} tone="neutral">{u}</Badge>)}
        </div>
      )}
    </div>
  )
}

function ClassificationView({ o }: { o: Record<string, unknown> }) {
  const evidence = (o.evidence as string[] | undefined) ?? []
  const conf = typeof o.confidence === 'number' ? o.confidence : 0
  const tone = conf >= 0.75 ? 'emerald' : conf >= 0.5 ? 'amber' : 'red'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: tokens.fontDisplay }}>{String(o.category ?? '—')}</span>
        <Badge tone={tone}>confidence {conf.toFixed(2)}</Badge>
        {o.uncertain ? <Badge tone="amber">uncertain</Badge> : null}
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.07)', maxWidth: 280 }}>
        <div style={{ width: `${conf * 100}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${tokens.emeraldDark}, ${tokens.emerald})` }} />
      </div>
      {evidence.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {evidence.map((e, i) => <Badge key={i} tone="blue">{e}</Badge>)}
        </div>
      )}
    </div>
  )
}

function SeverityView({ o }: { o: Record<string, unknown> }) {
  const sev = String(o.severity ?? '—')
  const tone = sev === 'Critical' ? 'red' : sev === 'High' ? 'amber' : sev === 'Medium' ? 'blue' : 'emerald'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: tokens.fontDisplay }}>{sev}</span>
        <Badge tone={tone}>{String(o.priority ?? '')}</Badge>
      </div>
      <span style={{ fontSize: 13, color: tokens.textSecondary, lineHeight: 1.5 }}>{String(o.reason ?? '')}</span>
    </div>
  )
}

function RouterView({ o }: { o: Record<string, unknown> }) {
  const route = String(o.route ?? '—')
  const tone = route === 'priority_path' ? 'red' : route === 'manual_review' ? 'amber' : 'emerald'
  const label = route === 'priority_path' ? 'Priority path — accelerated review' :
    route === 'manual_review' ? 'Manual review — no auto resolution' : 'Standard RAG path'
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Badge tone={tone}>{route}</Badge><span style={{ fontSize: 13, color: tokens.textSecondary }}>{label}</span></div>
}

function RetrievalView({ o }: { o: Record<string, unknown> }) {
  const chunks = (o.chunks as { doc_id: string; topic: string; similarity: number }[] | undefined) ?? []
  if (chunks.length === 0) return <span style={{ fontSize: 13, color: tokens.textMuted }}>No chunks retrieved.</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {chunks.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
          <Badge tone="emerald">{c.doc_id}</Badge>
          <span style={{ fontSize: 12.5, flex: 1, color: tokens.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.topic}</span>
          <span style={{ fontSize: 11.5, color: tokens.textMuted, fontVariantNumeric: 'tabular-nums' }}>sim {c.similarity?.toFixed?.(3) ?? c.similarity}</span>
        </div>
      ))}
    </div>
  )
}

function ResolutionView({ o }: { o: Record<string, unknown> }) {
  const steps = (o.diagnostic_steps as string[] | undefined) ?? []
  const escalation = (o.escalation_conditions as string[] | undefined) ?? []
  const observations = (o.expected_observations as string[] | undefined) ?? []
  const sources = (o.sources as string[] | undefined) ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted, marginBottom: 4 }}>Suspected issue</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{String(o.suspected_issue ?? '—')}</div>
      </div>
      {steps.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted, marginBottom: 5 }}>Diagnostic steps</div>
          <List items={steps} />
        </div>
      )}
      {observations.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted, marginBottom: 5 }}>Expected observations</div>
          <List items={observations} color={tokens.blue} />
        </div>
      )}
      {escalation.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.textMuted, marginBottom: 5 }}>Escalate if</div>
          <List items={escalation} color={tokens.amber} />
        </div>
      )}
      {sources.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>grounded in</span>
          {sources.map((s) => <Badge key={s} tone="emerald">{s}</Badge>)}
        </div>
      )}
    </div>
  )
}

function ApprovalView({ o }: { o: Record<string, unknown> }) {
  const decision = String(o.decision ?? '—')
  const tone = decision === 'Approved' ? 'emerald' : decision === 'Revision Requested' ? 'amber' : 'red'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Badge tone={tone}>{decision}</Badge>
        {o.reviewer ? <span style={{ fontSize: 12, color: tokens.textMuted }}>by {String(o.reviewer)}</span> : null}
      </div>
      {o.reason ? <span style={{ fontSize: 13, color: tokens.textSecondary }}>{String(o.reason)}</span> : null}
    </div>
  )
}

export function StageOutput({ event }: { event: StageEvent }) {
  if (event.status === 'error') {
    const msg = typeof event.output === 'object' && event.output !== null
      ? JSON.stringify(event.output)
      : String(event.output ?? 'stage failed')
    return <span style={{ fontSize: 13, color: tokens.red, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>{msg}</span>
  }
  const o = (typeof event.output === 'object' && event.output !== null ? event.output : {}) as Record<string, unknown>
  switch (event.stage) {
    case 'summarize': return <SummaryView o={o} />
    case 'classify': return <ClassificationView o={o} />
    case 'severity': return <SeverityView o={o} />
    case 'route': return <RouterView o={o} />
    case 'retrieve': return <RetrievalView o={o} />
    case 'resolve': return <ResolutionView o={o} />
    case 'approval': return <ApprovalView o={o} />
    default: return <Fallback output={event.output} />
  }
}
