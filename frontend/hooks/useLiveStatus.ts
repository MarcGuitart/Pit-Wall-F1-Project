'use client'

/**
 * Whether a live session is running right now, and if not, when the next one
 * is — for a PRO visitor. Extracted from ProSection (Block 19) so TopBar
 * (Block 22) can show the same real status instead of a second, disconnected
 * "coming soon" that never agreed with it.
 *
 * Checked against the live server itself (lib/liveStatus.ts's
 * fetchLiveServerStatus), never the clock alone — a session can start late,
 * and the live server is the only thing that actually knows whether data is
 * arriving. Only polled while `pro` is true: a non-PRO visitor gets no
 * live-status network calls at all.
 *
 * Capped (24 Oct: the API logs showed dozens of GET /races/1297/sessions from
 * one browser, each mounted copy of this hook polling the calendar every
 * minute):
 *   - one poller per season for the whole tab, however many components mount
 *     the hook (TopBar and ProSection on the landing share it);
 *   - nothing is asked while the tab is hidden; it asks again when shown;
 *   - the calendar (/races?year= and the meetings' /sessions) at most once per
 *     CALENDAR_TTL_MS per browser tab (sessionStorage), or sooner once the next
 *     session it named has started;
 *   - the live server's /health every POLL_MS, but only inside the live window
 *     (lib/liveStatus.ts inLiveWindow: from 30 min before the next session to its
 *     end). Outside it the live server is never asked, so an open tab does not
 *     keep a sleeping free Render service awake (block 51).
 */
import { useEffect, useState } from 'react'
import { LIVE_TAIL_MS, fetchLivePublicState, fetchLiveServerStatus, fetchNextLiveSession, inLiveWindow, scheduledEnd, type NextLiveSessionInfo } from '@/lib/liveStatus'

export const POLL_MS = 60_000
export const CALENDAR_TTL_MS = 6 * 60 * 60_000
const STORE_KEY = 'pw_next_live_session'

export type LiveStatus = {
  /** The session the live server is following, or null if none. */
  liveSessionKey: number | null
  /** Whether at least one check has completed — distinguishes "still finding
   *  out" from "checked, and there is genuinely nothing live". */
  liveChecked: boolean
  /** Set only once liveSessionKey is confirmed null — the next scheduled
   *  session of any type, from the real calendar. */
  nextLive: NextLiveSessionInfo | null
}

const EMPTY: LiveStatus = { liveSessionKey: null, liveChecked: false, nextLive: null }

// ── the calendar, cached per tab ─────────────────────────────────────────────

type Calendar = { year: number; at: number; next: NextLiveSessionInfo | null }
let calendar: Calendar | null = null
/** Sessions /live/state said were over after their scheduled end: skipped by the calendar from then on. */
const ended = new Set<number>()

function readStored(year: number): Calendar | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null')
    return c && c.year === year && typeof c.at === 'number' ? (c as Calendar) : null
  } catch {
    return null
  }
}

function fresh(c: Calendar | null, now: number): c is Calendar {
  if (!c || now - c.at >= CALENDAR_TTL_MS) return false
  // The session it named has begun since it was read: ask once more. A session
  // under way with no end yet is named again, and that answer then lasts the TTL.
  const start = c.next ? Date.parse(c.next.dateStart) : NaN
  return !(c.at < start && start <= now)
}

async function nextSession(year: number): Promise<NextLiveSessionInfo | null> {
  const known = calendar?.year === year ? calendar : readStored(year)
  if (fresh(known, Date.now())) {
    calendar = known
    return known.next
  }
  // The tail: a session stays "next" until 90 min after its scheduled end, unless it is known to be over.
  const next = await fetchNextLiveSession(year, new Date(), LIVE_TAIL_MS, ended)
  calendar = { year, at: Date.now(), next }
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(calendar)) } catch { /* private mode */ }
  return next
}

// ── one poller per season, shared by every mounted hook ─────────────────────

type Poller = {
  year: number
  value: LiveStatus
  listeners: Set<(s: LiveStatus) => void>
  timer: ReturnType<typeof setInterval> | null
  inFlight: Promise<void> | null
  onVisible: () => void
}
const pollers = new Map<number, Poller>()

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

function publish(p: Poller, value: LiveStatus) {
  p.value = value
  p.listeners.forEach((l) => l(value))
}

function poll(p: Poller): Promise<void> {
  if (hidden()) return Promise.resolve()
  if (p.inFlight) return p.inFlight
  p.inFlight = (async () => {
    const next = await nextSession(p.year).catch(() => null)
    if (next && inLiveWindow(next)) {
      if (Date.now() <= scheduledEnd(next)) {
        const status = await fetchLiveServerStatus()
        if (status.reachable && status.sessionKey !== null) {
          publish(p, { liveSessionKey: status.sessionKey, liveChecked: true, nextLive: next })
          return
        }
      } else {
        // Past the scheduled end: still on only while /live/state says so; once it does not, the session is over and
        // the calendar moves on to the next one.
        const state = await fetchLivePublicState().catch(() => null)
        if (state?.state === 'live' && state.sessionKey !== null) {
          publish(p, { liveSessionKey: state.sessionKey, liveChecked: true, nextLive: next })
          return
        }
        ended.add(next.sessionKey)
        calendar = null
        try { sessionStorage.removeItem(STORE_KEY) } catch { /* none */ }
      }
    }
    publish(p, { liveSessionKey: null, liveChecked: true, nextLive: next && ended.has(next.sessionKey) ? null : next })
  })().finally(() => { p.inFlight = null })
  return p.inFlight
}

function subscribe(year: number, listener: (s: LiveStatus) => void): () => void {
  let p = pollers.get(year)
  if (!p) {
    const created: Poller = {
      year, value: EMPTY, listeners: new Set(), timer: null, inFlight: null,
      onVisible: () => { if (!hidden()) void poll(created) },
    }
    p = created
    pollers.set(year, p)
  }
  const poller = p
  poller.listeners.add(listener)
  if (poller.value.liveChecked) listener(poller.value)
  if (poller.listeners.size === 1) {
    poller.timer = setInterval(() => void poll(poller), POLL_MS)
    document.addEventListener('visibilitychange', poller.onVisible)
    void poll(poller)
  }
  return () => {
    poller.listeners.delete(listener)
    if (poller.listeners.size) return
    if (poller.timer) clearInterval(poller.timer)
    document.removeEventListener('visibilitychange', poller.onVisible)
    pollers.delete(year)
  }
}

export function __resetLiveStatusForTests() {
  pollers.forEach((p) => { if (p.timer) clearInterval(p.timer); document.removeEventListener('visibilitychange', p.onVisible) })
  pollers.clear()
  calendar = null
  ended.clear()
  try { sessionStorage.removeItem(STORE_KEY) } catch { /* none */ }
}

export function useLiveStatus(pro: boolean, currentSeasonYear: number | undefined): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>(EMPTY)

  useEffect(() => {
    if (!pro || currentSeasonYear === undefined) {
      setStatus(EMPTY)
      return
    }
    return subscribe(currentSeasonYear, setStatus)
  }, [pro, currentSeasonYear])

  return status
}
