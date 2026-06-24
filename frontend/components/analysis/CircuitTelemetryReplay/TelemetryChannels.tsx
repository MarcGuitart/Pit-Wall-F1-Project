'use client'

import { useMemo, useCallback } from 'react'
import type { TelemetryData, TelemetryPoint } from '@/types/telemetry'
import { getInterpolatedPointAtProgress, getInterpolatedValueAtProgress, getValueAtProgress } from './utils/interpolate'

const CHART_W = 340
const CHANNEL_BORDER = '#1E2430'
const CHANNEL_FLEX = {
  speed: 3,
  throttle: 2.5,
  brake: 1.8,
  gear: 1.8,
  drs: 1.2,
} as const

type ChannelDef = {
  id: keyof typeof CHANNEL_FLEX
  label: string
  viewBoxHeight: number
  yMin: number
  yMax: number
  color: string
}

const CHANNELS: ChannelDef[] = [
  { id: 'speed',    label: 'Speed',    viewBoxHeight: 80, yMin: 0, yMax: 400, color: '#23D18B' },
  { id: 'throttle', label: 'Throttle', viewBoxHeight: 64, yMin: 0, yMax: 100, color: '#4DA3FF' },
  { id: 'brake',    label: 'Brake',    viewBoxHeight: 44, yMin: 0, yMax: 1,   color: '#E8001D' },
  { id: 'gear',     label: 'Gear',     viewBoxHeight: 44, yMin: 0, yMax: 8,   color: '#A66CFF' },
  { id: 'drs',      label: 'DRS',      viewBoxHeight: 34, yMin: 0, yMax: 1,   color: '#23D18B' },
]

type Props = {
  data: TelemetryData
  selectedDrivers: string[]
  progress: number
  hoveredProgress: number | null
  onHover: (p: number | null) => void
}

function distToX(distance: number, totalDist: number): number {
  return (distance / totalDist) * CHART_W
}

function valToY(val: number, yMin: number, yMax: number, height: number): number {
  return height - ((val - yMin) / (yMax - yMin)) * height
}

function isDrsOpen(drs: number): boolean {
  return drs >= 10
}

function splitPointsAtProgress(points: TelemetryPoint[], progress: number, totalDist: number): TelemetryPoint[] {
  if (!points.length) return []
  const targetDist = Math.max(0, Math.min(1, progress)) * totalDist
  const visible = points.filter((p) => p.distance <= targetDist)
  const livePoint = getInterpolatedPointAtProgress(points, progress)
  const base = visible.length ? visible : [points[0]]
  if (!livePoint) return base
  const last = base[base.length - 1]
  if (Math.abs(last.distance - livePoint.distance) < 0.01) return base
  return [...base, livePoint]
}

function makePolylinePath(points: TelemetryPoint[], totalDist: number, valueFor: (p: TelemetryPoint) => number): string {
  return points.map((p, i) => {
    const x = distToX(p.distance, totalDist)
    const y = valueFor(p)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function TelemetryChannels({ data, selectedDrivers, progress, hoveredProgress, onHover }: Props) {
  // Memoized so liveValues doesn't recalculate on every parent render
  const activeDrivers = useMemo(
    () => data.drivers.filter((d) => selectedDrivers.includes(d.driver_code)),
    [data.drivers, selectedDrivers],
  )
  const totalDist = data.total_distance
  const { sector_1_end, sector_2_end } = data.sector_boundaries

  // Live values at cursor — recalculates only when position or active drivers change
  const effectiveProgress = (hoveredProgress != null && isFinite(hoveredProgress)) ? hoveredProgress : progress
  const cursorX = isFinite(effectiveProgress * CHART_W) ? effectiveProgress * CHART_W : 0
  const liveValues = useMemo(() => {
    const primary = activeDrivers[0]
    if (!primary) return { speed: 0, throttle: 0, brake: false, gear: 0, drs: 0 }
    const p = primary.points
    return {
      speed:    getInterpolatedValueAtProgress(p, effectiveProgress, 'speed'),
      throttle: getInterpolatedValueAtProgress(p, effectiveProgress, 'throttle'),
      brake:    getValueAtProgress(p, effectiveProgress, 'brake') as boolean,
      gear:     getValueAtProgress(p, effectiveProgress, 'gear') as number,
      drs:      getValueAtProgress(p, effectiveProgress, 'drs') as number,
    }
  }, [activeDrivers, effectiveProgress])

  const getLiveLabel = (id: string): string => {
    switch (id) {
      case 'speed':    return `${Math.round(liveValues.speed)} km/h`
      case 'throttle': return `${Math.round(liveValues.throttle)}%`
      case 'brake':    return liveValues.brake ? 'On' : 'Off'
      case 'gear':     return `${liveValues.gear}`
      case 'drs':      return isDrsOpen(liveValues.drs) ? 'Open' : 'Closed'
      default:         return ''
    }
  }

  const getLiveColor = (id: string): string => {
    if (id === 'brake') return liveValues.brake ? '#E8001D' : '#4A5568'
    if (id === 'drs')   return isDrsOpen(liveValues.drs) ? '#23D18B' : '#4A5568'
    return '#F0F2F5'
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const p = Math.max(0, Math.min(1, x / rect.width))
    onHover(p)
  }, [onHover])

  const handleMouseLeave = useCallback(() => onHover(null), [onHover])

  return (
    <div className="h-full min-h-0 flex flex-col bg-bg-elevated overflow-hidden">
      {CHANNELS.map((ch, chIdx) => {
        const isLast = chIdx === CHANNELS.length - 1
        const svgH = ch.viewBoxHeight

        return (
          <div
            key={ch.id}
            className={`min-h-0 flex flex-col ${isLast ? '' : 'border-b'}`}
            style={{ flex: CHANNEL_FLEX[ch.id], ...(isLast ? undefined : { borderColor: CHANNEL_BORDER }) }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5 shrink-0">
              <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">
                {ch.label}
              </span>
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{ color: getLiveColor(ch.id) }}
              >
                {getLiveLabel(ch.id)}
              </span>
            </div>

            {/* Chart SVG */}
            <svg
              width="100%"
              viewBox={`0 0 ${CHART_W} ${svgH}`}
              preserveAspectRatio="none"
              className="flex-1 min-h-0"
              style={{ display: 'block', height: '100%' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Sector boundary dashed lines */}
              {[sector_1_end, sector_2_end].map((dist, i) => {
                const x = distToX(dist, totalDist)
                return (
                  <line
                    key={i}
                    x1={x} y1={0} x2={x} y2={ch.viewBoxHeight}
                    stroke={CHANNEL_BORDER}
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                )
              })}

              {/* Data traces */}
              {activeDrivers.map((driver) => {
                const pts = driver.points
                if (!pts.length) return null
                const revealPts = splitPointsAtProgress(pts, effectiveProgress, totalDist)

                if (ch.id === 'brake') {
                  // Binary rects for braking
                  return (
                    <g key={driver.driver_code}>
                      {pts.map((p, i) => {
                        if (!p.brake) return null
                        const x1 = distToX(p.distance, totalDist)
                        const x2 = i < pts.length - 1
                          ? distToX(pts[i + 1].distance, totalDist)
                          : x1 + 2
                        if (p.distance > effectiveProgress * totalDist) return null
                        return (
                          <rect
                            key={i}
                            x={x1} y={2}
                            width={Math.max(1, x2 - x1)}
                            height={ch.viewBoxHeight - 4}
                            fill="rgba(232,0,29,0.65)"
                          />
                        )
                      })}
                    </g>
                  )
                }

                if (ch.id === 'drs') {
                  return (
                    <g key={driver.driver_code}>
                      {pts.map((p, i) => {
                        if (!isDrsOpen(p.drs)) return null
                        const x1 = distToX(p.distance, totalDist)
                        const x2 = i < pts.length - 1
                          ? distToX(pts[i + 1].distance, totalDist)
                          : x1 + 2
                        if (p.distance > effectiveProgress * totalDist) return null
                        return (
                          <rect
                            key={i}
                            x={x1} y={4}
                            width={Math.max(1, x2 - x1)}
                            height={ch.viewBoxHeight - 8}
                            fill="rgba(35,209,139,0.62)"
                          />
                        )
                      })}
                    </g>
                  )
                }

                if (ch.id === 'gear') {
                  // Step chart
                  const makeStepPath = (source: TelemetryPoint[]) => {
                    const d: string[] = []
                    source.forEach((p, i) => {
                      const x = distToX(p.distance, totalDist)
                      const y = valToY(p.gear, ch.yMin, ch.yMax, ch.viewBoxHeight)
                      if (i === 0) d.push(`M${x.toFixed(1)},${y.toFixed(1)}`)
                      else {
                        const prevY = valToY(source[i - 1].gear, ch.yMin, ch.yMax, ch.viewBoxHeight)
                        d.push(`L${x.toFixed(1)},${prevY.toFixed(1)}`)
                        d.push(`L${x.toFixed(1)},${y.toFixed(1)}`)
                      }
                    })
                    return d.join(' ')
                  }
                  const revealPath = makeStepPath(revealPts)
                  const c = activeDrivers.length > 1 ? driver.team_colour : ch.color
                  return (
                    <g key={driver.driver_code}>
                      <path
                        d={revealPath}
                        fill="none"
                        stroke={c}
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                    </g>
                  )
                }

                if (ch.id === 'throttle') {
                  // Filled area
                  const makeThrottle = (source: TelemetryPoint[]) => {
                    const points: string[] = []
                    source.forEach((p) => {
                      const x = distToX(p.distance, totalDist)
                      const y = valToY(p.throttle, ch.yMin, ch.yMax, ch.viewBoxHeight)
                      points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
                    })
                    const firstX = distToX(source[0].distance, totalDist)
                    const lastX = distToX(source[source.length - 1].distance, totalDist)
                    return {
                      areaPath: `M${firstX},${ch.viewBoxHeight} L${points.join(' L')} L${lastX},${ch.viewBoxHeight} Z`,
                      linePath: `M${points.join(' L')}`,
                    }
                  }
                  const reveal = makeThrottle(revealPts)
                  const c = activeDrivers.length > 1 ? driver.team_colour : ch.color
                  return (
                    <g key={driver.driver_code}>
                      <path d={reveal.areaPath} fill={c} fillOpacity={0.18} />
                      <path d={reveal.linePath} fill="none" stroke={c} strokeWidth={2} />
                    </g>
                  )
                }

                // Default: speed polyline
                const valueFor = (p: TelemetryPoint) => {
                  const field = ch.id as keyof TelemetryPoint
                  const val = p[field] as number
                  return valToY(val, ch.yMin, ch.yMax, ch.viewBoxHeight)
                }
                const revealPath = makePolylinePath(revealPts, totalDist, valueFor)
                const c = activeDrivers.length > 1 ? driver.team_colour : ch.color
                const livePoint = revealPts[revealPts.length - 1]
                const liveX = distToX(livePoint.distance, totalDist)
                const liveY = valueFor(livePoint)
                return (
                  <g key={driver.driver_code}>
                    <path
                      d={revealPath}
                      fill="none"
                      stroke={c}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                    <circle cx={liveX} cy={liveY} r={2.4} fill={c} stroke="#0B0D12" strokeWidth={1} />
                  </g>
                )
              })}

              {/* Cursor line */}
              <line
                x1={cursorX} y1={0}
                x2={cursorX} y2={ch.viewBoxHeight}
                stroke="#E8001D"
                strokeWidth={1}
                strokeOpacity={0.7}
              />

              {/* Sector labels */}
              {chIdx === 0 && (
                <g>
                  {[sector_1_end, sector_2_end].map((dist, i) => {
                    const x = distToX(dist, totalDist)
                    return (
                      <text
                        key={i}
                        x={x + 3}
                        y={10}
                        fontSize={7}
                        fill="#4A5568"
                        fontFamily="var(--font-jetbrains-mono), monospace"
                      >
                        S{i + 2}
                      </text>
                    )
                  })}
                </g>
              )}
            </svg>
          </div>
        )
      })}
    </div>
  )
}
