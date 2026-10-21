import { describe, expect, it } from 'vitest'
import { meetingState, sessionState, type StateContext } from './sessionStates'
import type { SessionInfo } from '@/types'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const ctx2026: StateContext = { published: new Set([11377]), now: NOW, season: 2026, currentSeason: 2026, locked: false }

// Baku 2026 (meeting 1295): Sprint 11372 not written up yet, Race 11377 published.
const s = (session_key: number, session_name: string, session_type: string, date_start: string, date_end: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ session_key, session_name, session_type, date_start, date_end, ...extra })
const baku = {
  fp1: s(11368, 'Practice 1', 'Practice', '2026-09-24T08:30:00Z', '2026-09-24T09:30:00Z'),
  sq: s(11370, 'Sprint Qualifying', 'Qualifying', '2026-09-25T12:30:00Z', '2026-09-25T13:14:00Z'),
  sprint: s(11372, 'Sprint', 'Race', '2026-09-26T11:00:00Z', '2026-09-26T12:00:00Z'),
  race: s(11377, 'Race', 'Race', '2026-09-27T11:00:00Z', '2026-09-27T13:00:00Z'),
}

describe('sessionState', () => {
  it('Baku 2026: the race is Published and opens; the sprint is Processing', () => {
    expect(sessionState(baku.race, ctx2026)).toEqual({ kind: 'published', label: 'Published', action: 'open' })
    expect(sessionState(baku.sprint, ctx2026)).toEqual({ kind: 'processing', label: 'Processing', action: null })
  })

  it('practice and qualifying are Not analysed yet', () => {
    expect(sessionState(baku.fp1, ctx2026).label).toBe('Not analysed yet')
    expect(sessionState(baku.sq, ctx2026).label).toBe('Not analysed yet')
  })

  it('a cancelled session is Cancelled with no action, even in the future', () => {
    const cancelled = s(11261, 'Race', 'Race', '2027-04-12T15:00:00Z', '2027-04-12T17:00:00Z', { is_cancelled: true })
    expect(sessionState(cancelled, ctx2026)).toEqual({ kind: 'cancelled', label: 'Cancelled', action: null })
  })

  it('a 2023 race is Available on request, never Processing', () => {
    const abuDhabi = s(9197, 'Race', 'Race', '2023-11-26T13:00:00Z', '2023-11-26T15:00:00Z')
    const ctx = { ...ctx2026, season: 2023, published: new Set<number>() }
    expect(sessionState(abuDhabi, ctx)).toEqual({ kind: 'available', label: 'Available', action: 'open' })
  })

  it('a future session is Not run yet and offers the calendar', () => {
    const austin = s(11400, 'Race', 'Race', '2026-10-25T19:00:00Z', '2026-10-25T21:00:00Z')
    expect(sessionState(austin, ctx2026)).toEqual({ kind: 'not-run', label: 'Not run yet', action: 'calendar' })
  })

  it('a session running now is Under way', () => {
    const now = s(1, 'Race', 'Race', '2026-10-21T11:00:00Z', '2026-10-21T13:00:00Z')
    expect(sessionState(now, ctx2026).kind).toBe('under-way')
  })

  it('a PRO season without access is PRO and offers to unlock', () => {
    expect(sessionState(baku.race, { ...ctx2026, locked: true })).toEqual({ kind: 'pro', label: 'PRO', action: 'unlock' })
  })

  it('when /published did not answer, nothing claims Published or Processing', () => {
    const ctx = { ...ctx2026, published: null }
    expect(sessionState(baku.race, ctx).kind).toBe('available')
    expect(sessionState(baku.sprint, ctx).kind).toBe('available')
  })
})

describe('meetingState (the cell, before any fetch)', () => {
  const base = { now: NOW, season: 2026, currentSeason: 2026, locked: false }
  const rows = [{ session_key: 11377, meeting_key: 1295, session_name: 'Race' }]
  it('Published when the meeting race is in /published, Processing when it ended without', () => {
    expect(meetingState({ meeting_key: 1295, date_start: '2026-09-24T08:30:00Z', date_end: '2026-09-27T13:00:00Z' }, rows, base).label).toBe('Published')
    expect(meetingState({ meeting_key: 1296, date_start: '2026-10-02T08:30:00Z', date_end: '2026-10-04T14:00:00Z' }, rows, base).label).toBe('Processing')
  })
  it('Not run yet, PRO, and Sessions for earlier seasons or without /published', () => {
    expect(meetingState({ meeting_key: 1, date_start: '2026-10-23T17:30:00Z' }, rows, base).label).toBe('Not run yet')
    expect(meetingState({ meeting_key: 1295, date_start: '2026-09-24T08:30:00Z' }, rows, { ...base, locked: true }).label).toBe('PRO')
    expect(meetingState({ meeting_key: 9, date_start: '2023-11-24T09:30:00Z' }, [], { ...base, season: 2023 }).label).toBe('Sessions')
    expect(meetingState({ meeting_key: 1296, date_start: '2026-10-02T08:30:00Z' }, null, base).label).toBe('Sessions')
  })
})
