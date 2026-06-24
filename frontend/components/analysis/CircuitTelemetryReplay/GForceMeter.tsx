'use client'

import { useMemo } from 'react'
import type { DriverTelemetry } from '@/types/telemetry'
import { getValueAtProgress } from './utils/interpolate'

const SIZE = 210
const CX = SIZE / 2
const CY = SIZE / 2
const R_ARC  = 88            // outer ring radius (throttle / brake arcs)
const R_GPAD = 60            // G-plane circle radius
const STROKE = 10            // arc stroke width

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (Math.abs(endDeg - startDeg) < 0.5) return ''
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0
  const s = polarToXY(cx, cy, r, startDeg)
  const e = polarToXY(cx, cy, r, endDeg)
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`
}

type Props = {
  driver: DriverTelemetry
  progress: number
}

export function GForceMeter({ driver, progress }: Props) {
  const pts = driver.points

  // Auto-scale: calibrate the G-plane to the lap's actual peak G
  const { gScale, peakLatG, peakLonG, peakMag } = useMemo(() => {
    let maxLat = 0, maxLon = 0, maxMag = 0, bestLat = 0, bestLon = 0
    for (const p of pts) {
      const lat = Math.abs(p.lat_g ?? 0)
      const lon = Math.abs(p.lon_g ?? 0)
      const mag = Math.sqrt(lat ** 2 + lon ** 2)
      if (lat > maxLat) maxLat = lat
      if (lon > maxLon) maxLon = lon
      if (mag > maxMag) { maxMag = mag; bestLat = p.lat_g ?? 0; bestLon = p.lon_g ?? 0 }
    }
    // Scale: peak G fills ~80% of the G-plane ring, with 1.5g minimum
    const scale = Math.max(1.5, Math.max(maxLat, maxLon) * 1.25)
    return { gScale: scale, peakLatG: bestLat, peakLonG: bestLon, peakMag: maxMag }
  }, [pts])

  // Live values at current replay position
  const live = useMemo(() => {
    if (!pts.length) return { speed: 0, throttle: 0, brake: false, gear: 0, lat_g: 0, lon_g: 0 }
    return {
      speed:    getValueAtProgress(pts, progress, 'speed') as number,
      throttle: getValueAtProgress(pts, progress, 'throttle') as number,
      brake:    getValueAtProgress(pts, progress, 'brake') as boolean,
      gear:     getValueAtProgress(pts, progress, 'gear') as number,
      lat_g:    ((getValueAtProgress(pts, progress, 'lat_g') as number) ?? 0),
      lon_g:    ((getValueAtProgress(pts, progress, 'lon_g') as number) ?? 0),
    }
  }, [pts, progress])

  const { throttle, brake, lat_g, lon_g, speed, gear } = live

  // Total G magnitude (capped at gScale for display)
  const gMag = Math.sqrt(lat_g ** 2 + lon_g ** 2)

  // Throttle arc: left side (bottom-left to top)
  const THROTTLE_START = -150
  const THROTTLE_END   = -30
  const throttleDeg = THROTTLE_START + (throttle / 100) * (THROTTLE_END - THROTTLE_START)

  // G-vector dot — auto-scaled to gScale, fills R_GPAD at max
  const dotTravel = R_GPAD - 10  // max dot displacement from centre
  const dotX = CX + (-lat_g / gScale) * dotTravel
  const dotY = CY + (-lon_g / gScale) * dotTravel  // lon_g + = accel = up

  // Peak marker position
  const peakX = CX + (-peakLatG / gScale) * dotTravel
  const peakY = CY + (-peakLonG / gScale) * dotTravel

  // Steering wheel proxy from lateral G
  const steerAngle = Math.max(-90, Math.min(90, lat_g * -22))

  // Dot colour: green → amber → red by % of gScale
  const gFrac = gMag / gScale
  const dotColor = gFrac < 0.4 ? '#23D18B' : gFrac < 0.7 ? '#FFB020' : '#E8001D'

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const dotXc = clamp(dotX, CX - R_GPAD + 8, CX + R_GPAD - 8)
  const dotYc = clamp(dotY, CY - R_GPAD + 8, CY + R_GPAD - 8)
  const pkXc  = clamp(peakX, CX - R_GPAD + 4, CX + R_GPAD - 4)
  const pkYc  = clamp(peakY, CY - R_GPAD + 4, CY + R_GPAD - 4)

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted">
          G-Force Meter
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-text-muted">
            scale ±{gScale.toFixed(1)}g
          </span>
          <div className="font-mono text-[10px] font-bold" style={{ color: driver.team_colour }}>
            {driver.driver_code}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center py-2 px-2 gap-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>

          {/* ── Background ring ── */}
          <circle cx={CX} cy={CY} r={R_ARC} fill="none" stroke="#1E2430" strokeWidth={STROKE + 2} />

          {/* ── Throttle arc (green, bottom-left → bottom-right) ── */}
          {throttle > 1 && (
            <path
              d={arcPath(CX, CY, R_ARC, THROTTLE_START, throttleDeg)}
              fill="none"
              stroke="#23D18B"
              strokeWidth={STROKE}
              strokeLinecap="round"
              opacity={0.9}
            />
          )}

          {/* ── Brake arc (right side, red when braking) ── */}
          <path
            d={arcPath(CX, CY, R_ARC, 30, 150)}
            fill="none"
            stroke={brake ? '#E8001D' : '#1E2430'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            opacity={brake ? 0.95 : 0.45}
            style={{ transition: 'stroke 0.06s, opacity 0.06s' }}
          />

          {/* ── Brake fill bar (right side, fills proportionally — not used for binary but ready) ── */}

          {/* ── G-plane circle ── */}
          <circle cx={CX} cy={CY} r={R_GPAD} fill="#0B0D12" stroke="#252D3A" strokeWidth={1} />

          {/* ── Crosshair ── */}
          <line x1={CX - R_GPAD} y1={CY} x2={CX + R_GPAD} y2={CY} stroke="#1E2430" strokeWidth={0.75} />
          <line x1={CX} y1={CY - R_GPAD} x2={CX} y2={CY + R_GPAD} stroke="#1E2430" strokeWidth={0.75} />

          {/* ── Scale ring at 50% ── */}
          <circle cx={CX} cy={CY} r={dotTravel * 0.5} fill="none" stroke="#1E2430" strokeWidth={0.5} strokeDasharray="3,4" opacity={0.6} />

          {/* ── Peak G ghost marker (where max G occurred this lap) ── */}
          {peakMag > 0.3 && (
            <>
              <line
                x1={CX} y1={CY} x2={pkXc} y2={pkYc}
                stroke={driver.team_colour} strokeWidth={0.75} opacity={0.25}
              />
              <circle cx={pkXc} cy={pkYc} r={4} fill="none" stroke={driver.team_colour} strokeWidth={1} opacity={0.4} />
            </>
          )}

          {/* ── G-vector shadow (motion blur feel) ── */}
          <g style={{ transform: `translate(${dotXc - CX}px, ${dotYc - CY}px)` }}>
            <circle cx={CX} cy={CY} r={12} fill={dotColor} opacity={0.08} />
          </g>

          {/* ── G-vector dot — CSS transform (not SVG attribute) so transition works ── */}
          <g style={{
            transform: `translate(${dotXc - CX}px, ${dotYc - CY}px)`,
            transition: 'transform 0.05s linear',
          }}>
            <circle cx={CX} cy={CY} r={10} fill={dotColor} opacity={0.15} />
            <circle cx={CX} cy={CY} r={7} fill={dotColor} opacity={0.95} />
          </g>

          {/* ── Steering wheel (centre, rotates with lateral G) ── */}
          <g transform={`translate(${CX}, ${CY}) rotate(${steerAngle})`}>
            <circle cx={0} cy={0} r={16} fill="none" stroke="#252D3A" strokeWidth={3} />
            <line x1={0} y1={-16} x2={0} y2={-5} stroke="#1E2430" strokeWidth={2.5} strokeLinecap="round"/>
            <line x1={-16} y1={0} x2={-6} y2={0} stroke="#1E2430" strokeWidth={2.5} strokeLinecap="round"/>
            <line x1={16} y1={0} x2={6} y2={0} stroke="#1E2430" strokeWidth={2.5} strokeLinecap="round"/>
            <circle cx={0} cy={0} r={4} fill="#1E2430" />
            <circle cx={0} cy={-13} r={1.5} fill="#F0F2F5" opacity={0.5} />
          </g>

          {/* ── Labels ── */}
          <text x={CX - R_ARC + 4} y={CY - 6} fill="#23D18B" fontSize="7"
            fontFamily="Barlow Condensed, sans-serif" fontWeight="700" letterSpacing="1">
            THROTTLE
          </text>
          <text x={CX + R_ARC - 50} y={CY - 6} fill={brake ? '#E8001D' : '#4A5568'} fontSize="7"
            fontFamily="Barlow Condensed, sans-serif" fontWeight="700" letterSpacing="1"
            style={{ transition: 'fill 0.06s' }}>
            BRAKE
          </text>

          {/* ── Live G value in lower arc gap ── */}
          <text
            x={CX}
            y={SIZE - 14}
            textAnchor="middle"
            fill={dotColor}
            fontSize="26"
            fontFamily="Barlow Condensed, sans-serif"
            fontWeight="900"
            letterSpacing="-0.5"
            style={{ transition: 'fill 0.08s' }}
          >
            {gMag.toFixed(1)}G
          </text>
        </svg>

        {/* Telemetry readouts — tight grid below the dial */}
        <div className="grid grid-cols-4 gap-0 w-full border-t border-border-subtle">
          {[
            { label: 'Speed', value: `${Math.round(speed)}`, unit: 'km/h' },
            { label: 'Gear',  value: `${gear}`,              unit: '' },
            { label: 'Lat G', value: `${lat_g >= 0 ? '+' : ''}${lat_g.toFixed(2)}`, unit: 'g',
              color: Math.abs(lat_g) > gScale * 0.6 ? '#FFB020' : undefined },
            { label: 'Lon G', value: `${lon_g >= 0 ? '+' : ''}${lon_g.toFixed(2)}`, unit: 'g',
              color: lon_g < -gScale * 0.5 ? '#E8001D' : lon_g > gScale * 0.3 ? '#23D18B' : undefined },
          ].map(({ label, value, unit, color }, i) => (
            <div key={i} className={`flex flex-col items-center py-1.5 ${i < 3 ? 'border-r border-border-subtle' : ''}`}>
              <span className="font-display font-bold text-[7px] uppercase tracking-[0.8px] text-text-muted">{label}</span>
              <span className="font-mono text-[12px] font-bold tabular-nums leading-tight"
                    style={{ color: color ?? '#F0F2F5' }}>
                {value}<span className="text-[8px] text-text-muted ml-0.5">{unit}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Peak G bar */}
        <div className="w-full flex items-center gap-2 px-2.5 py-1.5 border-t border-border-subtle">
          <span className="font-display font-bold text-[7px] uppercase tracking-[0.8px] text-text-muted whitespace-nowrap">Peak G</span>
          <div className="flex-1 h-1 bg-bg-panel rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (peakMag / gScale) * 100)}%`,
                backgroundColor: driver.team_colour,
              }}
            />
          </div>
          <span className="font-mono text-[9px] font-bold tabular-nums" style={{ color: driver.team_colour }}>
            {peakMag.toFixed(2)}g
          </span>
        </div>
      </div>
    </div>
  )
}
