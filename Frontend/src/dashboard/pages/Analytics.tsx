import { useEffect, useState } from 'react'
import {
  api, type ApprovalMetrics, type DatasetProfile, type MetricsResult,
  type RagMetrics, type PerClassMetric,
} from '../../api'
import {
  Badge, Card, EmptyState, SectionTitle, Spinner, Stat, tokens,
} from '../../components/ui'

export default function Analytics() {
  const [profile, setProfile] = useState<DatasetProfile | null>(null)
  const [cls, setCls] = useState<MetricsResult | null>(null)
  const [sev, setSev] = useState<MetricsResult | null>(null)
  const [rag, setRag] = useState<RagMetrics | null>(null)
  const [apr, setApr] = useState<ApprovalMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = () => {
      api.datasetProfile().then(setProfile).catch((e) => setError(e.message))
      api.classificationMetrics().then(setCls).catch(() => setCls({ available: false }))
      api.severityMetrics().then(setSev).catch(() => setSev({ available: false }))
      api.ragMetrics().then(setRag).catch(() => setRag({ available: false }))
      api.approvalMetrics().then(setApr).catch(() => setApr({ available: false }))
    }
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  if (error) {
    return <EmptyState icon="⚠" title="Analytics unavailable" hint={error} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <SectionTitle right={<Badge tone="neutral">auto-refresh 15s</Badge>}>Dataset profile · report 6.1</SectionTitle>
        {!profile ? (
          <Card><Spinner /> <span style={{ marginLeft: 10, fontSize: 13, color: tokens.textSecondary }}>loading…</span></Card>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <Stat label="Total tickets" value={profile.total_tickets} />
              <Stat label="Dev split" value={profile.dev_tickets} />
              <Stat label="Held-out test" value={profile.test_tickets} />
              <Stat label="Categories" value={profile.categories} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 14 }}>
              <Card><BarChart title="Category distribution" data={profile.category_distribution} color={tokens.emerald} /></Card>
              <Card><BarChart title="Severity distribution" data={profile.severity_distribution} color={tokens.blue} /></Card>
            </div>
          </>
        )}
      </section>

      <MetricsSection
        title="Classification · report 6.2"
        data={cls}
        emptyHint="Run uv run python -m app.evaluation.run_evaluation (needs GEMINI_API_KEY) to populate."
      />
      <MetricsSection
        title="Severity detection · report 6.3"
        data={sev}
        emptyHint="Populated by the same evaluation run over the held-out test split."
      />

      <section>
        <SectionTitle>RAG retrieval · report 6.4</SectionTitle>
        {rag?.available ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat label="Queries" value={rag.queries_evaluated ?? 0} />
            <Stat label="Top-1 rate" value={(rag.top1_rate ?? 0).toFixed(2)} />
            <Stat label="Top-3 rate" value={(rag.top3_rate ?? 0).toFixed(2)} />
            <Stat label="Top-5 rate" value={(rag.top5_rate ?? 0).toFixed(2)} />
            <Stat label="No relevant hit" value={rag.no_relevant_retrieval ?? 0} />
          </div>
        ) : (
          <EmptyState icon="📄" title="No retrieval events yet" hint="Stats appear automatically as workflow runs log their RAG retrieval stage." />
        )}
      </section>

      <section>
        <SectionTitle>Human approval outcomes · report 6.6</SectionTitle>
        {apr?.available ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card><BarChart title="Outcomes" data={mapOutcomes(apr)} color={tokens.amber} /></Card>
            <Card><BarChart title="Rejection / revision reasons" data={mapReasons(apr)} color={tokens.red} /></Card>
          </div>
        ) : (
          <EmptyState icon="🧑‍⚖️" title="No reviews recorded yet" hint="Approval stats appear after decisions are made in the Approvals tab." />
        )}
      </section>
    </div>
  )
}

function MetricsSection({ title, data, emptyHint }: { title: string; data: MetricsResult | null; emptyHint: string }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {data?.available && data.labels && data.confusion_matrix ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Stat label="Accuracy" value={(data.accuracy ?? 0).toFixed(3)} />
            <Stat label="Evaluated" value={data.n ?? 0} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card><ConfusionMatrix labels={data.labels} matrix={data.confusion_matrix} /></Card>
            <Card><PerClassBars perClass={data.per_class ?? []} /></Card>
          </div>
        </div>
      ) : (
        <EmptyState icon="📊" title="Awaiting evaluation run" hint={data?.message ?? emptyHint} />
      )}
    </section>
  )
}

function mapOutcomes(a: ApprovalMetrics): Record<string, number> {
  const out: Record<string, number> = {}
  Object.entries(a.outcomes ?? {}).forEach(([k, v]) => { out[k] = v.count })
  return out
}

function mapReasons(a: ApprovalMetrics): Record<string, number> {
  const out: Record<string, number> = {}
  ;(a.rejection_reasons ?? []).forEach((r) => { out[r.reason] = r.count })
  return out
}

function BarChart({ title, data, color }: { title: string; data: Record<string, number>; color: string }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return <span style={{ fontSize: 12.5, color: tokens.textMuted }}>No data yet.</span>
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div>
      <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 36px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: tokens.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>{k}</span>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ width: `${(v / max) * 100}%`, height: '100%', borderRadius: 999, background: color, transition: 'width .3s ease' }} />
            </div>
            <span style={{ fontSize: 11.5, color: tokens.textMuted, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  if (labels.length === 0 || matrix.length === 0) return null
  const max = Math.max(1, ...matrix.flat())
  return (
    <div>
      <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginBottom: 10 }}>
        Confusion matrix <span style={{ color: tokens.textMuted }}>(rows = reference, cols = predicted)</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr>
              <th style={{ padding: '4px 8px' }} />
              {labels.map((l) => (
                <th key={l} style={{ padding: '4px 9px', color: tokens.textMuted, fontWeight: 500 }}>{shortLabel(l)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <th style={{ padding: '4px 8px', color: tokens.textMuted, fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>{shortLabel(labels[i])}</th>
                {row.map((v, j) => (
                  <td key={j} style={{
                    padding: '5px 10px', textAlign: 'center', borderRadius: 4,
                    background: i === j
                      ? `rgba(16,185,129,${0.10 + 0.55 * (v / max)})`
                      : `rgba(248,113,113,${0.06 + 0.45 * (v / max)})`,
                    color: v / max > 0.55 ? '#04120c' : tokens.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function shortLabel(l: string): string {
  return l.length > 13 ? l.slice(0, 12) + '…' : l
}

function PerClassBars({ perClass }: { perClass: PerClassMetric[] }) {
  if (perClass.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 12.5, color: tokens.textSecondary, marginBottom: 10 }}>
        Per-class metrics
        <span style={{ color: tokens.textMuted }}> — <span style={{ color: tokens.emerald }}>P</span>recision · <span style={{ color: tokens.blue }}>R</span>ecall · <span style={{ color: tokens.amber }}>F1</span></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {perClass.map((m) => (
          <div key={m.label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 128px', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: tokens.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.label}>{m.label}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <MiniBar value={m.precision} color={tokens.emerald} />
              <MiniBar value={m.recall} color={tokens.blue} />
              <MiniBar value={m.f1} color={tokens.amber} />
            </div>
            <span style={{ fontSize: 11, color: tokens.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {m.precision.toFixed(2)} · {m.recall.toFixed(2)} · {m.f1.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ width: `${Math.min(100, value * 100)}%`, height: '100%', borderRadius: 999, background: color, transition: 'width .3s ease' }} />
    </div>
  )
}
