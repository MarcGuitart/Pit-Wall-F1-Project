import { describe, expect, it } from 'vitest'
import { isPreSeasonTest, placeName, seasonGrid, type GridRace } from './seasonGrid'

const r = (meeting_key: number, date_start: string, meeting_name: string, circuit_short_name: string, extra: Partial<GridRace> = {}): GridRace => ({
  meeting_key, date_start, meeting_name, circuit_short_name, country_name: 'x', year: 2026, ...extra,
})

// The shape /races returns for 2026: newest first, tests included.
const SEASON_2026: GridRace[] = [
  r(1302, '2026-12-04', 'Abu Dhabi Grand Prix', 'Yas Marina Circuit'),
  r(1308, '2026-10-02', 'Bahrain Grand Prix', 'Kuala Lumpur', { country_name: 'Bahrain' }),
  r(1283, '2026-04-17', 'Saudi Arabian Grand Prix', 'Jeddah'),
  r(1282, '2026-04-10', 'Bahrain Grand Prix', 'Sakhir'),
  r(1279, '2026-03-06', 'Australian Grand Prix', 'Melbourne'),
  r(1305, '2026-02-18', 'Pre-Season Testing', 'Sakhir'),
  r(1304, '2026-02-11', 'Pre-Season Testing', 'Sakhir'),
]

describe('seasonGrid', () => {
  it('numbers rounds in calendar order, first race first', () => {
    const g = seasonGrid(SEASON_2026)
    expect(g[0].race.meeting_key).toBe(1279)
    expect(g[0].round).toBe(1)
    expect(g.at(-1)?.race.meeting_key).toBe(1302)
    expect(g.map((c) => c.round)).toEqual([1, 2, 3, 4, 5])
  })

  it('leaves the pre-season tests out — they are not Grands Prix', () => {
    const g = seasonGrid(SEASON_2026)
    expect(g).toHaveLength(5)
    expect(g.some((c) => isPreSeasonTest(c.race))).toBe(false)
  })

  it('names a meeting by place, not by OpenF1\'s country (Kuala Lumpur, not Bahrain)', () => {
    const kl = seasonGrid(SEASON_2026).find((c) => c.race.meeting_key === 1308)!
    expect(kl.place).toBe('Kuala Lumpur')
  })

  it('prefers location once /races exposes it', () => {
    expect(placeName(r(1, '2026-01-01', 'X Grand Prix', 'Yas Marina Circuit', { location: 'Yas Island' }))).toBe('Yas Island')
  })

  it('a cancelled meeting is not a round, once /races says so', () => {
    const g = seasonGrid(SEASON_2026.map((x) => (x.meeting_key === 1282 || x.meeting_key === 1283 ? { ...x, is_cancelled: true } : x)))
    expect(g.filter((c) => c.cancelled).map((c) => c.place)).toEqual(['Sakhir', 'Jeddah'])
    expect(g.map((c) => c.round)).toEqual([1, null, null, 2, 3])
  })
})

describe('isPreSeasonTest', () => {
  it('matches the names OpenF1 uses for tests and nothing else', () => {
    expect(isPreSeasonTest({ meeting_name: 'Pre-Season Testing' })).toBe(true)
    expect(isPreSeasonTest({ meeting_name: 'Pre-Season Track Session' })).toBe(true)
    expect(isPreSeasonTest({ meeting_name: 'Bahrain Grand Prix' })).toBe(false)
  })
})
