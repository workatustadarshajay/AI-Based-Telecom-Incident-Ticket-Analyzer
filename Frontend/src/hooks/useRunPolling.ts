import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type RunTrace } from '../api'

const TERMINAL = ['approved', 'rejected', 'completed', 'failed', 'manual_review']

/**
 * Polls a run trace every 1.2s until it reaches a terminal state.
 * The backend syncs graph state into Postgres every ~1.2s while the workflow
 * executes, so this surfaces stage-by-stage progress live.
 */
export function useRunPolling(runId: string | null) {
  const [trace, setTrace] = useState<RunTrace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => {
    stop()
    setTrace(null)
    setError(null)
    if (!runId) return

    let cancelled = false
    const tick = async () => {
      try {
        const t = await api.getRun(runId)
        if (cancelled) return
        setTrace(t)
        setError(null)
        if (TERMINAL.includes(t.status)) stop()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Polling failed')
      }
    }
    tick()
    timer.current = setInterval(tick, 1200)

    return () => {
      cancelled = true
      stop()
    }
  }, [runId, stop])

  return { trace, error }
}
