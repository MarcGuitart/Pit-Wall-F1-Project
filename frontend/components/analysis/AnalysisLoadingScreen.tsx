'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SessionMeta } from '@/types'
import { TIMEOUT_AFTER_MS, loadStartedAt, useLoadPhase } from '@/lib/loadPhase'
import { pingApi } from '@/lib/api'
import { useSessionMeta } from '@/lib/sessionMeta'
import { RACE_LIST_HREF } from '@/lib/routes'
import { buttonClass } from '@/components/ui'
import { AnalysisSkeleton } from './loader/AnalysisSkeleton'
import k from './loader/skeleton.module.css'
import s from './loading.module.css'

type Props = {
  /** Shares the load clock with the route's loading.tsx and the shell (lib/loadPhase.ts). */
  sessionKey?: number
  /** The page's own copy of the clock: the shared one is reset once the answer is in, and the
   *  loader must keep its state through the hold and the arrival. */
  startedAt?: number
  /** When the page already holds it; otherwise read from /sessions/{key}/meta. */
  meta?: SessionMeta | null
  /** State 4 decided by the page (the request was aborted at TIMEOUT_AFTER_MS): show the error now. */
  failed?: boolean
  onRetry?: () => void
  /** Arrival: the loader under the arriving page, fading module by module (lib/arrival.ts). */
  leaving?: boolean
  /** @deprecated the header's facts come from /sessions/{key}/meta now. */
  raceName?: string
  /** @deprecated progress is time-based; ignored. */
  currentStep?: number
}

/**
 * The wait for /analysis (Block 27, Loading Experience spec).
 *
 * /analysis is one request with no progress events, so nothing here reports
 * progress. By elapsed time since the click (lib/loadPhase.ts):
 *   1. 0 – 300 ms   nothing: the space is reserved, the shell does not change
 *   2. 0.3 – 8 s    the page's own skeleton (real header facts, bars where data
 *                   goes), the settled sweep strip beside the title (concept A:
 *                   its accent band's opacity is the only motion), the real
 *                   elapsed clock, and the method panel's static copy
 *   3. 8 – 75 s     a long wait. The API is asked whether it answers (GET /health):
 *                   if it does, or until it is known, "This analysis is being
 *                   computed and can take up to a minute" (the OpenF1 rate limit
 *                   is the usual cause, see the 24 Oct sweep); only when it does
 *                   not answer, "Waking up the analysis server". No ETA either way.
 *   4. 75 s         the page aborts; the fact, Retry and Back to race list
 */
/**
 * During a long wait, whether the API has stopped answering: null until known
 * (treated as answering), true after a /health that got nothing back. Asked
 * when the wait begins and every 8 s while it stays silent.
 */
function useApiSilent(active: boolean): boolean {
  const [silent, setSilent] = useState(false)
  useEffect(() => {
    if (!active) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = () => {
      pingApi(4000).then((ok) => {
        if (!live) return
        setSilent(!ok)
        if (!ok) timer = setTimeout(ask, 8000)
      })
    }
    ask()
    return () => { live = false; if (timer) clearTimeout(timer) }
  }, [active])
  return silent
}

export function AnalysisLoadingScreen({ sessionKey, startedAt: givenStart, meta: given, failed = false, onRetry, leaving = false }: Props) {
  const [fallbackStart] = useState(() => Date.now())
  const startedAt = givenStart ?? (sessionKey != null ? loadStartedAt(sessionKey) : fallbackStart)
  const { phase, elapsedMs } = useLoadPhase(startedAt, 250)
  const apiSilent = useApiSilent(phase === 'waking' && !failed)
  const fetched = useSessionMeta(given === undefined && sessionKey != null ? sessionKey : null)
  const meta = given !== undefined ? given : fetched.meta

  if (phase === 'hidden' && !failed && !leaving) return <div className={s.reserve} aria-busy="true" />

  const state = failed || phase === 'timeout' ? 'error' : phase === 'waking' ? (apiSilent ? 'waking' : 'computing') : 'loading'
  const secs = Math.floor(elapsedMs / 1000)
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`

  const status = (
    <div
      key={state}
      className={`${k.status} ${state === 'loading' ? '' : k.statusIn} ${state === 'error' ? k.statusErr : ''}`}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      data-state={state}
    >
      <div className={k.statusHead}>
        <span className={`${k.dot} ${state === 'waking' ? k.dotWaking : ''}`} aria-hidden="true" />
        {state === 'loading' ? 'Loading analysis'
          : state === 'computing' ? 'This analysis is being computed and can take up to a minute'
          : state === 'waking' ? 'Waking up the analysis server' : 'Analysis did not load'}
      </div>
      {state !== 'error' && (
        <div className={k.clockRow}>
          <span className={k.clock} aria-label={`Elapsed ${secs} seconds`}>{clock}</span>
          <span className={k.modTitle} style={{ margin: 0 }}>Elapsed</span>
        </div>
      )}
      <p className={k.statusBody}>
        {state === 'loading' && 'Requesting the full race analysis.'}
        {state === 'computing' && 'The server is up and working on it. The page opens by itself when it is ready.'}
        {state === 'waking' && 'The server is not answering yet. The page opens by itself when it does.'}
        {state === 'error' && `The server did not answer within ${TIMEOUT_AFTER_MS / 1000} seconds.`}
      </p>
      {state === 'error' && (
        <div className={k.actions}>
          {onRetry && <button type="button" className={buttonClass('primary', true)} onClick={onRetry}>Retry</button>}
          <Link href={RACE_LIST_HREF} className={buttonClass('default', true)}>Back to race list</Link>
        </div>
      )}
    </div>
  )

  return (
    <div className={leaving ? k.overlay : k.shellIn} aria-hidden={leaving || undefined}>
      <AnalysisSkeleton
        sessionKey={sessionKey ?? 0}
        meta={meta ?? null}
        mode={leaving ? 'leaving' : state === 'computing' ? 'loading' : state}
        status={status}
      />
    </div>
  )
}
