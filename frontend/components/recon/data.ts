/**
 * Recon Lap data (scripts/recon/build_recon.py → public/recon/<slug>.json).
 * No three.js here: the page, the HUD, the minimap and the still read it too.
 *
 * Frame: metres, x east, y north, z height above the lap's lowest point.
 * Distances (s) are scaled to the official lap length; the geometry is not.
 */

export type BrakingZone = {
  /** BZ number, in lap order. Not the FIA's turn number. */
  id: number
  from: number
  to: number
  /** Where the minimum speed is reached. */
  apex: number
  fromSpeed: number
  minSpeed: number
  drop: number
  /** Gear at the minimum speed. */
  gear: number
  /** First to last brake sample, seconds. null when the lap has no brake signal (zones found from the speed). */
  seconds: number | null
}

/** [s, speed, gear, brake 0|1, throttle, time into the lap] per car_data sample. */
export type TraceRow = [number, number, number, 0 | 1, number, number]

export type Recon = {
  slug: string
  circuit: string
  event: string
  location: string | null
  for_year: number
  year: number
  session_key: number
  lap: { driver: string; driver_name: string; number: number; time: number; session: string; kind: 'pole' }
  length_m: number
  measured_m: number
  length_source: string | null
  elevation_m: number
  line: [number, number, number][]
  line_s: number[]
  zones: BrakingZone[]
  /** How the zones were found: the brake channel, or (a lap without one) the speed falling. Older files: brake. */
  zones_by?: 'brake' | 'speed'
  trace: TraceRow[]
  source: string
  note: string
}

export const loadRecon = (slug: string): Promise<Recon> =>
  fetch(`/recon/${slug}.json`).then((r) => { if (!r.ok) throw new Error(`recon ${slug}: ${r.status}`); return r.json() })

const at = (tr: TraceRow[], x: number, col: 0 | 5) => {
  let i = 0
  while (i < tr.length - 1 && tr[i + 1][col] < x) i++
  const a = tr[i], b = tr[Math.min(i + 1, tr.length - 1)]
  return { a, b, u: b[col] === a[col] ? 0 : Math.max(0, Math.min(1, (x - a[col]) / (b[col] - a[col]))) }
}

/** The lap's channels at arc length s. */
export function traceAt(tr: TraceRow[], s: number) {
  const { a, b, u } = at(tr, s, 0)
  return {
    speed: a[1] + u * (b[1] - a[1]),
    gear: u < 0.5 ? a[2] : b[2],
    brake: (u < 0.5 ? a[3] : b[3]) === 1,
    throttle: a[4] + u * (b[4] - a[4]),
    time: a[5] + u * (b[5] - a[5]),
  }
}

/** Arc length at time t into the lap. */
export function sAtTime(tr: TraceRow[], t: number): number {
  const { a, b, u } = at(tr, t, 5)
  return a[0] + u * (b[0] - a[0])
}

export function timeAtS(tr: TraceRow[], s: number): number {
  const { a, b, u } = at(tr, s, 0)
  return a[5] + u * (b[5] - a[5])
}

/**
 * The fluid lap: real time x `speed`, with no holds. Returns the arc length
 * reached `wall` seconds after it starts, `from` metres in (a lap begun at a zone).
 */
export function lapPlayer(r: Recon, speed = 6) {
  const tr = r.trace
  const lapT = tr[tr.length - 1][5]
  const total = lapT / speed
  return {
    total,
    /** Arc length after `wall` seconds, starting at arc length `from`; wraps at the line. */
    at(wall: number, from = 0): number {
      const t0 = timeAtS(tr, Math.max(0, Math.min(from, tr[tr.length - 1][0])))
      const t = (t0 + wall * speed) % lapT
      return sAtTime(tr, t)
    },
  }
}

/** The zone a lap at arc length s is heading for: the first whose minimum speed is still ahead (the first again after the last). */
export const zoneAhead = (r: Recon, s: number): number => {
  const i = r.zones.findIndex((z) => z.apex >= s - 20)
  return i < 0 ? 0 : i
}

/** Samples per second of the car data, from the first to the last sample of the lap. */
export function sampleRate(tr: TraceRow[]): number {
  const span = tr[tr.length - 1][5] - tr[0][5]
  return span > 0 ? (tr.length - 1) / span : 0
}

/** Height above the lap's lowest point at arc length s, metres, along the recorded (smoothed) line. */
export function heightAt(r: Recon, s: number): number {
  const L = r.length_m, ss = r.line_s, n = ss.length
  const x = ((s % L) + L) % L
  let i = 0
  while (i < n - 1 && ss[i + 1] <= x) i++
  const j = (i + 1) % n, end = j === 0 ? L : ss[j]
  const u = Math.max(0, Math.min(1, (x - ss[i]) / (end - ss[i] || 1)))
  return r.line[i][2] + u * (r.line[j][2] - r.line[i][2])
}

/**
 * What the panel shows for a zone: only figures read from the car data, or
 * derived from them by arithmetic. Distances and times come from sample to
 * sample, so each is good to about one sample step (see `stepMetres`).
 */
export type ZoneFacts = {
  id: number
  of: number
  entry: number
  min: number
  /** First to last brake sample, metres (a lap without brake signal: the stretch of hard speed loss). */
  metres: number
  /** null when the lap has no brake signal. */
  seconds: number | null
  gear: number
  /** Height at the last braking sample minus at the first, metres, from the recorded line. null without a height. */
  climb: number | null
}

export function zoneFacts(r: Recon, z: BrakingZone): ZoneFacts {
  const has = r.elevation_m > 0 && r.line.every((p) => Number.isFinite(p[2]))
  return {
    id: z.id, of: r.zones.length, entry: z.fromSpeed, min: z.minSpeed,
    metres: Math.round(z.to - z.from), seconds: z.seconds, gear: z.gear,
    climb: has ? Math.round(heightAt(r, z.to) - heightAt(r, z.from)) : null,
  }
}

/** What the camera must show for a zone: the road from the first brake sample to the minimum speed (or the last brake sample, if later). */
export const zoneFocus = (z: BrakingZone) => { const to = Math.max(z.apex, z.to); return { s: (z.from + to) / 2, from: z.from, to } }

/** Metres the car covers between two samples at `kmh`, at the lap's sample rate: the resolution of every distance and time of a zone. */
export const stepMetres = (kmh: number, hz: number) => (hz > 0 ? kmh / 3.6 / hz : 0)

export const lapClock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`

/**
 * A driver's name as the page shows it: OpenF1 writes surnames in capitals
 * ("Lando NORRIS"). Words written entirely in capitals get one initial capital,
 * also after a hyphen or an apostrophe; anything else is left as it is.
 */
export function personName(full: string | null | undefined): string | null {
  if (!full) return null
  const word = (w: string) => {
    if (w.length < 2 || w !== w.toUpperCase() || w === w.toLowerCase()) return w
    let out = '', cap = true
    for (const ch of Array.from(w)) { out += cap ? ch.toUpperCase() : ch.toLowerCase(); cap = ch === '-' || ch === "'" || ch === '’' }
    return out
  }
  return full.split(/\s+/).map(word).join(' ')
}
