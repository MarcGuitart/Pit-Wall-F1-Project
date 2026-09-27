/**
 * "When is the next thing in this season" — for the PRO landing card.
 *
 * The card must never invent a time the analysis will be ready: the guard and
 * the hourly publication Action decide that, not this file. What it can say
 * honestly is when the session itself takes place, which is /races data OpenF1
 * publishes on the calendar well before the race — and, once the session has
 * ended, that the write-up is being worked on rather than pretending nothing
 * changed.
 *
 * Split in two on purpose: the pure date logic below is unit-tested without a
 * network; fetchNextRaceCardInfo is the only part that calls the backend.
 */
import { fetchRaces, fetchSessions } from '@/lib/api'
import type { RaceListItem, SessionInfo } from '@/types'

export type SessionWindowStatus = 'upcoming' | 'processing'

export type SessionWindow = {
  status: SessionWindowStatus
  /** date_start, unmodified — the caller formats it in the visitor's locale. */
  dateStart: string
  /** date_end, unmodified — the caller formats it as UTC. null if OpenF1 has
   *  not scheduled the end yet (rare, only for a session far in the future). */
  dateEnd: string | null
}

/**
 * A meeting is only worth fetching sessions for if its own start is not
 * obviously long over. A race weekend is Friday-to-Sunday, so five days past
 * the meeting's date_start safely covers "this race already happened" without
 * needing to know the Race session's own time yet — that would need the very
 * call this filter exists to avoid making for every stale meeting in the list.
 */
const STALE_MEETING_DAYS = 5

/**
 * The soonest meeting that is not obviously already finished, earliest first.
 * Pure: takes "now" as a parameter so it is testable without mocking the clock.
 */
export function candidateMeetings(meetings: RaceListItem[], now: Date): RaceListItem[] {
  const cutoff = now.getTime() - STALE_MEETING_DAYS * 24 * 60 * 60 * 1000
  return meetings
    .filter((m) => m.date_start && new Date(m.date_start).getTime() >= cutoff)
    .sort((a, b) => new Date(a.date_start ?? 0).getTime() - new Date(b.date_start ?? 0).getTime())
}

/** The Grand Prix itself, not a sprint — session_type is "Race" for both. */
export function findRaceSession(sessions: SessionInfo[]): SessionInfo | null {
  return sessions.find((s) => s.session_name === 'Race' && s.session_type === 'Race') ?? null
}

/**
 * What to say about a session, given its own schedule and the current time.
 * "processing" only once date_end has actually passed — before that, whether
 * the session is upcoming or already under way, the copy is the same: this is
 * when it happens, not a promise about the write-up.
 */
export function describeSessionWindow(session: SessionInfo, now: Date): SessionWindow {
  const end = session.date_end ? new Date(session.date_end) : null
  const status: SessionWindowStatus = end && end.getTime() <= now.getTime() ? 'processing' : 'upcoming'
  return { status, dateStart: session.date_start, dateEnd: session.date_end ?? null }
}

export type NextRaceCardInfo = {
  meetingName: string
  circuitShortName: string | null
  countryName: string | null
} & SessionWindow

const MAX_MEETINGS_TRIED = 3

/**
 * The next (or currently in progress) Grand Prix of `year`, or null when
 * nothing could be found — either the season has no more races, or the data
 * genuinely is not there. The caller must treat null as "say nothing specific
 * was found", never as an error to retry aggressively; this runs on every
 * landing page load.
 */
export async function fetchNextRaceCardInfo(year: number, now: Date = new Date()): Promise<NextRaceCardInfo | null> {
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
    const race = findRaceSession(sessions)
    if (!race || !race.date_start) continue
    return {
      meetingName: meeting.meeting_name,
      circuitShortName: meeting.circuit_short_name ?? null,
      countryName: meeting.country_name ?? null,
      ...describeSessionWindow(race, now),
    }
  }
  return null
}
