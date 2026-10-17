'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import type { SessionMeta } from '@/types'
import { redeemAccessCode } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { buildSessionIcs, downloadIcs, icsFilename } from '@/lib/ics'
import { formatUtcInstant } from '@/lib/sessionFacts'
import { placeOf } from '@/lib/place'
import { RACE_LIST_HREF } from '@/lib/routes'
import { fetchLiveServerStatus } from '@/lib/liveStatus'
import { REDEEM_ERROR } from '@/components/access/ProWall'
import { NotifyButton } from '@/components/notify/NotifyButton'
import { buttonClass, ui } from '@/components/ui'
import { AnalysisSkeleton } from './AnalysisSkeleton'
import k from './skeleton.module.css'

/**
 * Pages with no analysis (Block 27): the same header and grid as the loader,
 * the grid as a 40 % ghost, one status panel in the top-left cell. No rule, no
 * clock, no pulse; the panel enters with the 200 ms fade and 6 px rise.
 */
export type BlockedKind = 'unpublished' | 'pro' | 'cancelled' | 'rate' | 'notfound' | 'failed'

type Props = {
  kind: BlockedKind
  sessionKey: number
  meta: SessionMeta | null
  /** unpublished: the guard's unlock instant (details.unlock_at_utc or meta.earliest_at). */
  earliestAt?: string | null
  /** rate: details.retry_after_seconds. */
  retryAfterSeconds?: number
  /** failed: the backend's own message. */
  message?: string
  onRetry?: () => void
  onUnlocked?: () => void
}

const MARK: Record<BlockedKind, string> = {
  unpublished: 'var(--pw-amber)',
  pro: 'var(--pw-accent)',
  cancelled: 'var(--pw-muted)',
  rate: 'var(--pw-amber)',
  notfound: 'var(--pw-muted)',
  failed: 'var(--pw-accent)',
}

const back = <Link href={RACE_LIST_HREF} className={buttonClass('default', true)}>Back to race list</Link>
const backPrimary = <Link href={RACE_LIST_HREF} className={buttonClass('primary', true)}>Back to race list</Link>

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={k.info}>
      <span className={ui.label}>{label}</span>
      <span className={k.infoValue}>{value}</span>
    </div>
  )
}

/** Retry-After as text, once a second; Retry stays disabled (45 %) until 0, then enables with no animation. */
function useCountdown(seconds: number | undefined) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(seconds ?? 0)))
  useEffect(() => {
    setLeft(Math.max(0, Math.ceil(seconds ?? 0)))
    if (!seconds || seconds <= 0) return
    const id = setInterval(() => setLeft((n) => { if (n <= 1) { clearInterval(id); return 0 } return n - 1 }), 1000)
    return () => clearInterval(id)
  }, [seconds])
  return left
}

function CodeForm({ onUnlocked }: { onUnlocked?: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await redeemAccessCode(trimmed)
      onUnlocked?.()
    } catch (err) {
      setError(REDEEM_ERROR[err instanceof ApiError ? err.code : ''] ?? 'Could not check that code. Try again.')
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <label htmlFor="blocked-code" className={ui.label}>Access code</label>
      <input
        id="blocked-code"
        className={ui.input}
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(null) }}
        placeholder="XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error !== null}
        aria-describedby="blocked-code-error"
      />
      {/* A wrong code is one line under the field — no shake. */}
      <p id="blocked-code-error" className={error ? k.codeError : ui.srOnly} role="status" aria-live="polite">{error ?? ''}</p>
      <div className={k.actions}>
        <button type="submit" className={buttonClass('primary', true)} disabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Unlock'}</button>
        {back}
      </div>
    </form>
  )
}

export function BlockedPage({ kind, sessionKey, meta, earliestAt, retryAfterSeconds, message, onRetry, onUnlocked }: Props) {
  const left = useCountdown(kind === 'rate' ? retryAfterSeconds ?? 60 : undefined)
  const [liveHere, setLiveHere] = useState(false)
  useEffect(() => {
    if (kind !== 'unpublished') return
    fetchLiveServerStatus().then((st) => setLiveHere(st.reachable && st.sessionKey === sessionKey)).catch(() => undefined)
  }, [kind, sessionKey])

  const session = meta?.session_name ?? 'session'
  const isRace = !meta?.session_type || meta.session_type === 'Race'
  const earliest = earliestAt ?? meta?.earliest_at ?? null

  let head = ''
  let title = ''
  let body: ReactNode = null
  let extra: ReactNode = null
  let actions: ReactNode = null

  switch (kind) {
    case 'unpublished': {
      head = 'Not published yet'
      title = isRace ? 'Analysis available after the race' : `Analysis available after ${session}`
      body = 'The analysis is published once the session results are final — normally within a few hours of the chequered flag.'
      const when = formatUtcInstant(earliest)
      extra = when ? <Info label="Earliest possible" value={when} /> : null
      const gp = meta ? placeOf(meta) : `Session ${sessionKey}`
      actions = (
        <>
          {earliest && (
            <button
              type="button"
              className={buttonClass('primary', true)}
              onClick={() => {
                const end = new Date(new Date(earliest).getTime() + 30 * 60_000).toISOString()
                const summary = `Pit Wall — ${gp} ${session} analysis (earliest)`
                downloadIcs(icsFilename(summary), buildSessionIcs({
                  uid: `pitwall-analysis-${sessionKey}@pitwallengineer.com`,
                  summary,
                  description: `Earliest possible time for the analysis. It is normally published within a few hours of the chequered flag.${meta?.date_start ? ` Session start: ${formatUtcInstant(meta.date_start)}.` : ''}`,
                  location: meta?.location ?? undefined,
                  dateStart: earliest,
                  dateEnd: end,
                }))
              }}
            >
              Add to calendar · earliest
            </button>
          )}
          {liveHere && <Link href={`/live/${sessionKey}`} className={buttonClass('ink')}>It is live now — open the pit wall</Link>}
          <NotifyButton
            label="Notify me when it is ready"
            watch={{ kind: 'analysis', id: `analysis-${sessionKey}`, label: `${gp} · ${session}`, sessionKey, readyAt: earliest }}
            className={buttonClass('ink')}
          />
          {back}
        </>
      )
      break
    }
    case 'pro':
      head = 'PRO required'
      title = 'This analysis is part of PRO'
      body = 'Enter your access code to open it.'
      extra = <CodeForm onUnlocked={onUnlocked} />
      break
    case 'cancelled':
      head = 'Session cancelled'
      title = 'This session did not take place'
      body = 'There is no analysis for a cancelled session.'
      actions = backPrimary
      break
    case 'rate':
      head = 'Rate limited'
      title = 'Too many requests'
      body = 'The server asked for a pause. Retry unlocks when the countdown ends.'
      extra = <Info label="Retry in" value={<span aria-live="polite">{left} s</span>} />
      actions = (
        <>
          <button type="button" className={buttonClass('primary', true)} disabled={left > 0} style={left > 0 ? { opacity: 0.45 } : undefined} onClick={onRetry}>Retry</button>
          {back}
        </>
      )
      break
    case 'notfound':
      head = '404 · Not found'
      title = 'No race at this address'
      body = 'The race may have been renamed or removed.'
      actions = backPrimary
      break
    case 'failed':
      head = 'Analysis did not load'
      title = 'Something went wrong'
      body = message ?? 'The analysis could not be computed.'
      actions = (
        <>
          {onRetry && <button type="button" className={buttonClass('primary', true)} onClick={onRetry}>Retry</button>}
          {back}
        </>
      )
      break
  }

  const panel = (
    <section className={k.panel} aria-labelledby="blocked-title" data-blocked={kind}>
      <div className={k.panelHead}>
        <span className={k.mark} style={{ background: MARK[kind] }} aria-hidden="true" />
        {head}
      </div>
      <h2 id="blocked-title" className={k.panelTitle}>{title}</h2>
      <p className={k.panelBody}>{body}</p>
      {extra}
      {actions && <div className={k.actions}>{actions}</div>}
    </section>
  )

  return <AnalysisSkeleton sessionKey={sessionKey} meta={meta} mode="ghost" panel={panel} />
}
