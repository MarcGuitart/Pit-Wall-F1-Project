import type { TelemetryPoint } from '@/types/telemetry'

export function interpolatePosition(
  points: TelemetryPoint[],
  progress: number,
): { x: number; y: number } {
  if (!points || points.length === 0) return { x: 0, y: 0 }
  if (progress <= 0) return { x: points[0].x, y: points[0].y }
  if (progress >= 1) return { x: points[points.length - 1].x, y: points[points.length - 1].y }
  const totalDist = points[points.length - 1].distance
  if (!totalDist || totalDist === 0) return { x: points[0].x, y: points[0].y }
  const targetDist = progress * totalDist

  let i = 0
  while (i < points.length - 1 && points[i + 1].distance < targetDist) i++

  const from = points[i]
  const to = points[Math.min(i + 1, points.length - 1)]
  const segDist = to.distance - from.distance
  const t = segDist === 0 ? 0 : (targetDist - from.distance) / segDist

  const x = from.x + (to.x - from.x) * t
  const y = from.y + (to.y - from.y) * t
  if (isNaN(x) || isNaN(y)) return { x: 0, y: 0 }
  return { x, y }
}

export function getValueAtProgress(
  points: TelemetryPoint[],
  progress: number,
  field: keyof TelemetryPoint,
): number | boolean {
  if (!points.length) return 0
  const total = points[points.length - 1].distance
  const target = progress * total
  let i = points.findIndex((p) => p.distance >= target)
  if (i < 0) i = points.length - 1
  return points[i][field] as number | boolean
}
