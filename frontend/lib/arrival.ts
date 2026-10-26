'use client'

import { useEffect, useRef, useState } from 'react'
import { ARRIVAL_MS, MIN_VISIBLE_MS, SHOW_AFTER_MS } from '@/lib/loadPhase'

/**
 * From loader to page (Block 27).
 *
 *   loading   the analysis is not in yet
 *   hold      it is in, but the loader appeared less than MIN_VISIBLE_MS ago:
 *             keep it up for the rest, so a 350 ms answer does not flash it
 *   arriving  the page is rendered with the skeleton fading out under it
 *             (ARRIVAL_MS, the staggered crossfade)
 *   done      the page alone
 *
 * An answer before SHOW_AFTER_MS never showed a loader, so it goes straight to
 * done: nothing to cross-fade from, and the route's own entry transition is
 * the only motion — the two never run together.
 */
export type ArrivalStage = 'loading' | 'hold' | 'arriving' | 'done'

export function arrivalPlan(startedAt: number, readyAt: number): { animate: boolean; holdMs: number } {
  const elapsed = readyAt - startedAt
  if (elapsed < SHOW_AFTER_MS) return { animate: false, holdMs: 0 }
  const shownFor = elapsed - SHOW_AFTER_MS
  return { animate: true, holdMs: Math.max(0, MIN_VISIBLE_MS - shownFor) }
}

export function useArrival(startedAt: number, ready: boolean): ArrivalStage {
  const [stage, setStage] = useState<ArrivalStage>(() => (ready ? 'done' : 'loading'))
  const startRef = useRef(startedAt)
  startRef.current = startedAt

  useEffect(() => {
    if (!ready) { setStage('loading'); return }
    if (stage === 'done' || stage === 'arriving') return
    const plan = arrivalPlan(startRef.current, Date.now())
    if (!plan.animate) { setStage('done'); return }
    const timers: ReturnType<typeof setTimeout>[] = []
    const arrive = () => {
      setStage('arriving')
      timers.push(setTimeout(() => setStage('done'), ARRIVAL_MS))
    }
    if (plan.holdMs > 0) {
      setStage('hold')
      timers.push(setTimeout(arrive, plan.holdMs))
    } else arrive()
    return () => timers.forEach(clearTimeout)
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  return stage
}
