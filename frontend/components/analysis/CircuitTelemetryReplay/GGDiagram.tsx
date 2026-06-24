'use client'

import { useMemo } from 'react'
import type { DriverTelemetry, TelemetryPoint } from '@/types/telemetry'

// ── Layout constants ──────────────────────────────────────────────────────────
const W = 320
const H = 320
const PAD = 36          // space for axis labels
const CX = PAD + (W - PAD * 2) / 2
const CY = PAD + (H - PAD * 2) / 2
const PLOT_W = W - PAD * 2
const PLOT_H = H - PAD * 2
const G_MAX = 5.0       // max G shown on each axis (matches backend ±5g clip)

// Convert G-value to SVG pixel coordinate
function gx(g: number): number { return CX + (g / G_MAX) * (PLOT_W / 2) }
function gy(g: number): number { return CY - (g / G_MAX) * (PLOT_H / 2) }  // lon_g up = top

// ── Friction ellipse reference ────────────────────────────────────────────────
// F1 limits are asymmetric: braking >> acceleration (4-wheel brakes vs RWD traction)
const LAT_LIMIT  = 3.6   // ±lateral g at friction limit
const BRK_LIMIT  = 3.8   // max braking g (bottom of ellipse)
const ACC_LIMIT  = 2.2   // max acceleration g (top of ellipse) — traction limited

function frictionPath(): string {
  const N = 200
  const pts: string[] = []
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * Math.PI * 2
    const lat = Math.cos(theta) * LAT_LIMIT
    // Squash top vs bottom to model the asymmetry
    const lonLimit = Math.sin(theta) >= 0 ? ACC_LIMIT : BRK_LIMIT
    const lon = Math.sin(theta) * lonLimit
    pts.push(`${i === 0 ? 'M' : 'L'}${gx(lat).toFixed(1)},${gy(lon).toFixed(1)}`)
  }
  return pts.join(' ') + 'Z'
}

// ── Per-point colour ──────────────────────────────────────────────────────────
// Standard F1 telemetry colouring: green=throttle, red=brake, grey=coast
function pointColor(p: TelemetryPoint): string {
  if (p.brake)           return 'rgba(232,0,29,0.65)'
  if (p.throttle > 15)   return `rgba(35,209,139,${0.35 + (p.throttle / 100) * 0.5})`
  return 'rgba(138,148,166,0.35)'  // coasting
}

// ── Stats helpers ─────────────────────────────────────────────────────────────
function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '—'
}

type Props = {
  driver: DriverTelemetry
}

export function GGDiagram({ driver }: Props) {
  const pts = driver.points

  const hasGG = useMemo(() => pts.some((p) => p.lat_g != null && p.lon_g != null), [pts])

  const validPts = useMemo(
    () => pts.filter((p) => p.lat_g != null && p.lon_g != null),
    [pts],
  )

  // ── Statistics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!validPts.length) return null
    const latAbs = validPts.map((p) => Math.abs(p.lat_g ?? 0))
    const lonVals = validPts.map((p) => p.lon_g ?? 0)
    const gMags   = validPts.map((p) => Math.sqrt((p.lat_g ?? 0) ** 2 + (p.lon_g ?? 0) ** 2))

    const peakLat   = Math.max(...latAbs)
    const peakBrk   = Math.max(...lonVals.map((v) => -v))   // most negative lon = hardest braking
    const peakAcc   = Math.max(...lonVals)
    const peakG     = Math.max(...gMags)

    // % laps at ≥75% of friction limit magnitude
    const limit75 = peakG * 0.75
    const atLimit = validPts.filter((_, i) => gMags[i] >= limit75).length
    const braking  = validPts.filter((p) => p.brake).length
    const fullThrottle = validPts.filter((p) => p.throttle >= 90).length

    return { peakLat, peakBrk, peakAcc, peakG, atLimit, braking, fullThrottle, total: validPts.length }
  }, [validPts])

  // ── Connected lap path (thin trace showing G trajectory through the lap) ──
  const lapPath = useMemo(() => {
    if (!validPts.length) return ''
    return validPts.map((p, i) => {
      const x = gx(-(p.lat_g ?? 0))  // lat_g sign: positive = left, so negate for screen
      const y = gy(p.lon_g ?? 0)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }, [validPts])

  // ── Tick marks ──────────────────────────────────────────────────────────────
  const ticks = [-4, -3, -2, -1, 1, 2, 3, 4]

  const ellipsePath = useMemo(() => frictionPath(), [])

  if (!hasGG) {
    return (
      <div className="bg-bg-elevated border border-border-subtle rounded-[4px] p-6 flex items-center justify-center">
        <span className="font-mono text-[10px] text-text-muted">
          G-G data requires FastF1 telemetry
        </span>
      </div>
    )
  }

  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-[4px] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <div>
          <span className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted">
            G-G Diagram
          </span>
          <span className="ml-2 font-mono text-[8px] text-text-muted/60">
            Traction circle · {driver.lap_mode === 'representative' ? 'representative lap' : 'fastest clean lap'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-signal-green opacity-70" />
            <span className="font-mono text-[8px] text-text-muted">Throttle</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-signal-red opacity-70" />
            <span className="font-mono text-[8px] text-text-muted">Brake</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-text-muted opacity-50" />
            <span className="font-mono text-[8px] text-text-muted">Coast</span>
          </span>
        </div>
      </div>

      <div className="p-3">
        {/* ── SVG plot ──────────────────────────────────────────────────────── */}
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          style={{ aspectRatio: '1 / 1' }}
        >
          {/* Grid lines */}
          {ticks.map((g) => (
            <g key={g}>
              {/* Vertical (lat) */}
              <line
                x1={gx(g)} y1={PAD} x2={gx(g)} y2={H - PAD}
                stroke="#1E2430" strokeWidth={g === 0 ? 0 : 0.5}
              />
              {/* Horizontal (lon) */}
              <line
                x1={PAD} y1={gy(g)} x2={W - PAD} y2={gy(g)}
                stroke="#1E2430" strokeWidth={g === 0 ? 0 : 0.5}
              />
            </g>
          ))}

          {/* Zero axes — more visible */}
          <line x1={gx(0)} y1={PAD} x2={gx(0)} y2={H - PAD} stroke="#252D3A" strokeWidth={1} />
          <line x1={PAD} y1={gy(0)} x2={W - PAD} y2={gy(0)} stroke="#252D3A" strokeWidth={1} />

          {/* Axis tick labels */}
          {ticks.map((g) => (
            <g key={`lbl-${g}`}>
              {/* Lat G (bottom axis) */}
              <text x={gx(g)} y={H - PAD + 14} textAnchor="middle"
                fill="#4A5568" fontSize="8" fontFamily="JetBrains Mono, monospace">
                {g > 0 ? `+${g}` : g}
              </text>
              {/* Lon G (left axis) */}
              <text x={PAD - 6} y={gy(g) + 3} textAnchor="end"
                fill="#4A5568" fontSize="8" fontFamily="JetBrains Mono, monospace">
                {g > 0 ? `+${g}` : g}
              </text>
            </g>
          ))}

          {/* Axis unit labels */}
          <text x={CX} y={H - 2} textAnchor="middle"
            fill="#4A5568" fontSize="8" fontFamily="Barlow Condensed, sans-serif" letterSpacing="1" fontWeight="700">
            LATERAL G →
          </text>
          <text x={10} y={CY} textAnchor="middle"
            fill="#4A5568" fontSize="8" fontFamily="Barlow Condensed, sans-serif" letterSpacing="1" fontWeight="700"
            transform={`rotate(-90, 10, ${CY})`}>
            LONGITUDINAL G ↑
          </text>

          {/* Quadrant labels */}
          <text x={CX} y={PAD + 12} textAnchor="middle"
            fill="#23D18B" opacity={0.4} fontSize="8" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2" fontWeight="700">
            ACCELERATING
          </text>
          <text x={CX} y={H - PAD - 8} textAnchor="middle"
            fill="#E8001D" opacity={0.4} fontSize="8" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2" fontWeight="700">
            BRAKING
          </text>
          <text x={PAD + 8} y={CY - 6} textAnchor="start"
            fill="#4DA3FF" opacity={0.4} fontSize="8" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2" fontWeight="700">
            L
          </text>
          <text x={W - PAD - 8} y={CY - 6} textAnchor="end"
            fill="#4DA3FF" opacity={0.4} fontSize="8" fontFamily="Barlow Condensed, sans-serif" letterSpacing="2" fontWeight="700">
            R
          </text>

          {/* ── Friction ellipse (theoretical limit) ── */}
          {/* Filled version for subtlety */}
          <path d={ellipsePath} fill="rgba(255,176,32,0.04)" stroke="none" />
          {/* Border */}
          <path
            d={ellipsePath}
            fill="none"
            stroke="#FFB020"
            strokeWidth={1}
            strokeDasharray="6,4"
            opacity={0.55}
          />

          {/* Limit labels */}
          <text x={gx(LAT_LIMIT) + 4} y={CY + 4}
            fill="#FFB020" fontSize="7" fontFamily="JetBrains Mono, monospace" opacity={0.7}>
            {LAT_LIMIT}g
          </text>
          <text x={CX + 4} y={gy(-BRK_LIMIT) + 10}
            fill="#FFB020" fontSize="7" fontFamily="JetBrains Mono, monospace" opacity={0.7}>
            {BRK_LIMIT}g
          </text>

          {/* ── Lap trajectory trace (thin, shows the path through g-g space) ── */}
          <path
            d={lapPath}
            fill="none"
            stroke={driver.team_colour}
            strokeWidth={0.6}
            opacity={0.25}
            strokeLinejoin="round"
          />

          {/* ── Scatter dots ── */}
          {validPts.map((p, i) => {
            const x = gx(-(p.lat_g ?? 0))
            const y = gy(p.lon_g ?? 0)
            // Skip points wildly out of frame
            if (x < PAD - 4 || x > W - PAD + 4 || y < PAD - 4 || y > H - PAD + 4) return null
            return (
              <circle key={i} cx={x} cy={y} r={1.8} fill={pointColor(p)} />
            )
          })}

          {/* Peak braking marker */}
          {stats && (
            <>
              <circle cx={gx(0)} cy={gy(-stats.peakBrk)} r={3}
                fill="none" stroke="#E8001D" strokeWidth={1} opacity={0.8} />
              <circle cx={gx(0)} cy={gy(stats.peakAcc)} r={3}
                fill="none" stroke="#23D18B" strokeWidth={1} opacity={0.8} />
            </>
          )}
        </svg>

        {/* ── Stats row ─────────────────────────────────────────────────────── */}
        {stats && (
          <>
            <div className="grid grid-cols-4 gap-0 border-t border-border-subtle mt-1 pt-3">
              {[
                { label: 'Peak Lat', value: `${stats.peakLat.toFixed(2)}g`, color: '#4DA3FF' },
                { label: 'Peak Brk', value: `${stats.peakBrk.toFixed(2)}g`, color: '#E8001D' },
                { label: 'Peak Acc', value: `${stats.peakAcc.toFixed(2)}g`, color: '#23D18B' },
                { label: 'At Limit', value: pct(stats.atLimit, stats.total), color: '#FFB020' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center px-2">
                  <div className="font-mono text-[8px] text-text-muted mb-0.5">{label}</div>
                  <div className="font-mono text-[13px] font-bold tabular-nums" style={{ color }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Usage bars ───────────────────────────────────────────────── */}
            <div className="mt-3 space-y-1.5">
              {[
                {
                  label: 'Full throttle',
                  value: stats.fullThrottle,
                  total: stats.total,
                  color: '#23D18B',
                },
                {
                  label: 'Braking',
                  value: stats.braking,
                  total: stats.total,
                  color: '#E8001D',
                },
                {
                  label: 'At grip limit (≥75%)',
                  value: stats.atLimit,
                  total: stats.total,
                  color: '#FFB020',
                },
              ].map(({ label, value, total, color }) => {
                const frac = total > 0 ? value / total : 0
                return (
                  <div key={label} className="flex items-center gap-2">
                    <div className="font-mono text-[8px] text-text-muted w-[110px] shrink-0">{label}</div>
                    <div className="flex-1 h-[5px] bg-bg-panel rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(frac * 100).toFixed(1)}%`, backgroundColor: color, opacity: 0.75 }}
                      />
                    </div>
                    <div className="font-mono text-[8px] w-8 text-right" style={{ color }}>
                      {Math.round(frac * 100)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
