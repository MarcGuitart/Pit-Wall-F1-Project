/**
 * A race's headline name: the host city (OpenF1 `location`), as the season
 * grid shows it, falling back to the circuit. Never `meeting_name` or
 * `country_name`: both are wrong for at least one meeting (2026 Kuala Lumpur
 * reads "Bahrain Grand Prix", "Bahrain") — Block 27b.
 */
export function placeOf(x: { location?: string | null; circuit_short_name?: string | null } | null | undefined): string {
  return x?.location?.trim() || x?.circuit_short_name?.trim() || 'TBC'
}
