import { describe, expect, it } from 'vitest'
import { weekendLabel } from './raceDates'

describe('weekendLabel', () => {
  it.each([
    ['2024-02-29T11:30:00+00:00', '2024-03-02T17:00:00+00:00', '29 Feb to 2 Mar 2024'],
    ['2024-12-06T09:30:00+00:00', '2024-12-08T15:00:00+00:00', '6 to 8 Dec 2024'],
    ['2026-12-30T10:00:00+00:00', '2027-01-01T16:00:00+00:00', '30 Dec 2026 to 1 Jan 2027'],
    ['2024-02-29T11:30:00+00:00', null, '29 Feb 2024'],
    ['2024-02-29T11:30:00+00:00', undefined, '29 Feb 2024'],
    ['2024-02-29T11:30:00+00:00', '2024-02-29T18:00:00+00:00', '29 Feb 2024'],
    ['2024-02-29T11:30:00+00:00', 'not a date', '29 Feb 2024'],
  ])('%s to %s reads "%s"', (start, end, want) => {
    expect(weekendLabel(start, end)).toBe(want)
  })

  it('uses no dash and always carries the year', () => {
    for (const s of [weekendLabel('2024-02-29T11:30:00Z', '2024-03-02T17:00:00Z'), weekendLabel('2024-02-29T11:30:00Z')]) {
      expect(s).not.toMatch(/[—–-]/)
      expect(s).toMatch(/\b20\d\d\b/)
    }
  })
})
