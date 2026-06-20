'use client'

import { useMemo, useRef } from 'react'
import type { DriverTelemetry, TelemetryData, TelemetryMetric } from '@/types/telemetry'
import { metricColour, svgX, svgY } from './colors'

type Props = {
  data: TelemetryData
  selectedDrivers: string[]
  metric: TelemetryMetric
  hoveredDistance: number | null
  onHover: (distance: number | null) => void
}

function findNearestByDistance(driver: DriverTelemetry, distance: number) {
  let best = driver.points[0]
  let bestDelta = Infinity
  for (const p of driver.points) {
    const d = Math.abs(p.distance - distance)
    if (d < bestDelta) {
      bestDelta = d
      best = p
    }
  }
  return best
}

export function TrackMap({ data, selectedDrivers, metric, hoveredDistance, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  const selected = useMemo(
    () => data.drivers.filter((d) => selectedDrivers.includes(d.driver_code)),
    [data.drivers, selectedDrivers],
  )
  const singleMode = selected.length === 1

  // Outline path
  const outlinePath = useMemo(() => {
    if (!data.circuit_outline.length) return ''
    return data.circuit_outline
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${svgX(p.x).toFixed(1)} ${svgY(p.y).toFixed(1)}`)
      .join(' ')
  }, [data.circuit_outline])

  // Sector label anchor points (nearest outline point to each boundary distance)
  const sectorLabels = useMemo(() => {
    const { sector_1_end, sector_2_end } = data.sector_boundaries
    const anchors = [
      { label: 'S1', distance: 0 },
      { label: 'S2', distance: sector_1_end },
      { label: 'S3', distance: sector_2_end },
    ]
    return anchors.map((a) => {
      let best = data.circuit_outline[0]
      let bestDelta = Infinity
      for (const p of data.circuit_outline) {
        const d = Math.abs(p.distance - a.distance)
        if (d < bestDelta) {
          bestDelta = d
          best = p
        }
      }
      return { label: a.label, x: svgX(best?.x ?? 0), y: svgY(best?.y ?? 0) }
    })
  }, [data.circuit_outline, data.sector_boundaries])

  const handleMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    // Map client coords into viewBox coords (600x400)
    const vx = ((e.clientX - rect.left) / rect.width) * 600
    const vy = ((e.clientY - rect.top) / rect.height) * 400
    // Find nearest outline point by euclidean distance in viewBox space
    let best = data.circuit_outline[0]
    let bestDelta = Infinity
    for (const p of data.circuit_outline) {
      const dx = svgX(p.x) - vx
      const dy = svgY(p.y) - vy
      const d = dx * dx + dy * dy
      if (d < bestDelta) {
        bestDelta = d
        best = p
      }
    }
    if (best) onHover(best.distance)
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 600 400"
      className="w-full h-auto"
      style={{ display: 'block', background: '#05060A', borderRadius: 4 }}
    >
      {/* Circuit outline */}
      <path d={outlinePath} stroke="#252D3A" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Driver telemetry lines */}
      {selected.map((driver) => {
        const pts = driver.points
        return pts.slice(1).map((p, i) => {
          const prev = pts[i]
          const x1 = svgX(prev.x)
          const y1 = svgY(prev.y)
          const x2 = svgX(p.x)
          const y2 = svgY(p.y)
          const stroke = singleMode ? metricColour(metric, prev) : driver.team_colour
          // Multi-driver: line weight encodes speed (1.5–4px)
          const weight = singleMode ? 3 : 1.5 + (prev.speed / 380) * 2.5
          return (
            <line
              key={`${driver.driver_code}-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={weight}
              strokeLinecap="round"
            />
          )
        })
      })}

      {/* Hover marker dot per selected driver */}
      {hoveredDistance != null &&
        selected.map((driver) => {
          const p = findNearestByDistance(driver, hoveredDistance)
          return (
            <circle
              key={`dot-${driver.driver_code}`}
              cx={svgX(p.x)}
              cy={svgY(p.y)}
              r={4}
              fill={driver.team_colour}
              stroke="#05060A"
              strokeWidth={1.5}
            />
          )
        })}

      {/* Sector labels */}
      {sectorLabels.map((s) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r={2.5} fill="#8A94A6" />
          <text
            x={s.x + 6}
            y={s.y - 6}
            fill="#8A94A6"
            fontSize={11}
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight={700}
          >
            {s.label}
          </text>
        </g>
      ))}

      {/* Invisible hover capture */}
      <rect
        x={0}
        y={0}
        width={600}
        height={400}
        fill="transparent"
        onMouseMove={handleMove}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: 'crosshair' }}
      />
    </svg>
  )
}
