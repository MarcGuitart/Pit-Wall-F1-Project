'use client'

import { useMemo } from 'react'
import type { DriverTelemetry } from '@/types/telemetry'

const SIZE = 280          // SVG canvas size (square)
const HALF = SIZE / 2
const G_RANGE = 3.5       // ±g shown on each axis
const SCALE = HALF / G_RANGE

// Convert g-value to SVG coordinate
function gToSvg(g: number): number {
  return HALF - g * SCALE
}

type Props = {
  driver: DriverTelemetry
}

export function GGDiagram({ driver }: Props) {
  const pts = driver.points

  // Check data is available
  const hasGG = useMemo(
    () => pts.some((p) => p.lat_g != null && p.lon_g != null),
    [pts],
  )

  // Build the scatter path data — colour each point by speed
  const dots = useMemo(() => {
    if (!hasGG) return []
    const maxSpeed = Math.max(...pts.map((p) => p.speed))
    return pts
      .filter((p) => p.lat_g != null && p.lon_g != null)
      .map((p) => ({
        cx: gToSvg(-(p.lat_g ?? 0)),  // lateral: positive = right on screen
        cy: gToSvg(p.lon_g ?? 0),
        speed: p.speed,
        maxSpeed,
        brake: p.brake,
      }))
  }, [pts, hasGG])

  // Traction circle — theoretical limit, shown as reference ellipse
  // F1 cars generate ~4–5g peak, but practical limit for a clean lap ~3.5g
  const circlePoints = useMemo(() => {
    const N = 120
    return Array.from({ length: N }, (_, i) => {
      const angle = (i / N) * Math.PI * 2
      // Longitudinal limit is asymmetric: braking ~3.5g, accel ~2.0g
      const braking = angle > Math.PI  // lon_g negative = braking = bottom half
      const lonScale = braking ? 1.0 : 0.7
      const x = HALF + Math.cos(angle) * SCALE * G_RANGE
      const y = HALF - Math.sin(angle) * SCALE * G_RANGE * lonScale
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ') + 'Z'
  }, [])

  const gridLines = [-3, -2, -1, 0, 1, 2, 3]

  function speedToColor(speed: number, maxSpeed: number, brake: boolean): string {
    if (brake) return 'rgba(232,0,29,0.7)'
    const t = Math.min(1, speed / maxSpeed)
    // Green (low speed) → Amber → Red (high speed)
    if (t < 0.5) {
      const r = Math.round(77 + (255 - 77) * (t * 2))
      const g = Math.round(163 + (176 - 163) * (t * 2))
      return `rgba(${r},${g},77,0.75)`
    } else {
      const r = Math.round(255)
      const g = Math.round(176 * (1 - (t - 0.5) * 2))
      return `rgba(${r},${g},20,0.75)`
    }
  }

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted">
          G-G Diagram · Traction Circle
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-signal-green opacity-70" />
            <span className="font-mono text-[8px] text-text-muted">Throttle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-signal-red opacity-70" />
            <span className="font-mono text-[8px] text-text-muted">Braking</span>
          </div>
        </div>
      </div>

      {!hasGG ? (
        <div className="flex items-center justify-center h-[200px]">
          <span className="font-mono text-[10px] text-text-muted">
            G-G data requires FastF1 (not available for this session)
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center p-3 gap-2">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="overflow-visible"
          >
            {/* Grid lines */}
            {gridLines.map((g) => {
              const coord = gToSvg(g)
              const gNeg = gToSvg(-g)
              return (
                <g key={g} opacity={g === 0 ? 0.4 : 0.15}>
                  <line x1={0} y1={coord} x2={SIZE} y2={coord} stroke="#F0F2F5" strokeWidth={g === 0 ? 1 : 0.5} />
                  <line x1={gNeg} y1={0} x2={gNeg} y2={SIZE} stroke="#F0F2F5" strokeWidth={g === 0 ? 1 : 0.5} />
                </g>
              )
            })}

            {/* Grid labels */}
            {[-2, -1, 1, 2].map((g) => (
              <text
                key={`lbl-${g}`}
                x={gToSvg(-g) + 2}
                y={HALF - 3}
                fill="#4A5568"
                fontSize="7"
                fontFamily="JetBrains Mono, monospace"
              >
                {g > 0 ? `+${g}` : g}G
              </text>
            ))}

            {/* Axis labels */}
            <text x={SIZE - 20} y={HALF + 12} fill="#4A5568" fontSize="7" fontFamily="JetBrains Mono, monospace">Lat→</text>
            <text x={HALF + 4} y={10} fill="#4A5568" fontSize="7" fontFamily="JetBrains Mono, monospace">Acc↑</text>
            <text x={HALF + 4} y={SIZE - 4} fill="#4A5568" fontSize="7" fontFamily="JetBrains Mono, monospace">Brk↓</text>

            {/* Traction circle reference */}
            <path
              d={circlePoints}
              fill="none"
              stroke="#FFB020"
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.4}
            />

            {/* Scatter dots */}
            {dots.map((d, i) => (
              <circle
                key={i}
                cx={d.cx}
                cy={d.cy}
                r={1.8}
                fill={speedToColor(d.speed, d.maxSpeed, d.brake)}
              />
            ))}

            {/* Driver label */}
            <text
              x={4}
              y={SIZE - 4}
              fill={driver.team_colour}
              fontSize="9"
              fontFamily="Barlow Condensed, sans-serif"
              fontWeight="700"
              letterSpacing="1"
            >
              {driver.driver_code}
            </text>
          </svg>

          {/* Legend */}
          <div className="flex items-center gap-4 text-center">
            <div>
              <div className="font-mono text-[9px] text-text-muted">Peak lat</div>
              <div className="font-mono text-[11px] text-text-primary">
                {Math.max(...dots.map((d) => Math.abs(d.cx - HALF) / SCALE)).toFixed(2)}g
              </div>
            </div>
            <div className="w-px h-6 bg-border-subtle" />
            <div>
              <div className="font-mono text-[9px] text-text-muted">Peak brk</div>
              <div className="font-mono text-[11px] text-text-primary">
                {Math.max(...dots.filter((d) => d.brake).map((d) => Math.abs(d.cy - HALF) / SCALE), 0).toFixed(2)}g
              </div>
            </div>
            <div className="w-px h-6 bg-border-subtle" />
            <div>
              <div className="font-mono text-[9px] text-text-muted">Peak acc</div>
              <div className="font-mono text-[11px] text-text-primary">
                {Math.max(...dots.filter((d) => !d.brake).map((d) => (HALF - d.cy) / SCALE), 0).toFixed(2)}g
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
