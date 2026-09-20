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

/** Components in display order, with their max points (backend WEIGHTS). */
export const CHAOS_COMPONENTS: ReadonlyArray<{ key: ChaosComponentKey; label: string; short: string; weight: number }> = [
  { key: 'safety_car',          label: 'Safety Car / VSC',    short: 'SC/VSC',     weight: 30 },
  { key: 'yellow_flags',        label: 'Yellow Flags',        short: 'Yellows',    weight: 10 },
  { key: 'stewarding',          label: 'Incidents & Penalties', short: 'Stewards', weight: 20 },
  { key: 'weather',             label: 'Wet Laps',            short: 'Weather',    weight: 20 },
  { key: 'position_volatility', label: 'Position Volatility', short: 'Volatility', weight: 20 },
]

export type ChaosComponentKey = 'safety_car' | 'yellow_flags' | 'stewarding' | 'weather' | 'position_volatility'
