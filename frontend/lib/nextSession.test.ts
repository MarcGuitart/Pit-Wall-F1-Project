import { describe, expect, it } from 'vitest'
import { candidateMeetings, describeSessionWindow, findRaceSession } from './nextSession'
import type { RaceListItem, SessionInfo } from '@/types'

function meeting(overrides: Partial<RaceListItem>): RaceListItem {
  return {
    meeting_key: 1,
    meeting_name: 'Test Grand Prix',
    country_name: 'Testland',
    circuit_short_name: 'Testcircuit',
    date_start: '2026-06-05T09:00:00Z',
    year: 2026,
    ...overrides,
  }
}

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    session_key: 1,
    session_name: 'Race',
    session_type: 'Race',
    date_start: '2026-06-07T13:00:00Z',
    date_end: '2026-06-07T15:00:00Z',
    ...overrides,
  }
}

const NOW = new Date('2026-06-01T00:00:00Z')

describe('candidateMeetings', () => {
  it('drops a meeting more than 5 days in the past', () => {
    const old = meeting({ meeting_key: 1, date_start: '2026-05-20T00:00:00Z' })
    const recent = meeting({ meeting_key: 2, date_start: '2026-05-28T00:00:00Z' })
    const future = meeting({ meeting_key: 3, date_start: '2026-06-10T00:00:00Z' })
    const out = candidateMeetings([old, recent, future], NOW)
    expect(out.map((m) => m.meeting_key)).toEqual([2, 3])
  })

  it('sorts ascending by date_start, earliest first', () => {
    const a = meeting({ meeting_key: 1, date_start: '2026-07-01T00:00:00Z' })
    const b = meeting({ meeting_key: 2, date_start: '2026-06-10T00:00:00Z' })
    const c = meeting({ meeting_key: 3, date_start: '2026-06-20T00:00:00Z' })
    const out = candidateMeetings([a, b, c], NOW)
    expect(out.map((m) => m.meeting_key)).toEqual([2, 3, 1])
  })

  it('a meeting with no date_start is excluded rather than crashing', () => {
    const broken = meeting({ meeting_key: 1, date_start: undefined })
    const ok = meeting({ meeting_key: 2, date_start: '2026-06-10T00:00:00Z' })
    expect(candidateMeetings([broken, ok], NOW).map((m) => m.meeting_key)).toEqual([2])
  })

  it('an empty list stays empty', () => {
    expect(candidateMeetings([], NOW)).toEqual([])
  })
})

describe('findRaceSession', () => {
  it('picks the Race, not a Sprint that also carries session_type Race', () => {
    const sprint = session({ session_key: 1, session_name: 'Sprint', session_type: 'Race' })
    const race = session({ session_key: 2, session_name: 'Race', session_type: 'Race' })
    const quali = session({ session_key: 3, session_name: 'Qualifying', session_type: 'Qualifying' })
    expect(findRaceSession([sprint, quali, race])?.session_key).toBe(2)
  })

  it('returns null when there is no Race session at all', () => {
    const quali = session({ session_name: 'Qualifying', session_type: 'Qualifying' })
    expect(findRaceSession([quali])).toBeNull()
  })

  it('an empty list returns null, not a crash', () => {
    expect(findRaceSession([])).toBeNull()
  })
})

describe('describeSessionWindow', () => {
  it('is "upcoming" before the session starts', () => {
    const s = session({ date_start: '2026-06-07T13:00:00Z', date_end: '2026-06-07T15:00:00Z' })
    expect(describeSessionWindow(s, new Date('2026-06-01T00:00:00Z')).status).toBe('upcoming')
  })

  it('is still "upcoming" while the session is running — no promise about the write-up', () => {
    const s = session({ date_start: '2026-06-07T13:00:00Z', date_end: '2026-06-07T15:00:00Z' })
    expect(describeSessionWindow(s, new Date('2026-06-07T14:00:00Z')).status).toBe('upcoming')
  })

  it('becomes "processing" only once date_end has passed', () => {
    const s = session({ date_start: '2026-06-07T13:00:00Z', date_end: '2026-06-07T15:00:00Z' })
    expect(describeSessionWindow(s, new Date('2026-06-07T15:00:01Z')).status).toBe('processing')
  })

  it('exactly at date_end counts as processing (>=, not >)', () => {
    const s = session({ date_start: '2026-06-07T13:00:00Z', date_end: '2026-06-07T15:00:00Z' })
    expect(describeSessionWindow(s, new Date('2026-06-07T15:00:00Z')).status).toBe('processing')
  })

  it('with no date_end at all, it is never "processing" — nothing to compare against', () => {
    const s = session({ date_start: '2026-06-07T13:00:00Z', date_end: null })
    expect(describeSessionWindow(s, new Date('2030-01-01T00:00:00Z')).status).toBe('upcoming')
    expect(describeSessionWindow(s, new Date('2030-01-01T00:00:00Z')).dateEnd).toBeNull()
  })

  it('carries dateStart and dateEnd through unmodified, for the caller to format', () => {
    const s = session({ date_start: '2026-06-07T13:00:00Z', date_end: '2026-06-07T15:00:00Z' })
    const w = describeSessionWindow(s, NOW)
    expect(w.dateStart).toBe('2026-06-07T13:00:00Z')
    expect(w.dateEnd).toBe('2026-06-07T15:00:00Z')
  })
})
