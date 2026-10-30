/**
 * Recon Laps on the site: one per circuit, built by scripts/recon/build_recon.py
 * from the previous season's pole lap into public/recon/<slug>.json. A circuit
 * is listed here once its file is published; /recon/<slug> exists only for
 * these, and /races links the matching Grand Prix to it.
 */
export type ReconEntry = {
  slug: string
  /** OpenF1 circuit_short_name, as the race list carries it. */
  circuit: string
  /** The season whose Grand Prix the lap prepares (the pole lap is from the year before). */
  forYear: number
  place: string
  /** The landing's card for it shows until this date (the weekend's Monday), as of the build. */
  cardUntil?: string
}

export const RECONS: ReconEntry[] = [
  { slug: 'interlagos', circuit: 'Interlagos', forYear: 2026, place: 'São Paulo', cardUntil: '2026-11-09' },
]

export const reconHref = (slug: string) => `/recon/${slug}`

/** The Recon Lap for a Grand Prix of the race list, if there is one for its circuit and season. */
export function reconFor(race: { circuit_short_name?: string | null; year?: number | null }): ReconEntry | null {
  const c = (race.circuit_short_name ?? '').toLowerCase()
  return RECONS.find((r) => r.circuit.toLowerCase() === c && r.forYear === race.year) ?? null
}

/** The Recon Lap the landing features: the first whose card date has not passed (at build time; "/" is static). */
export function featuredRecon(now = Date.now()): ReconEntry | null {
  return RECONS.find((r) => r.cardUntil && now < Date.parse(`${r.cardUntil}T00:00:00Z`)) ?? null
}
