import type { SessionInfo } from '@/types'
import { isProSeason } from '@/lib/access'

/**
 * What the /races panel says about each session, and what it offers (block 33,
 * reworked in block 45).
 *
 * Every session that is not cancelled and has run opens with "Open analysis",
 * at /race/<session_key>, the same route the "Any session" selector uses:
 * practice and qualifying included, since /analysis computes any session on
 * request. The label says only what /published knows: "Published" when the
 * analysis is already on the server, "Opens on demand" otherwise. When
 * /published did not answer (or has not yet) there is no label at all, and
 * the session still opens. PRO seasons (2025 on) carry a PRO chip; opening a
 * locked one leads to the race page's PRO wall.
 */
export type SessionStateKind = 'published' | 'available' | 'not-run' | 'under-way' | 'cancelled' | 'pro' | 'unknown'

export type SessionAction = 'open' | 'calendar' | null

export type SessionState = { kind: SessionStateKind; label: string; action: SessionAction }

export type StateContext = {
  published: ReadonlySet<number> | null
  now: number
  season: number
  currentSeason: number
  locked: boolean
}

const LABEL: Record<SessionStateKind, string> = {
  published: 'Published',
  available: 'Opens on demand',
  'not-run': 'Not run yet',
  'under-way': 'Under way',
  cancelled: 'Cancelled',
  pro: 'PRO',
  unknown: '',
}

const state = (kind: SessionStateKind, action: SessionAction): SessionState => ({ kind, label: LABEL[kind], action })

/** The PRO chip: seasons from 2025 on, whatever access this browser has. */
export function showsProChip(season: number): boolean {
  return isProSeason(season)
}

export function sessionState(s: SessionInfo, ctx: StateContext): SessionState {
  if (s.is_cancelled) return state('cancelled', null)
  const start = new Date(s.date_start).getTime()
  const end = s.date_end ? new Date(s.date_end).getTime() : start
  if (start > ctx.now) return state('not-run', 'calendar')
  if (end > ctx.now) return state('under-way', 'open')
  if (ctx.published === null) return state('unknown', 'open')
  if (ctx.published.has(s.session_key)) return state('published', 'open')
  return state('available', 'open')
}

export type PublishedRow = { session_key: number; meeting_key: number | null; session_name: string | null }

/**
 * The cell's word before any session is fetched (no prefetch): from the
 * meeting's dates and, for the current season, whether its race is published.
 */
export function meetingState(
  race: { meeting_key: number; date_start: string; date_end?: string | null },
  rows: readonly PublishedRow[] | null,
  ctx: Omit<StateContext, 'published'>,
): SessionState {
  const start = new Date(race.date_start).getTime()
  if (start > ctx.now) return state('not-run', null)
  if (ctx.locked) return state('pro', null)
  // Earlier seasons: nothing to tell apart before the panel opens.
  if (ctx.season < ctx.currentSeason) return { kind: 'available', label: 'Sessions', action: null }
  // /published failed or has not answered: no label rather than a guess.
  if (rows === null) return state('unknown', null)
  if (rows.some((r) => r.meeting_key === race.meeting_key && r.session_name === 'Race')) return state('published', null)
  const end = race.date_end ? new Date(race.date_end).getTime() : start
  return end > ctx.now ? state('under-way', null) : state('available', null)
}
