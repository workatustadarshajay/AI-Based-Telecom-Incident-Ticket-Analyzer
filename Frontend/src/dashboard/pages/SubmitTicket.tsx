import { useState } from 'react'
import { api, type SampleTicket } from '../../api'
import { useRunPolling } from '../../hooks/useRunPolling'
import { StageOutput } from '../../components/StageOutput'
import {
  Button, Card, Checkbox, EmptyState, ErrorText, Label, SectionTitle,
  Select, Spinner, StageTimeline, TextArea, TextInput, StatusPill, tokens,
} from '../../components/ui'

const NETWORK_TYPES = ['5G', '4G', 'VoLTE', 'Fiber', 'Fixed Wireless']
const REGIONS = ['Region-A', 'Region-B', 'Region-C', 'Region-D']
const SERVICES = ['Mobile Data', 'Voice', 'Broadband', 'Enterprise VPN', 'SMS', 'IoT']

export default function SubmitTicket({ onGoApprovals }: { onGoApprovals: () => void }) {
  const [description, setDescription] = useState('')
  const [networkType, setNetworkType] = useState('5G')
  const [region, setRegion] = useState('Region-A')
  const [service, setService] = useState('Mobile Data')
  const [affectedUsers, setAffectedUsers] = useState('0')
  const [autoApprove, setAutoApprove] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)

  const { trace, error: pollError } = useRunPolling(runId)
  const status = trace?.status
  const paused = status === 'awaiting_approval'

  const loadSample = async () => {
    setSubmitError(null)
    try {
      const s: SampleTicket = await api.sampleTicket()
      setDescription(s.ticket.description)
      setNetworkType(s.ticket.network_type)
      setRegion(s.ticket.region)
      setService(s.ticket.service)
      setAffectedUsers(String(s.ticket.affected_users ?? 0))
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to load sample')
    }
  }

  const submit = async () => {
    if (!description.trim()) {
      setSubmitError('Please describe the incident before running the workflow.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setRunId(null)
    try {
      const res = await api.submitTicket({
        description: description.trim(),
        network_type: networkType,
        region,
        service,
        affected_users: Number(affectedUsers) || 0,
        auto_approve: autoApprove,
      })
      setRunId(res.run_id)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const stageEvents = trace?.stages ?? []
  const finishedStages = Object.fromEntries(stageEvents.map((s) => [s.stage, s]))
  const fs = trace?.final_state ?? {}
  const classification = (fs as Record<string, any>).classification
  const severity = (fs as Record<string, any>).severity
  const recommendation = (fs as Record<string, any>).recommendation

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 480px) 1fr', gap: 26, alignItems: 'start' }}>
      {/* ---------------- form ---------------- */}
      <Card style={{ position: 'sticky', top: 84 }}>
        <SectionTitle>Submit an incident ticket</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div>
            <Label required>Incident description</Label>
            <TextArea
              value={description}
              onChange={setDescription}
              rows={5}
              invalid={submitError !== null && !description.trim()}
              placeholder="e.g. Multiple users in Region-A report complete loss of 5G data service after a site alarm…"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Network type</Label>
              <Select value={networkType} onChange={setNetworkType} options={NETWORK_TYPES} />
            </div>
            <div>
              <Label>Region</Label>
              <Select value={region} onChange={setRegion} options={REGIONS} />
            </div>
            <div>
              <Label>Affected service</Label>
              <Select value={service} onChange={setService} options={SERVICES} />
            </div>
            <div>
              <Label>Users affected</Label>
              <TextInput type="number" min={0} value={affectedUsers} onChange={setAffectedUsers} />
            </div>
          </div>
          <Checkbox
            checked={autoApprove}
            onChange={setAutoApprove}
            label={<span>Demo mode — auto-approve, skip the human pause</span>}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={submit} busy={submitting} disabled={submitting}>
              {submitting ? 'Starting…' : 'Run workflow'}
            </Button>
            <Button variant="ghost" onClick={loadSample}>Load random ticket</Button>
          </div>
          {submitError && <ErrorText>{submitError}</ErrorText>}
          {pollError && <ErrorText>{pollError}</ErrorText>}
        </div>
      </Card>

      {/* ---------------- live progress ---------------- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!runId && (
          <EmptyState
            icon="⚡"
            title="No workflow run yet"
            hint="Fill in the ticket on the left (or load a random synthetic one) and press Run workflow. You'll see every agent stage complete here in real time."
          />
        )}

        {runId && (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <SectionTitle>Workflow progress</SectionTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {['running', 'resuming'].includes(status ?? '') && <Spinner size={14} />}
                  <StatusPill status={status ?? 'running'} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 12 }}>
                run <code style={{ color: tokens.emerald }}>{runId}</code> · ticket{' '}
                <code style={{ color: tokens.emerald }}>{trace?.ticket_id ?? '…'}</code>
              </div>
              <StageTimeline stages={stageEvents} status={status ?? 'running'} />
            </Card>

            {paused && (
              <Card accent="amber">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontFamily: tokens.fontDisplay, marginBottom: 3 }}>⏸ Waiting for human review</div>
                    <div style={{ fontSize: 12.5, color: tokens.textSecondary }}>
                      The router paused this run at the approval gate (report Fig. 5).
                    </div>
                  </div>
                  <Button variant="outline" onClick={onGoApprovals}>Review now →</Button>
                </div>
              </Card>
            )}

            {classification && (
              <Card>
                <SectionTitle>Classification</SectionTitle>
                <StageOutput event={{ stage: 'classify', status: 'ok', ts: '', duration_ms: 0, output: classification }} />
              </Card>
            )}
            {severity && (
              <Card>
                <SectionTitle>Severity assessment</SectionTitle>
                <StageOutput event={{ stage: 'severity', status: 'ok', ts: '', duration_ms: 0, output: severity }} />
              </Card>
            )}
            {recommendation && (
              <Card>
                <SectionTitle>Recommended action plan</SectionTitle>
                <StageOutput event={{ stage: 'resolve', status: 'ok', ts: '', duration_ms: 0, output: recommendation }} />
              </Card>
            )}

            {status === 'failed' && (
              <Card accent="red">
                <div style={{ fontWeight: 600, color: tokens.red, marginBottom: 4 }}>Run failed</div>
                <div style={{ fontSize: 13, color: tokens.textSecondary, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
                  {String((fs as Record<string, any>).error ?? 'unknown error')}
                </div>
              </Card>
            )}

            {['approved', 'rejected', 'completed'].includes(status ?? '') && (
              <Card accent="emerald">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>✓</span>
                  <div>
                    <div style={{ fontWeight: 600, fontFamily: tokens.fontDisplay }}>
                      Workflow finished — {status}
                    </div>
                    <div style={{ fontSize: 12.5, color: tokens.textSecondary }}>
                      {finishedStages['approval'] ? 'Human decision recorded.' : 'No approval stage was required.'}{' '}
                      Full trace available in the Ticket Trace tab.
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
