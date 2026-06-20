'use client'

import { useMemo, useRef } from 'react'
import type { DriverTelemetry, TelemetryData } from '@/types/telemetry'
import { BRAKE_COLOUR } from './colors'

type Props = {
  data: TelemetryData
  selectedDrivers: string[]
  hoveredDistance: number | null
  onHover: (distance: number | null) => void
  highlightRange: { start: number; end: number } | null
}

const W = 1000 // internal viewBox width
const SPEED_H = 80
const THROTTLE_H = 60
const BRAKE_H = 40
const MAX_SPEED = 380

function nearest(driver: DriverTelemetry, distance: number) {
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

export function TelemetryChart({ data, selectedDrivers, hoveredDistance, onHover, highlightRange }: Props) {
  const total = data.total_distance || 1
  const isRaceTrace = data.source.toLowerCase().includes('openf1')
  const x = (d: number) => (d / total) * W

  const selected = useMemo(
    () => data.drivers.filter((d) => selectedDrivers.includes(d.driver_code)),
    [data.drivers, selectedDrivers],
  )

  const s1 = data.sector_boundaries.sector_1_end
  const s2 = data.sector_boundaries.sector_2_end

  const cursorX = hoveredDistance != null ? x(hoveredDistance) : null
  const hlStart = highlightRange ? x(highlightRange.start) : null
  const hlEnd = highlightRange ? x(highlightRange.end) : null

  function makeMoveHandler(height: number) {
    return (e: React.MouseEvent<SVGRectElement>) => {
      const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
      const frac = (e.clientX - rect.left) / rect.width
      onHover(Math.max(0, Math.min(1, frac)) * total)
    }
  }

  const SectorLines = ({ height }: { height: number }) => (
    <>
      {[s1, s2].map((b, i) => (
        <line
          key={i}
          x1={x(b)}
          x2={x(b)}
          y1={0}
          y2={height}
          stroke="#252D3A"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
    </>
  )

  const Highlight = ({ height }: { height: number }) =>
    hlStart != null && hlEnd != null ? (
      <rect x={hlStart} y={0} width={hlEnd - hlStart} height={height} fill="#4DA3FF" opacity={0.07} />
    ) : null

  const Cursor = ({ height }: { height: number }) =>
    cursorX != null ? (
      <line x1={cursorX} x2={cursorX} y1={0} y2={height} stroke="#F0F2F5" strokeWidth={1} opacity={0.5} />
    ) : null

  const linePath = (driver: DriverTelemetry, valueFn: (p: DriverTelemetry['points'][0]) => number, height: number, maxV: number) =>
    driver.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.distance).toFixed(1)} ${(height - (valueFn(p) / maxV) * height).toFixed(1)}`)
      .join(' ')

  const areaPath = (driver: DriverTelemetry, valueFn: (p: DriverTelemetry['points'][0]) => number, height: number, maxV: number) => {
    if (!driver.points.length) return ''
    const top = driver.points
      .map((p) => `L ${x(p.distance).toFixed(1)} ${(height - (valueFn(p) / maxV) * height).toFixed(1)}`)
      .join(' ')
    const first = driver.points[0]
    const last = driver.points[driver.points.length - 1]
    return `M ${x(first.distance).toFixed(1)} ${height} ${top} L ${x(last.distance).toFixed(1)} ${height} Z`
  }

  const formatAxis = (value: number) => {
    if (!isRaceTrace) return `${Math.round(value)}m`
    const minutes = Math.floor(value / 60)
    const seconds = Math.round(value % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const panelHeader = (label: string, value: string) => (
    <div className="flex items-center justify-between px-1 mb-0.5">
      <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">{label}</span>
      <span className="font-mono text-[8px] text-text-muted">{value}</span>
    </div>
  )

  return (
    <div className="space-y-2">
      {/* SPEED */}
      <div>
        {panelHeader('Speed', `max ${Math.round(Math.max(...selected.flatMap((d) => d.points.map((p) => p.speed)), 0))} km/h`)}
        <svg viewBox={`0 0 ${W} ${SPEED_H}`} preserveAspectRatio="none" className="w-full" style={{ height: SPEED_H, background: '#0B0D12', borderRadius: 3 }}>
          <Highlight height={SPEED_H} />
          <SectorLines height={SPEED_H} />
          {selected.map((d) => (
            <path key={d.driver_code} d={linePath(d, (p) => p.speed, SPEED_H, MAX_SPEED)} stroke={d.team_colour} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
          ))}
          <Cursor height={SPEED_H} />
          {cursorX != null &&
            selected.map((d) => {
              const p = nearest(d, hoveredDistance!)
              return <circle key={d.driver_code} cx={cursorX} cy={SPEED_H - (p.speed / MAX_SPEED) * SPEED_H} r={3} fill={d.team_colour} />
            })}
          <rect x={0} y={0} width={W} height={SPEED_H} fill="transparent" onMouseMove={makeMoveHandler(SPEED_H)} onMouseLeave={() => onHover(null)} />
        </svg>
      </div>

      {/* THROTTLE */}
      <div>
        {panelHeader('Throttle', '0–100%')}
        <svg viewBox={`0 0 ${W} ${THROTTLE_H}`} preserveAspectRatio="none" className="w-full" style={{ height: THROTTLE_H, background: '#0B0D12', borderRadius: 3 }}>
          <Highlight height={THROTTLE_H} />
          <SectorLines height={THROTTLE_H} />
          {selected.map((d) => (
            <path key={`${d.driver_code}-area`} d={areaPath(d, (p) => p.throttle, THROTTLE_H, 100)} fill={d.team_colour} opacity={selected.length > 1 ? 0.12 : 0.22} />
          ))}
          {selected.map((d) => (
            <path key={`${d.driver_code}-line`} d={linePath(d, (p) => p.throttle, THROTTLE_H, 100)} stroke={d.team_colour} strokeWidth={1.25} fill="none" vectorEffect="non-scaling-stroke" />
          ))}
          <Cursor height={THROTTLE_H} />
          <rect x={0} y={0} width={W} height={THROTTLE_H} fill="transparent" onMouseMove={makeMoveHandler(THROTTLE_H)} onMouseLeave={() => onHover(null)} />
        </svg>
      </div>

      {/* BRAKE */}
      <div>
        {panelHeader('Brake', 'on / off')}
        <svg viewBox={`0 0 ${W} ${BRAKE_H}`} preserveAspectRatio="none" className="w-full" style={{ height: BRAKE_H, background: '#0B0D12', borderRadius: 3 }}>
          <Highlight height={BRAKE_H} />
          <SectorLines height={BRAKE_H} />
          {selected.map((d, di) => {
            const rowH = BRAKE_H / selected.length
            const yTop = di * rowH
            // Draw a filled rect for each contiguous braking segment
            const segs: { x: number; w: number }[] = []
            for (let i = 0; i < d.points.length - 1; i++) {
              if (d.points[i].brake) {
                const xa = x(d.points[i].distance)
                const xb = x(d.points[i + 1].distance)
                segs.push({ x: xa, w: Math.max(1, xb - xa) })
              }
            }
            return (
              <g key={d.driver_code}>
                {segs.map((s, i) => (
                  <rect key={i} x={s.x} y={yTop + 2} width={s.w} height={rowH - 4} fill={BRAKE_COLOUR} opacity={0.85} />
                ))}
              </g>
            )
          })}
          <Cursor height={BRAKE_H} />
          <rect x={0} y={0} width={W} height={BRAKE_H} fill="transparent" onMouseMove={makeMoveHandler(BRAKE_H)} onMouseLeave={() => onHover(null)} />
        </svg>
      </div>

      {/* Axis labels */}
      <div className="relative h-3">
        {isRaceTrace
          ? [0, total / 4, total / 2, (total * 3) / 4, total].map((value) => (
              <span
                key={value}
                className="absolute font-mono text-[8px] text-text-muted"
                style={{ left: `${(x(value) / W) * 100}%`, transform: 'translateX(-50%)' }}
              >
                {formatAxis(value)}
              </span>
            ))
          : [
              { x: x(s1), label: 'S2' },
              { x: x(s2), label: 'S3' },
            ].map((b) => (
              <span
                key={b.label}
                className="absolute font-mono text-[8px] text-text-muted"
                style={{ left: `${(b.x / W) * 100}%`, transform: 'translateX(-50%)' }}
              >
                {b.label}
              </span>
            ))}
      </div>

      {/* Tooltip for hovered distance */}
      {hoveredDistance != null && (
        <div className="flex items-center gap-3 flex-wrap px-1 pt-1 border-t border-border-subtle">
          <span className="font-mono text-[9px] text-text-muted">
            @ {formatAxis(hoveredDistance)}
          </span>
          {selected.map((d) => {
            const p = nearest(d, hoveredDistance)
            return (
              <span key={d.driver_code} className="flex items-center gap-1.5 font-mono text-[9px]">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: d.team_colour }} />
                <span className="font-display font-bold text-text-primary">{d.driver_code}</span>
                {p.lap_number != null && <span className="text-text-muted">L{p.lap_number}</span>}
                <span className="text-text-secondary">{Math.round(p.speed)}km/h</span>
                <span className="text-text-muted">{Math.round(p.throttle)}%</span>
                {p.brake && <span className="text-signal-red">BRK</span>}
                <span className="text-text-muted">G{p.gear}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
