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
 *   waking    8 – 75 s      a long wait: being computed (the OpenF1 rate limit makes a
 *                           cold analysis take up to a minute), or the server asleep
 *   timeout   75 s          give up (the request is aborted) and offer a retry
 */
export const SHOW_AFTER_MS = 300
export const WAKING_AFTER_MS = 8_000
export const TIMEOUT_AFTER_MS = 75_000

export type LoadPhase = 'hidden' | 'loading' | 'waking' | 'timeout'

export function phaseAt(elapsedMs: number): LoadPhase {
  if (elapsedMs < SHOW_AFTER_MS) return 'hidden'
  if (elapsedMs < WAKING_AFTER_MS) return 'loading'
  if (elapsedMs < TIMEOUT_AFTER_MS) return 'waking'
  return 'timeout'
}

/*
 * No progress is drawn: /analysis reports none, so concept A "Settle" (24 Oct)
 * dropped the time rule that crept towards 0.94. What moves is the real clock
 * and the strip's opacity, neither of which claims how far along it is.
 */

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
  const now = Date.now()
  // On the server this module lives as long as the Next process and is shared
  // by every request: a map here gave a new reader the clock of whoever opened
  // the race before (server-rendered "waking, 00:20"), and broke hydration.
  // There, every render starts its own wait.
  if (typeof window === 'undefined') return now
  const t = starts.get(sessionKey)
  if (t != null && now - t < STALE_MS) return t
  starts.set(sessionKey, now)
  return now
}

/** A finished, failed or retried load: the next wait starts from zero. */
export function resetLoadClock(sessionKey: number) {
  starts.delete(sessionKey)
}
