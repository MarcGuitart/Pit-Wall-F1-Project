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
  Lusail: 'Qatar',
  Sakhir: 'Bahrain',
  'Miami Gardens': 'Miami',
}

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
