/**
 * What to say about live mode on the landing page, for a PRO visitor.
 *
 * Two independent questions, deliberately not conflated:
 *
 *   Is a session live right now? Answered by the live server itself
 *   (/health, unauthenticated — the same endpoint Render's health check
 *   polls), never by comparing the clock to a schedule. A session can start
 *   late; the only source of truth for "data is arriving" is the server that
 *   is actually receiving it.
 *
 *   If not, when is the next one? Answered from /races, the same calendar
 *   data Task 2's card uses, generalised to any session type (Task 2 only
 *   cared about the Race; here any upcoming FP/Quali/Sprint/Race is "next").
 *
 * The live server is not deployed yet (Block 17 designed it; Block 19 does not
 * change that), so every call here is expected to fail closed in production
 * today — this file's job is to make that failure read as "no live session
 * right now", never as a broken link or a crash.
 */
import { fetchRaces, fetchSessions } from '@/lib/api'
import { placeOf } from '@/lib/place'
import { candidateMeetings } from '@/lib/nextSession'
import type { RaceListItem, SessionInfo } from '@/types'

const LIVE_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? (process.env.NODE_ENV === 'production'
  ? 'https://pit-wall-f1-project-live.onrender.com'
  : 'http://localhost:8099')
const HEALTH_TIMEOUT_MS = 4000

export type LiveServerStatus = {
  reachable: boolean
  /** The session the live server is following, if any and if reachable. */
  sessionKey: number | null
}

/** Never throws: an unreachable or misconfigured live server reads the same
 *  as "no live session", which is the honest and safe default. */
export async function fetchLiveServerStatus(): Promise<LiveServerStatus> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const res = await fetch(`${LIVE_URL}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return { reachable: false, sessionKey: null }
    const body = await res.json()
    const key = typeof body?.session_key === 'number' ? body.session_key : null
    return { reachable: true, sessionKey: key }
  } catch {
    return { reachable: false, sessionKey: null }
  }
}

export type LivePublicState = { state: 'live' | 'no_session'; sessionKey: number | null }

/**
 * GET /live/state on the live server (ops/landing-meta): on air or not, and
 * which session — nothing else. Throws when the endpoint is missing or slow
 * (timeoutMs): the landing hides its live card rather than guess.
 */
export async function fetchLivePublicState(timeoutMs = 3000): Promise<LivePublicState> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${LIVE_URL}/live/state`, { signal: controller.signal })
    if (!res.ok) throw new Error(`live state ${res.status}`)
    const body = await res.json()
    if (body?.state !== 'live' && body?.state !== 'no_session') throw new Error('live state: unexpected body')
    return { state: body.state, sessionKey: typeof body.session_key === 'number' ? body.session_key : null }
  } finally {
    clearTimeout(timer)
  }
}

/** The chronologically nearest session in a meeting that has not ended yet —
 *  any type, not only the Race: whichever one a live server would actually
 *  be following next. */
export function findEarliestUpcomingSession(sessions: SessionInfo[], now: Date): SessionInfo | null {
  const upcoming = sessions
    .filter((s) => {
      if (!s.date_start) return false
      if (s.date_end && new Date(s.date_end).getTime() <= now.getTime()) return false
      return true
    })
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())
  return upcoming[0] ?? null
}

export type NextLiveSessionInfo = {
  /** The host city (lib/place.ts) — never OpenF1's meeting or country name. */
  place: string
  circuitShortName: string | null
  /** The session's own key: /live/{key} before it starts is the "not live yet" page. */
  sessionKey: number
  sessionName: string
  dateStart: string
  dateEnd: string | null
}

const MAX_MEETINGS_TRIED = 4

/**
 * The next session of any type, across the season — or null when nothing
 * could be found (season over, or the data is not there). The caller must
 * say so explicitly rather than render nothing; this file only reports what
 * it found.
 */
export async function fetchNextLiveSession(year: number, now: Date = new Date()): Promise<NextLiveSessionInfo | null> {
  let meetings: RaceListItem[]
  try {
    meetings = await fetchRaces(year)
  } catch {
    return null
  }

  const candidates = candidateMeetings(meetings, now).slice(0, MAX_MEETINGS_TRIED)
  for (const meeting of candidates) {
    let sessions: SessionInfo[]
    try {
      sessions = await fetchSessions(meeting.meeting_key)
    } catch {
      continue
    }
    const next = findEarliestUpcomingSession(sessions, now)
    if (!next) continue
    return {
      place: placeOf(meeting),
      circuitShortName: meeting.circuit_short_name ?? null,
      sessionKey: next.session_key,
      sessionName: next.session_name,
      dateStart: next.date_start,
      dateEnd: next.date_end ?? null,
    }
  }
  return null
}
