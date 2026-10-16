'use client'

import { useState } from 'react'
import { LOADING_STEPS } from '@/lib/constants'
import { loadStartedAt, progressAt, useLoadPhase } from '@/lib/loadPhase'
import { Panel, ui } from '@/components/ui'
import s from './loading.module.css'

type Props = {
  raceName?: string
  /** Shares the load clock with the route's loading.tsx (lib/loadPhase.ts). */
  sessionKey?: number
  /** @deprecated progress is time-based now; ignored. */
  currentStep?: number
}

const STEP_MS = 1400

/**
 * The wait for /analysis.
 *
 * /analysis is a single request with no progress events — the server answers
 * with the whole analysis or not at all. So nothing here is a progress
 * report:
 *   - the steps are DECORATIVE: the kinds of work the server does, advanced
 *     by elapsed time and capped one short of the last, so the list can never
 *     claim to be finished before the answer is in;
 *   - the bar follows progressAt(), which never reaches the end;
 *   - the clock is the real elapsed time;
 *   - no copy states a number the page cannot know (no "found N laps").
 * Under 300 ms nothing is shown (a cache hit would only flash); after 8 s it
 * says the server is probably waking; at 45 s useRaceAnalysis aborts and the
 * page shows the error with a retry.
 */
export function AnalysisLoadingScreen({ raceName, sessionKey }: Props) {
  const [fallbackStart] = useState(() => Date.now())
  const startedAt = sessionKey != null ? loadStartedAt(sessionKey) : fallbackStart
  const { phase, elapsedMs } = useLoadPhase(startedAt, 250)

  // Reserve the space so the footer does not jump when the loader or the page appears.
  if (phase === 'hidden') return <div className={s.reserve} aria-busy="true" />

  const waking = phase !== 'loading'
  const step = Math.min(Math.floor(elapsedMs / STEP_MS), LOADING_STEPS.length - 2)
  const pct = Math.round(progressAt(elapsedMs) * 100)
  const secs = Math.floor(elapsedMs / 1000)

  return (
    <div className={s.reserve} aria-busy="true">
      <div className={s.wrap}>
        <Panel
          boxed
          title={raceName && raceName !== 'Loading…' ? raceName : 'Race analysis'}
          aside={<span className={s.clock} aria-label={`Elapsed ${secs} seconds`}>{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>}
          foot="Computed on the analysis server from OpenF1 timing data, in one request: the whole report arrives at once."
        >
          <div role="status" aria-live="polite">
            <div className={s.kicker}><span className={ui.square} aria-hidden="true" />{waking ? 'Waking up the analysis server…' : 'Building the race report'}</div>
            {waking && (
              <p className={s.note}>
                The analysis server sleeps when nobody has used it for a while. The first request
                wakes it, which can take about half a minute.
              </p>
            )}
          </div>

          <div className={ui.bar} role="progressbar" aria-label="Time waited" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%`, background: 'var(--pw-accent)' }} />
          </div>

          <ol className={s.steps}>
            {LOADING_STEPS.map((label, i) => (
              <li key={label} className={i === step ? s.on : i < step ? s.past : ''} aria-current={i === step ? 'step' : undefined}>
                <span className={s.mark} aria-hidden="true" />{label}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  )
}
