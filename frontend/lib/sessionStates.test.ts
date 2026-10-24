import { describe, expect, it } from 'vitest'
import { meetingState, sessionState, showsProChip, type StateContext } from './sessionStates'
import type { SessionInfo } from '@/types'
import lusail from '@/test/fixtures/sessions_lusail_2025_sprint.json'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const ctx2026: StateContext = { published: new Set([11377]), now: NOW, season: 2026, currentSeason: 2026, locked: false }

// Baku 2026 (meeting 1295): Race 11377 published, the rest not.
const s = (session_key: number, session_name: string, session_type: string, date_start: string, date_end: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ session_key, session_name, session_type, date_start, date_end, ...extra })
const baku = {
  fp1: s(11368, 'Practice 1', 'Practice', '2026-09-24T08:30:00Z', '2026-09-24T09:30:00Z'),
  sq: s(11370, 'Sprint Qualifying', 'Qualifying', '2026-09-25T12:30:00Z', '2026-09-25T13:14:00Z'),
  sprint: s(11372, 'Sprint', 'Race', '2026-09-26T11:00:00Z', '2026-09-26T12:00:00Z'),
  race: s(11377, 'Race', 'Race', '2026-09-27T11:00:00Z', '2026-09-27T13:00:00Z'),
}

describe('sessionState (block 45)', () => {
  it('Baku 2026: the race is Published, every other session Opens on demand, all open', () => {
    expect(sessionState(baku.race, ctx2026)).toEqual({ kind: 'published', label: 'Published', action: 'open' })
    for (const x of [baku.fp1, baku.sq, baku.sprint]) {
      expect(sessionState(x, ctx2026)).toEqual({ kind: 'available', label: 'Opens on demand', action: 'open' })
    }
  })

  it('a sprint weekend (Lusail 2025): all five sessions open, none disabled', () => {
    const ctx = { ...ctx2026, season: 2025, published: new Set([9850]) }
    const states = (lusail as SessionInfo[]).map((x) => [x.session_name, sessionState(x, ctx).label, sessionState(x, ctx).action])
    expect(states).toEqual([
      ['Practice 1', 'Opens on demand', 'open'],
      ['Sprint Qualifying', 'Opens on demand', 'open'],
      ['Sprint', 'Opens on demand', 'open'],
      ['Qualifying', 'Opens on demand', 'open'],
      ['Race', 'Published', 'open'],
    ])
  })

  it('a cancelled session is Cancelled with no action, even in the future', () => {
    const cancelled = s(11261, 'Race', 'Race', '2027-04-12T15:00:00Z', '2027-04-12T17:00:00Z', { is_cancelled: true })
    expect(sessionState(cancelled, ctx2026)).toEqual({ kind: 'cancelled', label: 'Cancelled', action: null })
  })

  it('a future session is Not run yet and offers the calendar; one running now is Under way and opens', () => {
    const austin = s(11400, 'Race', 'Race', '2026-10-25T19:00:00Z', '2026-10-25T21:00:00Z')
    expect(sessionState(austin, ctx2026)).toEqual({ kind: 'not-run', label: 'Not run yet', action: 'calendar' })
    const now = s(1, 'Practice 1', 'Practice', '2026-10-21T11:00:00Z', '2026-10-21T13:00:00Z')
    expect(sessionState(now, ctx2026)).toEqual({ kind: 'under-way', label: 'Under way', action: 'open' })
  })

  it('a locked PRO season still opens (the race page shows the wall)', () => {
    expect(sessionState(baku.fp1, { ...ctx2026, locked: true }).action).toBe('open')
  })

  it('without /published: no label, any season, and the session still opens', () => {
    expect(sessionState(baku.race, { ...ctx2026, published: null })).toEqual({ kind: 'unknown', label: '', action: 'open' })
    expect(sessionState(baku.fp1, { ...ctx2026, season: 2023, published: null }).label).toBe('')
  })

  it('the PRO chip shows from 2025', () => {
    expect([2023, 2024, 2025, 2026].map(showsProChip)).toEqual([false, false, true, true])
  })
})

describe('meetingState (the cell, before any fetch)', () => {
  const base = { now: NOW, season: 2026, currentSeason: 2026, locked: false }
  const rows = [{ session_key: 11377, meeting_key: 1295, session_name: 'Race' }]
  it('Published when the meeting race is in /published, Opens on demand when it ended without', () => {
    expect(meetingState({ meeting_key: 1295, date_start: '2026-09-24T08:30:00Z', date_end: '2026-09-27T13:00:00Z' }, rows, base).label).toBe('Published')
    expect(meetingState({ meeting_key: 1296, date_start: '2026-10-02T08:30:00Z', date_end: '2026-10-04T14:00:00Z' }, rows, base).label).toBe('Opens on demand')
  })
  it('Not run yet, PRO, Sessions for earlier seasons, and no label without /published', () => {
    expect(meetingState({ meeting_key: 1, date_start: '2026-10-23T17:30:00Z' }, rows, base).label).toBe('Not run yet')
    expect(meetingState({ meeting_key: 1295, date_start: '2026-09-24T08:30:00Z' }, rows, { ...base, locked: true }).label).toBe('PRO')
    expect(meetingState({ meeting_key: 9, date_start: '2023-11-24T09:30:00Z' }, [], { ...base, season: 2023 }).label).toBe('Sessions')
    expect(meetingState({ meeting_key: 1296, date_start: '2026-10-02T08:30:00Z' }, null, base).label).toBe('')
  })
})
