import { describe, expect, it } from 'vitest'
import { findEarliestUpcomingSession } from './liveStatus'
import type { SessionInfo } from '@/types'

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    session_key: 1,
    session_name: 'Practice 1',
    session_type: 'Practice',
    date_start: '2026-06-05T09:00:00Z',
    date_end: '2026-06-05T10:00:00Z',
    ...overrides,
  }
}

const NOW = new Date('2026-06-05T08:00:00Z')

describe('findEarliestUpcomingSession', () => {
  it('picks the chronologically nearest session, not just the Race', () => {
    const fp1 = session({ session_key: 1, session_name: 'Practice 1', date_start: '2026-06-05T09:00:00Z', date_end: '2026-06-05T10:00:00Z' })
    const quali = session({ session_key: 2, session_name: 'Qualifying', date_start: '2026-06-06T13:00:00Z', date_end: '2026-06-06T14:00:00Z' })
    const race = session({ session_key: 3, session_name: 'Race', date_start: '2026-06-07T13:00:00Z', date_end: '2026-06-07T15:00:00Z' })
    expect(findEarliestUpcomingSession([race, quali, fp1], NOW)?.session_key).toBe(1)
  })

  it('excludes a session whose date_end has already passed', () => {
    const finished = session({ session_key: 1, date_start: '2026-06-04T09:00:00Z', date_end: '2026-06-04T10:00:00Z' })
    const upcoming = session({ session_key: 2, date_start: '2026-06-05T09:00:00Z', date_end: '2026-06-05T10:00:00Z' })
    expect(findEarliestUpcomingSession([finished, upcoming], NOW)?.session_key).toBe(2)
  })

  it('includes a session currently in progress (started, not yet ended)', () => {
    const inProgress = session({
      session_key: 1,
      date_start: '2026-06-05T07:00:00Z', // started before NOW
      date_end: '2026-06-05T09:00:00Z',   // ends after NOW
    })
    expect(findEarliestUpcomingSession([inProgress], NOW)?.session_key).toBe(1)
  })

  it('a session with no date_end is treated as not yet over', () => {
    const open = session({ session_key: 1, date_start: '2026-06-01T00:00:00Z', date_end: undefined })
    expect(findEarliestUpcomingSession([open], NOW)?.session_key).toBe(1)
  })

  it('a session with no date_start at all is skipped rather than crashing', () => {
    const broken = session({ session_key: 1, date_start: undefined as unknown as string })
    const ok = session({ session_key: 2, date_start: '2026-06-05T09:00:00Z' })
    expect(findEarliestUpcomingSession([broken, ok], NOW)?.session_key).toBe(2)
  })

  it('returns null when every session has already ended', () => {
    const s = session({ date_start: '2026-06-01T09:00:00Z', date_end: '2026-06-01T10:00:00Z' })
    expect(findEarliestUpcomingSession([s], NOW)).toBeNull()
  })

  it('an empty list returns null', () => {
    expect(findEarliestUpcomingSession([], NOW)).toBeNull()
  })
})
