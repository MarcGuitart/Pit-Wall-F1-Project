import type { CircuitPoint } from '@/types/telemetry'

const PAD = 20
const SVG_W = 420
const SVG_H = 260

export function normToSvg(x: number, y: number): [number, number] {
  return [
    ((x + 1) / 2) * SVG_W + PAD,
    (1 - (y + 1) / 2) * SVG_H + PAD,
  ]
}

export function buildCircuitPath(points: CircuitPoint[]): string {
  if (!points.length) return ''
  const [sx, sy] = normToSvg(points[0].x, points[0].y)
  const d = [`M${sx.toFixed(1)},${sy.toFixed(1)}`]
  for (let i = 1; i < points.length; i++) {
    const [x, y] = normToSvg(points[i].x, points[i].y)
    d.push(`L${x.toFixed(1)},${y.toFixed(1)}`)
  }
  d.push('Z')
  return d.join(' ')
}

export function findSvgPointAtDistance(
  points: CircuitPoint[],
  targetDistance: number,
): [number, number] | null {
  if (!points.length) return null
  let closest = points[0]
  let minDiff = Math.abs(points[0].distance - targetDistance)
  for (const p of points) {
    const diff = Math.abs(p.distance - targetDistance)
    if (diff < minDiff) {
      minDiff = diff
      closest = p
    }
  }
  return normToSvg(closest.x, closest.y)
}
