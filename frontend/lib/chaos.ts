/**
 * Chaos Index levels — mirror of backend/app/services/chaos_service.py
 * (THRESHOLDS, WEIGHTS, METHOD_VERSION). Change both together.
 */
export type ChaosLevel = 'Low' | 'Medium' | 'High' | 'Extreme'

export const CHAOS_METHOD_VERSION = '2.0'

/** Lower bound of each level on the 0-100 score, highest first. */
export const CHAOS_THRESHOLDS: ReadonlyArray<readonly [number, ChaosLevel]> = [
  [55, 'Extreme'],
  [32, 'High'],
  [15, 'Medium'],
  [0, 'Low'],
]

export function chaosLevel(score: number): ChaosLevel {
  for (const [floor, level] of CHAOS_THRESHOLDS) if (score >= floor) return level
  return 'Low'
}

export const CHAOS_LEVEL_COLOR: Record<ChaosLevel, string> = {
  Low: '#23D18B',
  Medium: '#4DA3FF',
  High: '#FFB020',
  Extreme: '#E8001D',
}

export const CHAOS_LEVEL_TEXT_CLASS: Record<ChaosLevel, string> = {
  Low: 'text-signal-green',
  Medium: 'text-signal-blue',
  High: 'text-signal-amber',
  Extreme: 'text-signal-red',
}

/** The same levels as design-system tones (components/ui Badge `tone`). */
export const CHAOS_LEVEL_TONE: Record<ChaosLevel, 'ok' | 'info' | 'warn' | 'accent'> = {
  Low: 'ok',
  Medium: 'info',
  High: 'warn',
  Extreme: 'accent',
}

/** Components in display order, with their max points (backend WEIGHTS). */
export const CHAOS_COMPONENTS: ReadonlyArray<{ key: ChaosComponentKey; label: string; short: string; weight: number }> = [
  { key: 'safety_car',          label: 'Safety Car / VSC',    short: 'SC/VSC',     weight: 30 },
  { key: 'yellow_flags',        label: 'Yellow Flags',        short: 'Yellows',    weight: 10 },
  { key: 'stewarding',          label: 'Incidents & Penalties', short: 'Stewards', weight: 20 },
  { key: 'weather',             label: 'Wet Laps',            short: 'Weather',    weight: 20 },
  { key: 'position_volatility', label: 'Position Volatility', short: 'Volatility', weight: 20 },
]

export type ChaosComponentKey = 'safety_car' | 'yellow_flags' | 'stewarding' | 'weather' | 'position_volatility'

/**
 * The method 2.0 formula itself (block 37, the landing's Q4 demo), mirrored
 * from chaos_service.py: WEIGHTS, FULL_SCALE and the scoring
 *   score = min(100, round(Σ round(weight · min(1, raw / full_scale), 1)))
 * lib/chaos.drift.test.ts reads chaos_service.py and fails if they differ.
 */
export const CHAOS_WEIGHTS: Readonly<Record<ChaosComponentKey, number>> = {
  safety_car: 30,
  yellow_flags: 10,
  stewarding: 20,
  weather: 20,
  position_volatility: 20,
}

export const CHAOS_FULL_SCALE: Readonly<Record<ChaosComponentKey, number>> = {
  safety_car: 0.25,
  yellow_flags: 0.12,
  stewarding: 0.4,
  weather: 0.75,
  position_volatility: 0.12,
}

/** Python's round(): halves go to the even neighbour. */
export function roundHalfEven(value: number, digits = 0): number {
  const f = 10 ** digits
  const x = value * f
  const r = Math.round(x)
  const isHalf = Math.abs(Math.abs(x - Math.trunc(x)) - 0.5) < 1e-9
  const v = isHalf ? (Math.trunc(x) % 2 === 0 ? Math.trunc(x) : Math.trunc(x) + Math.sign(x)) : r
  return v / f
}

export type ChaosRaw = Record<ChaosComponentKey, number>

export function chaosPoints(raw: ChaosRaw): Record<ChaosComponentKey, number> {
  const out = {} as Record<ChaosComponentKey, number>
  for (const key of Object.keys(CHAOS_WEIGHTS) as ChaosComponentKey[]) {
    const full = CHAOS_FULL_SCALE[key]
    const normalized = full > 0 ? Math.min(1, Math.max(0, raw[key]) / full) : 0
    out[key] = roundHalfEven(normalized * CHAOS_WEIGHTS[key], 1)
  }
  return out
}

export function chaosScore(raw: ChaosRaw): number {
  const sum = Object.values(chaosPoints(raw)).reduce((a, b) => a + b, 0)
  return Math.min(100, roundHalfEven(sum))
}
