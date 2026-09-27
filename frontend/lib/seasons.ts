/**
 * Which seasons the app offers.
 *
 * These were a literal `[2025, 2024, 2023]` in the selector and the words
 * "from 2023 to 2025" in the top bar. Both went stale silently on 1 January:
 * the backend served 2026 sessions, a 2026 race analysed correctly when its
 * URL was opened directly, and the only thing stopping anyone finding it was a
 * hard-coded list in the dropdown.
 *
 * FIRST_SEASON is the real floor — OpenF1's data does not go back further in a
 * shape this app can use. The ceiling is simply the current year.
 */
export const FIRST_SEASON = 2023

/**
 * The current season, from the client's clock.
 *
 * On 1 January a page rendered on the server just before midnight and hydrated
 * just after would disagree by one year. The consequence is one extra entry in
 * a dropdown for one page load, so it is not worth a round trip to ask the
 * backend what year it is.
 */
export function currentSeason(): number {
  return new Date().getFullYear()
}

/** Newest first, down to FIRST_SEASON. */
export function seasonYears(): number[] {
  const latest = Math.max(currentSeason(), FIRST_SEASON)
  const years: number[] = []
  for (let y = latest; y >= FIRST_SEASON; y--) years.push(y)
  return years
}

export function seasonOptions(): { value: string; label: string }[] {
  return seasonYears().map((y) => ({ value: String(y), label: String(y) }))
}

/** "2023 to 2026", or just "2023" in the year the app is first published. */
export function seasonRangeLabel(): string {
  const years = seasonYears()
  const oldest = years[years.length - 1]
  const newest = years[0]
  return oldest === newest ? String(oldest) : `${oldest} to ${newest}`
}
