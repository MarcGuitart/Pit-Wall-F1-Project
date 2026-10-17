import { describe, expect, it } from 'vitest'
import { formatUtcInstant, headerFacts } from './sessionFacts'
import type { SessionMeta } from '@/types'

const base: SessionMeta = {
  session_key: 11999, meeting_key: 1308, meeting_name: 'Bahrain Grand Prix', location: 'Kuala Lumpur',
  circuit_short_name: 'Kuala Lumpur', country_name: 'Bahrain', year: 2026, session_name: 'Race', session_type: 'Race',
  date_start: '2026-10-04T08:00:00+00:00', date_end: null, is_cancelled: false, analysis_cached: false, earliest_at: null,
}

describe('headerFacts', () => {
  it('names the place by location, never by OpenF1\'s country', () => {
    const f = headerFacts(11999, base)
    expect(f.line).toBe('Kuala Lumpur · 2026 · Race · 04 Oct 2026')
    expect(f.line).not.toContain('Bahrain')
    expect(f.kicker).toBe('Race analysis · OpenF1 · Session 11999')
  })
  it('falls back to the circuit when location is missing', () => {
    expect(headerFacts(1, { ...base, location: null, circuit_short_name: 'Sepang' }).line).toBe('Sepang · 2026 · Race · 04 Oct 2026')
  })
  it('no meta: no invented title or line', () => {
    expect(headerFacts(1, null)).toEqual({ kicker: 'Race analysis · OpenF1 · Session 1', title: null, line: null })
  })
})

describe('formatUtcInstant', () => {
  it('formats like the spec, in UTC', () => {
    expect(formatUtcInstant('2025-06-01T19:00:00Z')).toBe('Sun 01 Jun 2025 · 19:00 UTC')
    expect(formatUtcInstant(null)).toBeNull()
  })
})
