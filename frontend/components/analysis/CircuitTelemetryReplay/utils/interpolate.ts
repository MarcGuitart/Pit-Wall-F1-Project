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

export function getInterpolatedValueAtProgress(
  points: TelemetryPoint[],
  progress: number,
  field: keyof TelemetryPoint,
): number {
  if (!points.length) return 0
  if (progress <= 0) return Number(points[0][field] ?? 0)
  if (progress >= 1) return Number(points[points.length - 1][field] ?? 0)

  const total = points[points.length - 1].distance
  if (!total) return Number(points[0][field] ?? 0)
  const target = progress * total

  let i = 0
  while (i < points.length - 1 && points[i + 1].distance < target) i++

  const from = points[i]
  const to = points[Math.min(i + 1, points.length - 1)]
  const fromValue = Number(from[field] ?? 0)
  const toValue = Number(to[field] ?? fromValue)
  const segDist = to.distance - from.distance
  const t = segDist === 0 ? 0 : (target - from.distance) / segDist
  const value = fromValue + (toValue - fromValue) * t

  return Number.isFinite(value) ? value : fromValue
}

export function getInterpolatedPointAtProgress(
  points: TelemetryPoint[],
  progress: number,
): TelemetryPoint | null {
  if (!points.length) return null
  if (progress <= 0) return points[0]
  if (progress >= 1) return points[points.length - 1]

  const total = points[points.length - 1].distance
  if (!total) return points[0]
  const target = progress * total

  let i = 0
  while (i < points.length - 1 && points[i + 1].distance < target) i++

  const from = points[i]
  const to = points[Math.min(i + 1, points.length - 1)]
  const segDist = to.distance - from.distance
  const t = segDist === 0 ? 0 : (target - from.distance) / segDist
  const lerp = (a: number | null | undefined, b: number | null | undefined) => {
    const av = Number(a ?? 0)
    const bv = Number(b ?? av)
    return av + (bv - av) * t
  }

  return {
    ...from,
    distance: target,
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    speed: lerp(from.speed, to.speed),
    throttle: lerp(from.throttle, to.throttle),
    brake: t < 0.5 ? from.brake : to.brake,
    gear: Math.round(lerp(from.gear, to.gear)),
    drs: t < 0.5 ? from.drs : to.drs,
    lat_g: lerp(from.lat_g, to.lat_g),
    lon_g: lerp(from.lon_g, to.lon_g),
    lap_number: t < 0.5 ? from.lap_number : to.lap_number,
    race_time: lerp(from.race_time, to.race_time),
  }
}
