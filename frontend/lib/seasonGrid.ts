import type { RaceListItem } from '@/types'
import { placeOf } from '@/lib/place'

/**
 * A season as a grid of Grands Prix, for the selector.
 *
 * /races answers newest first and includes the pre-season tests. Taking the
 * round from the index of that list made Abu Dhabi "Round 01" and a test
 * "Round 27", and counted the tests as Grands Prix. Rounds here are
 * chronological, ascending, and tests are not rounds.
 *
 * Cancelled meetings (2026: Sakhir, Jeddah) come from /races' is_cancelled —
 * only true counts — and are not rounds. The place name is /races' location,
 * falling back to the circuit on an older backend: OpenF1's meeting_name and
 * country_name are wrong for at least one meeting (2026 Kuala Lumpur reads
 * "Bahrain Grand Prix", "Bahrain").
 */
export type GridRace = RaceListItem

export type SeasonCell = {
  race: GridRace
  /** 1-based, chronological; null for anything that is not a round. */
  round: number | null
  place: string
  cancelled: boolean
}

export function isPreSeasonTest(r: Pick<RaceListItem, 'meeting_name'>): boolean {
  return /pre-?season|testing/i.test(r.meeting_name)
}

export function placeName(r: GridRace): string {
  return placeOf(r)
}

/** Grands Prix in calendar order with their rounds; tests dropped. */
export function seasonGrid(races: GridRace[]): SeasonCell[] {
  const gps = races
    .filter((r) => !isPreSeasonTest(r))
    .sort((a, b) => (a.date_start ?? '').localeCompare(b.date_start ?? ''))
  let round = 0
  return gps.map((race) => {
    const cancelled = race.is_cancelled === true
    return { race, round: cancelled ? null : ++round, place: placeName(race), cancelled }
  })
}
