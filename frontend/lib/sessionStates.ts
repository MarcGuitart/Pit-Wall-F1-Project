import type { SessionInfo } from '@/types'

/**
 * What the /races panel says about each session, and what it offers (block 33).
 *
 * Published and Processing only mean something for the current season, which
 * the publish job writes up after each race. Earlier seasons are analysed when
 * someone opens them, so their races say "Opens on demand", never "Processing".
 * Practice and qualifying are not analysed at all: "Not analysed yet".
 * `published` is null when /published did not answer in time: then nothing
 * claims Published or Processing, and races keep their Open action.
 */
export type SessionStateKind =
  | 'published' | 'processing' | 'available' | 'not-run' | 'under-way'
  | 'cancelled' | 'pro' | 'not-analysed'

export type SessionAction = 'open' | 'calendar' | 'unlock' | null

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
  processing: 'Processing',
  available: 'Opens on demand',
  'not-run': 'Not run yet',
  'under-way': 'Under way',
  cancelled: 'Cancelled',
  pro: 'PRO',
  'not-analysed': 'Not analysed yet',
}

const state = (kind: SessionStateKind, action: SessionAction): SessionState => ({ kind, label: LABEL[kind], action })

/** Race and Sprint are analysed; practice and qualifying are not. */
export function isAnalysed(s: Pick<SessionInfo, 'session_type'>): boolean {
  return s.session_type === 'Race'
}

export function sessionState(s: SessionInfo, ctx: StateContext): SessionState {
  if (s.is_cancelled) return state('cancelled', null)
  const start = new Date(s.date_start).getTime()
  const end = s.date_end ? new Date(s.date_end).getTime() : start
  if (start > ctx.now) return state('not-run', 'calendar')
  if (ctx.locked) return state('pro', 'unlock')
  if (end > ctx.now) return state('under-way', null)
  if (!isAnalysed(s)) return state('not-analysed', null)
  if (ctx.published?.has(s.session_key)) return state('published', 'open')
  if (ctx.season < ctx.currentSeason || ctx.published === null) return state('available', 'open')
  return state('processing', null)
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
  // Nothing to tell apart before the panel opens: the cell just offers the sessions.
  if (ctx.season < ctx.currentSeason || rows === null) return { kind: 'available', label: 'Sessions', action: null }
  const raceDone = rows.some((r) => r.meeting_key === race.meeting_key && r.session_name === 'Race')
  if (raceDone) return state('published', null)
  const end = race.date_end ? new Date(race.date_end).getTime() : start
  return end > ctx.now ? state('under-way', null) : state('processing', null)
}
