'use client'

import { useMemo, useCallback } from 'react'
import type { TelemetryData, TelemetryPoint } from '@/types/telemetry'
import type { ActiveMetric } from './MetricSelector'
import { normToSvg, buildCircuitPath, findSvgPointAtDistance } from './utils/buildPath'
import { metricToColor } from './utils/colorScale'
import { interpolatePosition } from './utils/interpolate'

const SVG_W = 460
const SVG_H = 300

type Props = {
  data: TelemetryData
  selectedDrivers: string[]
  metric: ActiveMetric
  progress: number        // 0..1
  hoveredProgress: number | null
  onHover: (progress: number | null) => void
}

function segmentWidth(speed: number): number {
  return 1.5 + (speed / 400) * 2.5
}

export function TrackReplayMap({
  data,
  selectedDrivers,
  metric,
  progress,
  hoveredProgress,
  onHover,
}: Props) {
  const outlinePath = useMemo(() => buildCircuitPath(data.circuit_outline), [data.circuit_outline])
  const totalDist = data.total_distance

  // Pre-compute SVG (x,y) for every circuit_outline point — used for hover
  const outlineSvgPoints = useMemo(
    () => data.circuit_outline.map((p) => normToSvg(p.x, p.y)),
    [data.circuit_outline],
  )

  // Sector label positions
  const sectorLabels = useMemo(() => {
    const { sector_1_end, sector_2_end } = data.sector_boundaries
    return [
      { label: 'S1', dist: 0 },
      { label: 'S2', dist: sector_1_end },
      { label: 'S3', dist: sector_2_end },
    ]
      .map(({ label, dist }) => {
        const pos = findSvgPointAtDistance(data.circuit_outline, dist)
        return pos ? { label, x: pos[0], y: pos[1] } : null
      })
      .filter(Boolean) as { label: string; x: number; y: number }[]
  }, [data])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const rect = (e.currentTarget as SVGRectElement).ownerSVGElement?.getBoundingClientRect()
      if (!rect) return
      const mx = ((e.clientX - rect.left) / rect.width) * SVG_W
      const my = ((e.clientY - rect.top) / rect.height) * SVG_H
      // Find nearest circuit outline point
      let minDist = Infinity
      let bestIdx = 0
      outlineSvgPoints.forEach(([px, py], i) => {
        const d = (px - mx) ** 2 + (py - my) ** 2
        if (d < minDist) { minDist = d; bestIdx = i }
      })
      const nearestCircuitPoint = data.circuit_outline[bestIdx]
      onHover(nearestCircuitPoint && totalDist > 0 ? nearestCircuitPoint.distance / totalDist : null)
    },
    [outlineSvgPoints, data.circuit_outline, totalDist, onHover],
  )

  // Memoized so multiDriverSegments and carDots don't recompute on every rAF frame
  const activeDrivers = useMemo(
    () => data.drivers.filter((d) => selectedDrivers.includes(d.driver_code)),
    [data.drivers, selectedDrivers],
  )

  const multiDriver = activeDrivers.length > 1

  // For single driver: heatmap line from first driver's points
  const primaryDriver = activeDrivers[0] ?? null

  const heatmapSegments = useMemo(() => {
    if (!primaryDriver || multiDriver) return []
    const pts = primaryDriver.points
    const segs: { x1: number; y1: number; x2: number; y2: number; colour: string; w: number }[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]
      const [x1, y1] = normToSvg(p.x, p.y)
      const [x2, y2] = normToSvg(pts[i + 1].x, pts[i + 1].y)
      segs.push({
        x1, y1, x2, y2,
        colour: metricToColor(metric, p.speed, p.throttle, p.brake, p.gear),
        w: metric === 'brake' ? (p.brake ? 4 : 2) : 3,
      })
    }
    return segs
  }, [primaryDriver, metric, multiDriver])

  // For multi-driver: each driver gets team-colour line, weight varies with speed
  const multiDriverSegments = useMemo(() => {
    if (!multiDriver) return []
    return activeDrivers.map((d) => {
      const pts = d.points
      const segs: { x1: number; y1: number; x2: number; y2: number; colour: string; w: number }[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        const p: TelemetryPoint = pts[i]
        const [x1, y1] = normToSvg(p.x, p.y)
        const [x2, y2] = normToSvg(pts[i + 1].x, pts[i + 1].y)
        segs.push({ x1, y1, x2, y2, colour: d.team_colour, w: segmentWidth(p.speed) })
      }
      return { code: d.driver_code, colour: d.team_colour, segs }
    })
  }, [activeDrivers, multiDriver])

  // Car dot positions at current progress
  const carDots = useMemo(() => {
    const effectiveProgress = (hoveredProgress != null && isFinite(hoveredProgress)) ? hoveredProgress : progress
    return activeDrivers
      .filter((d) => d.points.length > 0)
      .map((d) => {
        const pos = interpolatePosition(d.points, effectiveProgress)
        const [sx, sy] = normToSvg(pos.x, pos.y)
        return { code: d.driver_code, colour: d.team_colour, sx, sy }
      })
  }, [activeDrivers, progress, hoveredProgress])

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-[4px] overflow-hidden">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ display: 'block' }}
      >
        {/* Grey circuit outline */}
        <path
          d={outlinePath}
          fill="none"
          stroke="#252D3A"
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Single-driver heatmap */}
        {!multiDriver && heatmapSegments.map((s, i) => (
          <line
            key={i}
            x1={s.x1} y1={s.y1}
            x2={s.x2} y2={s.y2}
            stroke={s.colour}
            strokeWidth={s.w}
            strokeLinecap="round"
          />
        ))}

        {/* Multi-driver team-colour lines */}
        {multiDriver && multiDriverSegments.map((d) =>
          d.segs.map((s, i) => (
            <line
              key={`${d.code}-${i}`}
              x1={s.x1} y1={s.y1}
              x2={s.x2} y2={s.y2}
              stroke={s.colour}
              strokeWidth={s.w}
              strokeLinecap="round"
              strokeOpacity={0.85}
            />
          ))
        )}

        {/* Sector labels */}
        {sectorLabels.map((sl) => (
          <text
            key={sl.label}
            x={sl.x + 6}
            y={sl.y - 4}
            fontSize={9}
            fontFamily="var(--font-barlow-condensed), sans-serif"
            fontWeight="700"
            fill="#8A94A6"
            textAnchor="start"
          >
            {sl.label}
          </text>
        ))}

        {/* Car dots (glow + filled) */}
        {carDots.map((dot) => (
          <g key={dot.code}>
            <circle cx={dot.sx} cy={dot.sy} r={9} fill="none" stroke={dot.colour} strokeWidth={1} opacity={0.4} />
            <circle cx={dot.sx} cy={dot.sy} r={5} fill={dot.colour} stroke="white" strokeWidth={1.5} />
          </g>
        ))}

        {/* Invisible hover capture rect */}
        <rect
          x={0} y={0}
          width={SVG_W} height={SVG_H}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => onHover(null)}
          style={{ cursor: 'crosshair' }}
        />
      </svg>
    </div>
  )
}
