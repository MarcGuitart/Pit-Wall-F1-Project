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
  gear: number
  seconds: number
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
 * The automatic lap: real time × `speed`, holding `hold` seconds at every
 * braking zone's minimum. Returns where the lap is at a wall-clock time.
 */
export function timeline(r: Recon, speed = 6, hold = 1.3) {
  const tr = r.trace
  const stops = r.zones.map((z) => ({ id: z.id, t: timeAtS(tr, z.apex) }))
  const lapT = tr[tr.length - 1][5]
  const total = lapT / speed + stops.length * hold
  return {
    total,
    at(wall: number): { s: number; stop: number | null } {
      const e = ((wall % total) + total) % total
      for (let k = 0; k < stops.length; k++) {
        const reach = stops[k].t / speed + k * hold
        if (e < reach) return { s: sAtTime(tr, (e - k * hold) * speed), stop: null }
        if (e < reach + hold) return { s: sAtTime(tr, stops[k].t), stop: stops[k].id }
      }
      return { s: sAtTime(tr, Math.min(lapT, (e - stops.length * hold) * speed)), stop: null }
    },
  }
}

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
