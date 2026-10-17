/**
 * The one table of names shown for a place, keyed on OpenF1's `location`.
 * The data is never changed — /races, the meta and the live snapshot keep
 * OpenF1's value; only what is displayed goes through here. A location not in
 * the table is shown as OpenF1 gives it.
 *
 * Only this file reads `.location` (lib/displayName.test.ts fails otherwise):
 * callers pass the object, so no screen can show the raw value by accident.
 */
export const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  'Marina Bay': 'Singapore',
  'Yas Island': 'Abu Dhabi',
  'Yas Marina': 'Abu Dhabi',
  'Monte Carlo': 'Monaco',
  Lusail: 'Qatar',
  Sakhir: 'Bahrain',
  'Miami Gardens': 'Miami',
}

/**
 * Locations OpenF1 uses (2023–2026) that are shown exactly as given. Not used
 * at run time — an unknown location is still shown as given — but the test
 * against test/fixtures/openf1_locations_2023_2026.json fails on a location
 * in neither list, which is how the next rename gets noticed.
 */
export const PASSTHROUGH: readonly string[] = [
  'Austin', 'Bahrain', 'Baku', 'Barcelona', 'Budapest', 'Imola', 'Jeddah', 'Kuala Lumpur',
  'Las Vegas', 'Madrid', 'Melbourne', 'Mexico City', 'Miami', 'Monaco', 'Montréal', 'Monza',
  'Shanghai', 'Silverstone', 'Spa-Francorchamps', 'Spielberg', 'Suzuka', 'São Paulo', 'Zandvoort',
]

type HasLocation = { location?: string | null } | null | undefined

/** The displayed name of a location string, or null when there is none. */
export function displayName(location: string | null | undefined): string | null {
  const raw = location?.trim()
  if (!raw) return null
  return DISPLAY_NAMES[raw] ?? raw
}

/** The displayed name of an object's location (a race, a session meta, a live snapshot). */
export function displayNameOf(x: HasLocation): string | null {
  return displayName(x?.location)
}

/**
 * A race's headline: its displayed place, else the circuit. Never
 * `meeting_name` or `country_name`, both wrong for at least one meeting
 * (2026 Kuala Lumpur reads "Bahrain Grand Prix", "Bahrain").
 */
export function placeOf(x: (HasLocation & { circuit_short_name?: string | null }) | null | undefined): string {
  return displayNameOf(x) ?? (x?.circuit_short_name?.trim() || 'TBC')
}
