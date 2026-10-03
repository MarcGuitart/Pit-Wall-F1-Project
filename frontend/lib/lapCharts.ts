/**
 * The lap-by-lap race charts — lap-time evolution, gap to a reference, tyre
 * degradation and the fuel model — as pure functions over one shape of input,
 * so the live page (fed by the SSE snapshot) and the race page (fed by the
 * published analysis) compute them identically.
 *
 * Nothing here predicts. Every number is a reading of laps that have been
 * completed, and every exclusion is stated in the chart that applies it.
 */

export type ChartLap = { lap: number; time: number; pitOut: boolean; pitIn: boolean }

export type ChartStint = {
  stint_number: number
  compound: string | null
  lap_start: number | null
  lap_end: number | null
  tyre_age_at_start: number | null
}

export type ChartDriver = {
  number: number
  code: string
  colour: string
  /** classification or current running order — the legend's order */
  position: number | null
  laps: ChartLap[]
  stints: ChartStint[]
}

export type NeutralBand = { kind: 'SC' | 'VSC' | 'RED'; from: number; to: number }

export type Point = [number, number]
export type Series = { code: string; colour: string; dashed: boolean; points: Point[]; value: string; markers?: Point[] }

// ── shared ──────────────────────────────────────────────────────────────────

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Team-mates share a colour; the second car of each team is drawn dashed. */
export function dashedSet(drivers: ChartDriver[]): Set<string> {
  const seen = new Set<string>()
  const dashed = new Set<string>()
  for (const d of [...drivers].sort((a, b) => a.number - b.number)) {
    const c = d.colour.toLowerCase()
    if (seen.has(c)) dashed.add(d.code)
    seen.add(c)
  }
  return dashed
}

export function formatLap(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

/** Consecutive neutralised laps grouped into bands, typed where race control says how. */
export function bandsFromLaps(laps: number[], kindOf: (lap: number) => NeutralBand['kind'] = () => 'SC'): NeutralBand[] {
  const sorted = Array.from(new Set(laps)).sort((a, b) => a - b)
  const out: NeutralBand[] = []
  for (const lap of sorted) {
    const kind = kindOf(lap)
    const last = out[out.length - 1]
    if (last && last.kind === kind && lap === last.to + 1) last.to = lap
    else out.push({ kind, from: lap, to: lap })
  }
  return out
}

function neutralSet(bands: NeutralBand[]): Set<number> {
  const s = new Set<number>()
  for (const b of bands) for (let l = b.from; l <= b.to; l++) s.add(l)
  return s
}

// ── lap-time evolution ──────────────────────────────────────────────────────

export const SLOW_LAP_FACTOR = 1.08

export function lapTimeEvolution(drivers: ChartDriver[]) {
  const dashed = dashedSet(drivers)
  const valid = (l: ChartLap) => l.lap > 1 && !l.pitOut && !l.pitIn && l.time > 0
  const fieldMedian = median(drivers.flatMap(d => d.laps.filter(valid).map(l => l.time)))
  const ceiling = fieldMedian == null ? null : fieldMedian * SLOW_LAP_FACTOR
  const series: Series[] = drivers.map(d => {
    const pts = d.laps.filter(valid).map(l => [l.lap, l.time] as Point)
    const inFrame = ceiling == null ? pts : pts.filter(p => p[1] <= ceiling)
    return {
      code: d.code, colour: d.colour, dashed: dashed.has(d.code), points: pts,
      value: formatLap(median(inFrame.map(p => p[1]))),
    }
  })
  const inFrameTimes = series.flatMap(s => s.points.map(p => p[1])).filter(t => ceiling == null || t <= ceiling)
  const yMin = inFrameTimes.length ? Math.min(...inFrameTimes) : 0
  return { series, ceiling, yDomain: [yMin - 0.3, (ceiling ?? yMin + 1) + 0.2] as [number, number] }
}

// ── gap to reference ────────────────────────────────────────────────────────

/** Cumulative race time per completed lap — only while the laps are contiguous. */
export function cumulative(d: ChartDriver): Map<number, number> {
  const out = new Map<number, number>()
  const byLap = new Map(d.laps.map(l => [l.lap, l.time]))
  let sum = 0
  for (let lap = 1; byLap.has(lap); lap++) {
    sum += byLap.get(lap) as number
    out.set(lap, sum)
  }
  return out
}

export type GapReference = { kind: 'leader' } | { kind: 'driver'; code: string }

export function gapToReference(drivers: ChartDriver[], ref: GapReference) {
  const dashed = dashedSet(drivers)
  const cum = new Map(drivers.map(d => [d.code, cumulative(d)]))
  const maxLap = Math.max(0, ...Array.from(cum.values()).map(m => m.size))
  const refAt = (lap: number): number | null => {
    if (ref.kind === 'driver') return cum.get(ref.code)?.get(lap) ?? null
    let best: number | null = null
    cum.forEach(m => {
      const v = m.get(lap)
      if (v != null && (best == null || v < best)) best = v
    })
    return best
  }
  const series: Series[] = drivers.map(d => {
    const mine = cum.get(d.code) as Map<number, number>
    const pts: Point[] = []
    for (let lap = 1; lap <= maxLap; lap++) {
      const a = mine.get(lap)
      const r = refAt(lap)
      if (a != null && r != null) pts.push([lap, a - r])
    }
    const pitLaps = new Set(d.laps.filter(l => l.pitIn).map(l => l.lap))
    const last = pts[pts.length - 1]
    return {
      code: d.code, colour: d.colour, dashed: dashed.has(d.code), points: pts,
      markers: pts.filter(p => pitLaps.has(p[0])),
      value: last == null ? '—' : last[1] === 0 ? '0.000' : `+${last[1].toFixed(last[1] < 1 ? 3 : 2)}`,
    }
  })
  return { series, maxLap }
}

// ── fuel model ──────────────────────────────────────────────────────────────

/** The textbook values. Fuel and tyre wear move lap time together on every
 *  lap of a stint, so this race's own effect is not separable from its laps —
 *  the model says it uses the default rather than pretending to a fit. */
export const FUEL_EFFECT_MS_PER_KG = 55
export const FUEL_START_KG = 110

export function fuelModel(totalLaps: number) {
  const laps = Math.max(1, totalLaps)
  const perLapKg = FUEL_START_KG / laps
  const perLapMs = FUEL_EFFECT_MS_PER_KG * perLapKg
  const overRaceS = (perLapMs * (laps - 1)) / 1000
  const curve: Point[] = Array.from({ length: laps }, (_, i) => [i + 1, (perLapMs * i) / 1000])
  return { effectMsPerKg: FUEL_EFFECT_MS_PER_KG, startKg: FUEL_START_KG, perLapKg, perLapMs, overRaceS, curve, laps, source: 'default' as const }
}

/** Lap time corrected to race-end fuel: the time it would have been on empty tanks. */
export function fuelCorrected(time: number, lap: number, totalLaps: number) {
  const { perLapMs } = fuelModel(totalLaps)
  return time - (perLapMs * Math.max(0, totalLaps - lap)) / 1000
}

// ── tyre degradation ────────────────────────────────────────────────────────

export type StintFit = {
  code: string
  colour: string
  dashed: boolean
  stint: number
  compound: string
  points: Point[]          // [tyre age, fuel-corrected lap time]
  slope: number            // s per lap of tyre age
  intercept: number
  r2: number
  ci: number               // ± half-width of the slope's 95 % interval
  cliffAge: number | null
  medianTime: number
}

function ols(points: Point[]) {
  const n = points.length
  const mx = points.reduce((a, p) => a + p[0], 0) / n
  const my = points.reduce((a, p) => a + p[1], 0) / n
  let sxx = 0, sxy = 0, syy = 0
  for (const [x, y] of points) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2 }
  const slope = sxx ? sxy / sxx : 0
  const intercept = my - slope * mx
  const sse = points.reduce((a, [x, y]) => a + (y - (intercept + slope * x)) ** 2, 0)
  const r2 = syy ? 1 - sse / syy : 0
  const se = n > 2 && sxx ? Math.sqrt(sse / (n - 2) / sxx) : Infinity
  return { slope, intercept, r2, sse, se }
}

// two-sided 95 % t quantiles for small samples; 1.96 beyond the table
const T95 = [0, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09]

export const MIN_STINT_LAPS = 5

export function tyreDegradation(drivers: ChartDriver[], bands: NeutralBand[], totalLaps: number) {
  const dashed = dashedSet(drivers)
  const neutral = neutralSet(bands)
  const fits: StintFit[] = []
  for (const d of drivers) {
    for (const st of d.stints) {
      if (st.lap_start == null) continue
      const end = st.lap_end ?? Math.max(0, ...d.laps.map(l => l.lap))
      const laps = d.laps.filter(l => l.lap >= (st.lap_start as number) && l.lap <= end
        && l.lap > 1 && !l.pitIn && !l.pitOut && !neutral.has(l.lap))
      const med = median(laps.map(l => l.time))
      if (med == null) continue
      const clean = laps.filter(l => l.time <= med * 1.07)
      if (clean.length < MIN_STINT_LAPS) continue
      const age0 = st.tyre_age_at_start ?? 0
      const pts: Point[] = clean.map(l => [age0 + (l.lap - (st.lap_start as number)) + 1, fuelCorrected(l.time, l.lap, totalLaps)])
      const f = ols(pts)
      // A cliff: a two-line fit that explains the stint much better than one,
      // with the second line clearly steeper. Needs three laps either side.
      let cliffAge: number | null = null
      let bestSse = f.sse
      for (let k = 3; k <= pts.length - 3; k++) {
        const a = ols(pts.slice(0, k)), b = ols(pts.slice(k))
        if (a.sse + b.sse < bestSse * 0.6 && b.slope > a.slope + 0.05) { bestSse = a.sse + b.sse; cliffAge = pts[k][0] }
      }
      const t = T95[pts.length - 2] ?? 1.96
      fits.push({
        code: d.code, colour: d.colour, dashed: dashed.has(d.code), stint: st.stint_number,
        compound: (st.compound ?? '?').toUpperCase(), points: pts,
        slope: f.slope, intercept: f.intercept, r2: f.r2, ci: Number.isFinite(f.se) ? t * f.se : Infinity,
        cliffAge, medianTime: median(pts.map(p => p[1])) as number,
      })
    }
  }
  const usable = fits.filter(f => Number.isFinite(f.ci))
  const medR2 = median(usable.map(f => f.r2)) ?? 0
  const confidence: 'High' | 'Medium' | 'Low' =
    usable.length >= 10 && medR2 >= 0.3 ? 'High' : usable.length >= 3 ? 'Medium' : 'Low'
  return { fits, confidence }
}

// ── adapters ────────────────────────────────────────────────────────────────

/** The live snapshot's dashboard block → chart input. */
export function driversFromLive(args: {
  lapTimes: Record<string, [number, number, boolean][]>
  stints: Record<string, ChartStint[]>
  pitLaps: Record<string, number[]>
  meta: { number: number; code: string; colour: string | null; position: number | null }[]
}): ChartDriver[] {
  return args.meta
    .filter(m => (args.lapTimes[String(m.number)] ?? []).length)
    .map(m => {
      const pits = new Set(args.pitLaps[String(m.number)] ?? [])
      return {
        number: m.number, code: m.code, colour: m.colour ? `#${m.colour.replace('#', '')}` : '#8A94A6',
        position: m.position,
        laps: (args.lapTimes[String(m.number)] ?? []).map(([lap, time, pitOut]) => ({ lap, time, pitOut, pitIn: pits.has(lap) })),
        stints: args.stints[String(m.number)] ?? [],
      }
    })
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
}
