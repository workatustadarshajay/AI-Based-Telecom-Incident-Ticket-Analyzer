import type { CSSProperties, ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */

export const tokens = {
  bg: '#09090b',
  surface: 'rgba(255,255,255,0.03)',
  surfaceHover: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#fafafa',
  textSecondary: 'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.42)',
  emerald: '#10b981',
  emeraldDark: '#047857',
  emeraldBg: 'rgba(16,185,129,0.10)',
  emeraldBorder: 'rgba(16,185,129,0.35)',
  amber: '#fbbf24',
  amberBg: 'rgba(251,191,36,0.10)',
  amberBorder: 'rgba(251,191,36,0.35)',
  red: '#f87171',
  redBg: 'rgba(248,113,113,0.10)',
  redBorder: 'rgba(248,113,113,0.35)',
  blue: '#60a5fa',
  blueBg: 'rgba(96,165,250,0.10)',
  blueBorder: 'rgba(96,165,250,0.35)',
  radius: 12,
  radiusSmall: 8,
  font: "'Inter', sans-serif",
  fontDisplay: "'Plus Jakarta Sans', sans-serif",
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  style,
  onClick,
  interactive = false,
  selected = false,
  accent,
}: {
  children: ReactNode
  style?: CSSProperties
  onClick?: () => void
  interactive?: boolean
  selected?: boolean
  accent?: 'emerald' | 'amber' | 'red' | 'blue' | 'none'
}) {
  const accentColor =
    accent === 'emerald' ? tokens.emeraldBorder :
    accent === 'amber' ? tokens.amberBorder :
    accent === 'red' ? tokens.redBorder :
    accent === 'blue' ? tokens.blueBorder : tokens.border
  return (
    <div
      onClick={onClick}
      style={{
        background: tokens.surface,
        border: `1px solid ${selected ? tokens.emeraldBorder : accentColor}`,
        borderRadius: tokens.radius,
        padding: 18,
        cursor: onClick ? 'pointer' : undefined,
        transition: 'border-color .15s ease, background .15s ease',
        ...(onClick ? { boxShadow: selected ? '0 0 0 1px rgba(16,185,129,0.25)' : undefined } : {}),
        ...style,
      }}
      onMouseEnter={(e) => {
        if (interactive) e.currentTarget.style.background = tokens.surfaceHover
      }}
      onMouseLeave={(e) => {
        if (interactive) e.currentTarget.style.background = tokens.surface
      }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outline'

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  busy = false,
  size = 'md',
  style,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  busy?: boolean
  size?: 'sm' | 'md'
  style?: CSSProperties
  title?: string
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    fontFamily: tokens.font,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent',
    transition: 'opacity .15s ease, transform .05s ease, background .15s ease',
    opacity: disabled ? 0.45 : 1,
    fontSize: size === 'sm' ? 12.5 : 13.5,
    padding: size === 'sm' ? '7px 16px' : '11px 22px',
  }
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: `linear-gradient(135deg, ${tokens.emerald}, ${tokens.emeraldDark})`, color: '#04120c' },
    ghost: { background: 'transparent', color: tokens.textSecondary, borderColor: tokens.borderStrong },
    outline: { background: tokens.emeraldBg, color: tokens.emerald, borderColor: tokens.emeraldBorder },
    danger: { background: tokens.redBg, color: tokens.red, borderColor: tokens.redBorder },
  }
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {busy && <Spinner size={13} color={variant === 'primary' ? '#04120c' : tokens.textSecondary} />}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Input / TextArea / Select / Checkbox / RadioGroup                   */
/* ------------------------------------------------------------------ */

const fieldStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${tokens.border}`,
  borderRadius: 10,
  padding: '11px 14px',
  color: tokens.text,
  fontSize: 14,
  fontFamily: tokens.font,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .15s ease',
}

export function Label({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: tokens.textSecondary, marginBottom: 6, fontFamily: tokens.font }}>
      {children}{required && <span style={{ color: tokens.emerald }}> *</span>}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  invalid = false,
  min,
  style,
}: {
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  invalid?: boolean
  min?: number
  style?: CSSProperties
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => { e.currentTarget.style.borderColor = tokens.emeraldBorder }}
      onBlur={(e) => { e.currentTarget.style.borderColor = invalid ? tokens.redBorder : tokens.border }}
      style={{ ...fieldStyle, ...(invalid ? { borderColor: tokens.redBorder } : {}), ...style }}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 5,
  invalid = false,
  style,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  invalid?: boolean
  style?: CSSProperties
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => { e.currentTarget.style.borderColor = tokens.emeraldBorder }}
      onBlur={(e) => { e.currentTarget.style.borderColor = invalid ? tokens.redBorder : tokens.border }}
      style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.55, ...(invalid ? { borderColor: tokens.redBorder } : {}), ...style }}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  style,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  style?: CSSProperties
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...fieldStyle,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: 38,
        cursor: 'pointer',
        ...style,
      }}
    >
      {options.map((o) => <option key={o} value={o} style={{ background: '#111' }}>{o}</option>)}
    </select>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
}) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: tokens.textSecondary, fontFamily: tokens.font, userSelect: 'none' }}
    >
      <span
        onClick={(e) => { e.preventDefault(); onChange(!checked) }}
        style={{
          width: 17, height: 17, borderRadius: 5, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: checked ? tokens.emerald : 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${checked ? tokens.emerald : tokens.borderStrong}`,
          transition: 'background .12s ease, border-color .12s ease',
        }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#04120c" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      <span onClick={(e) => { e.preventDefault(); onChange(!checked) }}>{label}</span>
    </label>
  )
}

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | null
  onChange: (v: T) => void
  options: { value: T; label: string; color?: string }[]
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = value === o.value
        const color = o.color ?? tokens.emerald
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '8px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 13,
              fontFamily: tokens.font, fontWeight: 500,
              background: active ? `${color}22` : 'transparent',
              color: active ? color : tokens.textSecondary,
              border: `1px solid ${active ? `${color}66` : tokens.borderStrong}`,
              transition: 'all .12s ease',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Badge / StatusPill / Stat / Spinner / EmptyState / ErrorText        */
/* ------------------------------------------------------------------ */

type Tone = 'emerald' | 'amber' | 'red' | 'blue' | 'neutral'

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const map: Record<Tone, { bg: string; fg: string; bd: string }> = {
    emerald: { bg: tokens.emeraldBg, fg: tokens.emerald, bd: tokens.emeraldBorder },
    amber: { bg: tokens.amberBg, fg: tokens.amber, bd: tokens.amberBorder },
    red: { bg: tokens.redBg, fg: tokens.red, bd: tokens.redBorder },
    blue: { bg: tokens.blueBg, fg: tokens.blue, bd: tokens.blueBorder },
    neutral: { bg: 'rgba(255,255,255,0.05)', fg: tokens.textSecondary, bd: tokens.border },
  }
  const c = map[tone]
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '3px 11px', borderRadius: 999,
      background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, fontFamily: tokens.font,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, Tone> = {
    approved: 'emerald', completed: 'emerald', awaiting_approval: 'amber', resuming: 'amber',
    failed: 'red', rejected: 'red', running: 'blue', pending: 'blue',
  }
  return <Badge tone={map[status] ?? 'neutral'}>{status.replaceAll('_', ' ')}</Badge>
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: tokens.textMuted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, fontFamily: tokens.fontDisplay, marginTop: 4 }}>{value}</div>
    </div>
  )
}

export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <span
      className="hf-spinner"
      style={{
        width: size, height: size, display: 'inline-block', flexShrink: 0,
        border: `2px solid ${color ?? tokens.emerald}33`,
        borderTopColor: color ?? tokens.emerald,
        borderRadius: '50%',
        animation: 'hf-spin 0.7s linear infinite',
      }}
    />
  )
}

export function EmptyState({ icon = '◎', title, hint, action }: { icon?: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{
      textAlign: 'center', padding: '44px 20px', border: `1px dashed ${tokens.borderStrong}`,
      borderRadius: tokens.radius, background: 'rgba(255,255,255,0.015)',
    }}>
      <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: tokens.fontDisplay }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: tokens.textMuted, marginTop: 5, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 13, color: tokens.red, background: tokens.redBg,
      border: `1px solid ${tokens.redBorder}`, borderRadius: 10, padding: '10px 14px',
      fontFamily: tokens.font,
    }}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ fontFamily: tokens.fontDisplay, fontSize: 17, fontWeight: 600, margin: 0 }}>{children}</h2>
      {right}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stage timeline (shared by Submit + Trace)                           */
/* ------------------------------------------------------------------ */

export const STAGE_ORDER = ['summarize', 'classify', 'severity', 'route', 'retrieve', 'resolve', 'approval', 'finalize'] as const

export const STAGE_LABELS: Record<string, string> = {
  summarize: 'Summarization',
  classify: 'Classification',
  severity: 'Severity Detection',
  route: 'Router',
  retrieve: 'RAG Retrieval',
  resolve: 'Resolution Suggestion',
  approval: 'Human Approval',
  finalize: 'Finalize',
}

export function StageTimeline({
  stages,
  status,
}: {
  stages: { stage: string; status: string; duration_ms: number; output?: unknown }[]
  status: string
}) {
  const byStage = new Map(stages.map((s) => [s.stage, s]))
  const terminal = !['running', 'resuming'].includes(status)
  const currentIdx = (() => {
    for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
      if (byStage.has(STAGE_ORDER[i])) return i
    }
    return -1
  })()

  return (
    <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
      {STAGE_ORDER.map((stage, i) => {
        const evt = byStage.get(stage)
        const done = Boolean(evt)
        const isErr = evt?.status === 'error'
        const isCurrent = !done && !terminal && i === currentIdx + 1
        const skipped = !done && !isCurrent && terminal
        return (
          <li
            key={stage}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
              borderRadius: 10, fontFamily: tokens.font,
              border: `1px solid ${isErr ? tokens.redBorder : done ? 'rgba(16,185,129,0.14)' : isCurrent ? tokens.emeraldBorder : tokens.border}`,
              background: isErr ? tokens.redBg : done ? 'rgba(16,185,129,0.05)' : isCurrent ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.02)',
              opacity: done || isCurrent ? 1 : 0.55,
            }}
          >
            <StageDot state={isErr ? 'error' : done ? 'done' : isCurrent ? 'active' : 'pending'} />
            <span style={{ fontSize: 13.5, flex: 1, color: done ? tokens.text : tokens.textSecondary }}>{STAGE_LABELS[stage]}</span>
            {isCurrent && <Spinner size={13} />}
            {evt && !isErr && evt.duration_ms > 0 && (
              <span style={{ fontSize: 11.5, color: tokens.textMuted, fontVariantNumeric: 'tabular-nums' }}>{(evt.duration_ms / 1000).toFixed(1)}s</span>
            )}
            {evt?.status === 'error' && <Badge tone="red">error</Badge>}
            {skipped && <Badge tone="neutral">not reached</Badge>}
          </li>
        )
      })}
    </ol>
  )
}

function StageDot({ state }: { state: 'done' | 'active' | 'error' | 'pending' }) {
  if (state === 'active') return <Spinner size={13} />
  return (
    <span style={{
      width: 9, height: 9, borderRadius: 999, flexShrink: 0,
      background: state === 'done' ? tokens.emerald : state === 'error' ? tokens.red : 'rgba(255,255,255,0.16)',
      boxShadow: state === 'done' ? '0 0 8px rgba(16,185,129,0.5)' : undefined,
    }} />
  )
}
