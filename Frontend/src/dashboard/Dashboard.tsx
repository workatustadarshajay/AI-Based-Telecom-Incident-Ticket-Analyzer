import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Badge, tokens } from '../components/ui'
import SubmitTicket from './pages/SubmitTicket'
import TicketTrace from './pages/TicketTrace'
import Approvals from './pages/Approvals'
import Analytics from './pages/Analytics'

const TABS = [
  { id: 'submit', label: 'Submit Ticket' },
  { id: 'trace', label: 'Ticket Trace' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'analytics', label: 'Analytics' },
] as const

type TabId = (typeof TABS)[number]['id']
const VALID_TABS = TABS.map((t) => t.id)

function tabFromHash(): TabId {
  const h = window.location.hash.replace('#/dashboard/', '').replace('#/dashboard', '')
  return (VALID_TABS as string[]).includes(h) ? (h as TabId) : 'submit'
}

export default function Dashboard() {
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  // keep tab in sync with browser back/forward
  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: TabId) => {
    setTab(t)
    window.location.hash = `#/dashboard/${t}`
  }

  useEffect(() => {
    api.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false))
  }, [])

  const refreshPending = useCallback(() => {
    api.pendingApprovals()
      .then((items) => setPendingCount(items.length))
      .catch(() => setPendingCount(0))
  }, [])

  useEffect(() => {
    refreshPending()
    const t = setInterval(refreshPending, 4000)
    return () => clearInterval(t)
  }, [refreshPending])

  return (
    <div className="min-h-screen" style={{ background: tokens.bg, color: tokens.text, fontFamily: tokens.font }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '13px 28px', borderBottom: `1px solid ${tokens.border}`,
        background: 'rgba(9,9,11,0.86)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={tokens.emerald} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11 1 11.9 1 13v3c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
          </svg>
          <div>
            <div style={{ fontFamily: tokens.fontDisplay, fontWeight: 600, fontSize: 14.5, lineHeight: 1.2 }}>
              Telecom Ticket Analyzer
            </div>
            <div style={{ fontSize: 10.5, color: tokens.textMuted }}>RAG · Multi-Agent · Human-in-the-loop</div>
          </div>
          <Badge tone="emerald">Prototype</Badge>
        </div>

        <nav style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 999, padding: 4, border: `1px solid ${tokens.border}` }}>
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', border: 'none', fontFamily: tokens.font,
                  background: active ? `linear-gradient(135deg, ${tokens.emerald}26, ${tokens.emeraldDark}26)` : 'transparent',
                  color: active ? tokens.emerald : tokens.textSecondary,
                  transition: 'color .12s ease, background .12s ease',
                }}
              >
                {t.label}
                {t.id === 'approvals' && pendingCount > 0 && (
                  <span style={{
                    minWidth: 17, height: 17, borderRadius: 999, padding: '0 5px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: tokens.amber, color: '#3a2b00',
                    fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, minWidth: 110, justifyContent: 'flex-end' }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: backendOk === null ? '#888' : backendOk ? tokens.emerald : tokens.red,
            boxShadow: backendOk ? '0 0 8px rgba(16,185,129,0.6)' : undefined,
          }} />
          <span style={{ color: tokens.textSecondary }}>
            {backendOk === null ? 'checking…' : backendOk ? 'API connected' : 'API offline'}
          </span>
        </div>
      </header>

      <main style={{ padding: '26px 28px 60px', maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'submit' && <SubmitTicket onGoApprovals={() => go('approvals')} />}
        {tab === 'trace' && <TicketTrace />}
        {tab === 'approvals' && <Approvals onResolved={refreshPending} />}
        {tab === 'analytics' && <Analytics />}
      </main>
    </div>
  )
}
