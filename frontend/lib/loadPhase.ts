'use client'

import { useEffect, useState } from 'react'

/**
 * How long an /analysis request has been in flight decides what the reader
 * sees. /analysis is ONE request with no progress events: the backend answers
 * with the whole analysis or not at all. Everything the loader shows is a
 * function of elapsed time, and says nothing it cannot know.
 *
 *   hidden    0 – 300 ms    nothing: a cache hit answers in ~150 ms, and a
 *                           loader that flashes for a frame reads as a glitch
 *   loading   300 ms – 8 s  the loader
 *   waking    8 – 45 s      the free-tier server is probably asleep: say so
 *   timeout   45 s          give up (the request is aborted) and offer a retry
 */
export const SHOW_AFTER_MS = 300
export const WAKING_AFTER_MS = 8_000
export const TIMEOUT_AFTER_MS = 45_000

export type LoadPhase = 'hidden' | 'loading' | 'waking' | 'timeout'

export function phaseAt(elapsedMs: number): LoadPhase {
  if (elapsedMs < SHOW_AFTER_MS) return 'hidden'
  if (elapsedMs < WAKING_AFTER_MS) return 'loading'
  if (elapsedMs < TIMEOUT_AFTER_MS) return 'waking'
  return 'timeout'
}

/**
 * Time-based progress for a request that reports none: rises quickly, then
 * slows, and never reaches 1 — 0.94 at t → ∞ — so a bar never claims the
 * analysis is done before it has actually arrived.
 */
export function progressAt(elapsedMs: number): number {
  return 0.94 * (1 - Math.exp(-elapsedMs / 10_000))
}

/**
 * Where the time rule under the header points for the second now running
 * (Block 27). The rule is a transform (scaleX) with a 1 s linear transition,
 * retargeted once a second to the NEXT second's value, so it creeps without
 * stopping and never completes. Reduced motion: 2 s steps, no transition, so
 * the target is the value at the start of the current 2 s step.
 */
export function ruleTargetAt(elapsedMs: number, reduced = false): number {
  if (reduced) return progressAt(Math.floor(elapsedMs / 2000) * 2000)
  return progressAt((Math.floor(elapsedMs / 1000) + 1) * 1000)
}

/** Once the loader is on screen it stays at least this long: an answer at 350 ms must not flash it. */
export const MIN_VISIBLE_MS = 300
/** The arrival crossfade: 12 modules × 20 ms stagger + 160 ms, rounded up. */
export const ARRIVAL_MS = 400

/**
 * Re-renders at each phase boundary (timers, so fake timers can drive it) and,
 * when `tickMs` is set, on a steady tick for an elapsed-time readout.
 */
export function useLoadPhase(startedAt: number, tickMs = 0): { phase: LoadPhase; elapsedMs: number } {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const elapsed = Date.now() - startedAt
    for (const edge of [SHOW_AFTER_MS, WAKING_AFTER_MS, TIMEOUT_AFTER_MS]) {
      if (edge > elapsed) timers.push(setTimeout(() => setNow(Date.now()), edge - elapsed))
    }
    const tick = tickMs ? setInterval(() => setNow(Date.now()), tickMs) : null
    setNow(Date.now())
    return () => {
      timers.forEach(clearTimeout)
      if (tick) clearInterval(tick)
    }
  }, [startedAt, tickMs])
  const elapsedMs = Math.max(0, now - startedAt)
  return { phase: phaseAt(elapsedMs), elapsedMs }
}

// ── one clock per session load ───────────────────────────────────────────────
// The route's loading.tsx (while Next fetches the page) and the page's own
// loader (while /analysis is in flight) are two components; the reader sees
// one wait. Both read the same start time, so the 300 ms grace, the 8 s
// "waking" and the elapsed clock do not restart when the page mounts.

const starts = new Map<number, number>()
const STALE_MS = TIMEOUT_AFTER_MS + 5_000

export function loadStartedAt(sessionKey: number): number {
  const t = starts.get(sessionKey)
  const now = Date.now()
  if (t != null && now - t < STALE_MS) return t
  starts.set(sessionKey, now)
  return now
}

/** A finished, failed or retried load: the next wait starts from zero. */
export function resetLoadClock(sessionKey: number) {
  starts.delete(sessionKey)
}
