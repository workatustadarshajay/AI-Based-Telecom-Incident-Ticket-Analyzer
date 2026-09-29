import { useCallback, useEffect, useState } from 'react'
import { api, type RunSummary, type RunTrace, type StageEvent } from '../../api'
import { StageOutput } from '../../components/StageOutput'
import {
  Badge, Card, EmptyState, ErrorText, SectionTitle, Spinner, StageTimeline, StatusPill, tokens,
} from '../../components/ui'

const FILTERS = ['all', 'running', 'awaiting_approval', 'approved', 'rejected', 'failed'] as const

export default function TicketTrace() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [trace, setTrace] = useState<RunTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRuns = useCallback(() => {
    api.listRuns(100)
      .then(setRuns)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load runs'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadRuns()
    const t = setInterval(loadRuns, 5000)
    return () => clearInterval(t)
  }, [loadRuns])

  const loadTrace = useCallback((runId: string) => {
    setSelected(runId)
    setTrace(null)
    api.getRun(runId)
      .then(setTrace)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load trace'))
  }, [])

  const filtered = filter === 'all' ? runs : runs.filter((r) => r.status === filter)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: 24, alignItems: 'start' }}>
      {/* -------- run list -------- */}
      <aside style={{ position: 'sticky', top: 84 }}>
        <SectionTitle right={<Badge tone="neutral">{runs.length}</Badge>}>Runs</SectionTitle>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 11.5, padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                fontFamily: tokens.font,
                background: filter === f ? tokens.emeraldBg : 'transparent',
                color: filter === f ? tokens.emerald : tokens.textMuted,
                border: `1px solid ${filter === f ? tokens.emeraldBorder : tokens.border}`,
              }}
            >
              {f.replaceAll('_', ' ')}
            </button>
          ))}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        {loading && runs.length === 0 && <Spinner />}
        {!loading && filtered.length === 0 && !error && (
          <EmptyState icon="🗂" title="No runs here" hint="Runs appear as soon as you submit tickets. Filter chips narrow by status." />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
          {filtered.map((r) => (
            <button
              key={r.run_id}
              onClick={() => loadTrace(r.run_id)}
              style={{
                textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${selected === r.run_id ? tokens.emeraldBorder : tokens.border}`,
                background: selected === r.run_id ? 'rgba(16,185,129,0.07)' : tokens.surface,
                color: tokens.text, fontFamily: tokens.font, width: '100%',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.ticket_id}</span>
                <StatusPill status={r.status} />
              </div>
              <div style={{ fontSize: 11.5, color: tokens.textMuted, marginTop: 4 }}>
                {r.category ?? '—'} · {r.severity ?? '—'} · {new Date(r.created_at).toLocaleTimeString()}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* -------- trace detail -------- */}
      <section>
        {!selected && (
          <EmptyState icon="🔍" title="Select a run" hint="Pick any run from the list to inspect every agent stage — inputs, structured outputs, timings and citations." />
        )}
        {selected && !trace && <Spinner />}
        {trace && (
          <>
            <Card style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: tokens.fontDisplay, fontWeight: 600, fontSize: 16 }}>
                    {trace.ticket_id}
                  </div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 3 }}>
                    run <code style={{ color: tokens.emerald }}>{trace.run_id}</code>
                    {trace.route && <> · route <strong style={{ color: tokens.textSecondary }}>{trace.route}</strong></>}
                  </div>
                </div>
                <StatusPill status={trace.status} />
              </div>
              {(trace.final_state as Record<string, any>)?.ticket?.description && (
                <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.55, color: tokens.textSecondary }}>
                  “{(trace.final_state as Record<string, any>).ticket.description}”
                </p>
              )}
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <StageTimeline stages={trace.stages} status={trace.status} />
            </div>

            {trace.stages.map((s: StageEvent, i) => (
              <StageCard key={i} event={s} defaultOpen={s.stage === 'resolve' && s.status === 'ok'} />
            ))}
          </>
        )}
      </section>
    </div>
  )
}

function StageCard({ event, defaultOpen = false }: { event: StageEvent; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 10,
      borderColor: event.status === 'error' ? tokens.redBorder : tokens.border }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', color: tokens.text, textAlign: 'left', fontFamily: tokens.font,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0,
          background: event.status === 'error' ? tokens.red : tokens.emerald }} />
        <strong style={{ fontSize: 13.5, flex: 1 }}>{event.stage}</strong>
        {event.duration_ms > 0 && (
          <span style={{ fontSize: 11.5, color: tokens.textMuted }}>{(event.duration_ms / 1000).toFixed(1)}s</span>
        )}
        <span style={{ fontSize: 11.5, color: tokens.textMuted }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <StageOutput event={event} />
        </div>
      )}
    </Card>
  )
}
