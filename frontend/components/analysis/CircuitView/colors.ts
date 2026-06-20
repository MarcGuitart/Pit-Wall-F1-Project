// Metric → colour scales for the Circuit View.
// Pure functions, no React. Shared by TrackMap and TelemetryChart.

import type { TelemetryMetric } from '@/types/telemetry'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function lerp(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const k = Math.max(0, Math.min(1, t))
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k)
}

const RED = '#E8001D'
const AMBER = '#FFB020'
const GREEN = '#23D18B'
const BLUE = '#4DA3FF'
const PURPLE = '#A66CFF'

export function speedColour(speed: number): string {
  if (speed <= 150) return lerp(RED, AMBER, speed / 150)
  if (speed <= 250) return lerp(AMBER, GREEN, (speed - 150) / 100)
  return GREEN
}

export function throttleColour(throttle: number): string {
  return lerp(BLUE, GREEN, throttle / 100)
}

export function gearColour(gear: number): string {
  if (gear <= 2) return PURPLE
  if (gear <= 4) return BLUE
  if (gear <= 6) return GREEN
  return AMBER
}

export const BRAKE_COLOUR = RED

// Colour for a telemetry point given the active metric (single-driver mode).
export function metricColour(
  metric: TelemetryMetric,
  point: { speed: number; throttle: number; brake: boolean; gear: number },
): string {
  switch (metric) {
    case 'SPEED':
      return speedColour(point.speed)
    case 'THROTTLE':
      return throttleColour(point.throttle)
    case 'GEAR':
      return gearColour(point.gear)
    case 'BRAKE':
      return point.brake ? BRAKE_COLOUR : throttleColour(point.throttle)
  }
}

// Legend swatches per metric for the TrackMap footer.
export function metricLegend(metric: TelemetryMetric): { label: string; colour: string }[] {
  switch (metric) {
    case 'SPEED':
      return [
        { label: '<150', colour: RED },
        { label: '~200', colour: AMBER },
        { label: '250+', colour: GREEN },
      ]
    case 'THROTTLE':
      return [
        { label: 'lift', colour: BLUE },
        { label: 'full', colour: GREEN },
      ]
    case 'GEAR':
      return [
        { label: '1–2', colour: PURPLE },
        { label: '3–4', colour: BLUE },
        { label: '5–6', colour: GREEN },
        { label: '7–8', colour: AMBER },
      ]
    case 'BRAKE':
      return [
        { label: 'braking', colour: RED },
        { label: 'on throttle', colour: GREEN },
      ]
  }
}

// ── SVG geometry: normalised (-1..1) → 600×400 viewBox with 20px padding ──

export function svgX(x: number): number {
  return ((x + 1) / 2) * 560 + 20
}

export function svgY(y: number): number {
  return (1 - (y + 1) / 2) * 360 + 20 // flip Y
}
