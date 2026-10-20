'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SessionMeta } from '@/types'
import { loadStartedAt, ruleTargetAt, useLoadPhase } from '@/lib/loadPhase'
import { useSessionMeta } from '@/lib/sessionMeta'
import { useReducedMotion } from '@/lib/motion'
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
  /** State 4 decided by the page (the request was aborted at 45 s): show the error now. */
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
 *                   goes), a time rule that never completes, the real elapsed
 *                   clock, and the method panel's static copy
 *   3. 8 – 45 s     "Waking up the analysis server": grid dims, yellow dot, no ETA
 *   4. 45 s         the page aborts; the fact, Retry and Back to race list
 */
export function AnalysisLoadingScreen({ sessionKey, startedAt: givenStart, meta: given, failed = false, onRetry, leaving = false }: Props) {
  const [fallbackStart] = useState(() => Date.now())
  const startedAt = givenStart ?? (sessionKey != null ? loadStartedAt(sessionKey) : fallbackStart)
  const { phase, elapsedMs } = useLoadPhase(startedAt, 250)
  const fetched = useSessionMeta(given === undefined && sessionKey != null ? sessionKey : null)
  const meta = given !== undefined ? given : fetched.meta
  const reduced = useReducedMotion()

  if (phase === 'hidden' && !failed && !leaving) return <div className={s.reserve} aria-busy="true" />

  const state = failed || phase === 'timeout' ? 'error' : phase === 'waking' ? 'waking' : 'loading'
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
        <span className={`${k.dot} ${state === 'waking' ? k.dotWaking : ''} ${state !== 'error' ? k.dotLive : ''}`} aria-hidden="true" />
        {state === 'loading' ? 'Loading analysis' : state === 'waking' ? 'Waking up the analysis server' : 'Analysis did not load'}
      </div>
      {state !== 'error' && (
        <div className={k.clockRow}>
          <span className={k.clock} aria-label={`Elapsed ${secs} seconds`}>{clock}</span>
          <span className={k.modTitle} style={{ margin: 0 }}>Elapsed</span>
        </div>
      )}
      <p className={k.statusBody}>
        {state === 'loading' && 'Requesting the full race analysis.'}
        {state === 'waking' && (
          <>
            <span className={k.long}>The first request after a period of inactivity can take up to about 30 seconds. Nothing is wrong. The page opens by itself when the server answers.</span>
            <span className={k.short}>The first request after idle can take up to about 30 seconds. The page opens by itself.</span>
          </>
        )}
        {state === 'error' && 'The server did not answer within 45 seconds.'}
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
        mode={leaving ? 'leaving' : state}
        status={status}
        rule={leaving ? 1 : ruleTargetAt(state === 'error' ? 45_000 : elapsedMs, reduced)}
      />
    </div>
  )
}
