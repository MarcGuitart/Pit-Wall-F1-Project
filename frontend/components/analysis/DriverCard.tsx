'use client'

import { useEffect } from 'react'
import type { TruePaceRow, TyreDegradationRow, PitImpactRow } from '@/types'
import { formatLapTime, formatDelta, formatSlope, formatLaneDuration } from '@/lib/format'
import { COMPOUND_COLORS } from '@/lib/constants'

type Props = {
  driver: TruePaceRow
  stints: TyreDegradationRow[]
  pits: PitImpactRow[]
  raceName: string
  onClose: () => void
  onAskEngineer?: () => void
}

export function DriverCard({ driver, stints, pits, raceName, onClose, onAskEngineer }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const teamColor = driver.team_colour ?? '#8A94A6'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-3xl bg-bg-panel border border-border-default rounded-[4px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-4 py-4 flex items-center justify-between"
          style={{
            background: `linear-gradient(135deg, ${teamColor}22 0%, transparent 60%)`,
            borderBottom: `1px solid ${teamColor}33`,
          }}
        >
          <div className="flex items-center gap-4">
            {/* Driver number watermark */}
            <div
              className="font-display font-black text-[56px] leading-none select-none tabular-nums"
              style={{ color: teamColor + '44', WebkitTextStroke: `1px ${teamColor}66` }}
            >
              {driver.driver_number}
            </div>
            <div>
              <div className="font-display font-black text-[28px] uppercase tracking-[-0.5px] text-text-primary">
                {driver.driver_code}
              </div>
              <div className="font-mono text-[11px] text-text-secondary">{driver.team_name}</div>
              <div className="font-mono text-[10px] text-text-muted">{raceName}</div>
            </div>
          </div>

          {/* Pace rank badge */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div
                className="font-mono font-bold text-[28px] leading-none"
                style={{ color: driver.rank === 1 ? '#FFB020' : teamColor }}
              >
                P{driver.rank}
              </div>
              <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">
                True Pace
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-[2px] bg-bg-elevated hover:bg-border-default transition-colors text-text-muted hover:text-text-primary font-mono text-[13px]"
            >
              ×
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-subtle">
          {/* Left: pace metrics */}
          <div className="p-4 space-y-4">
            <div>
              <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-2">
                Pace Analysis
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Clean Pace', value: formatLapTime(driver.clean_pace) },
                  { label: 'Median Lap', value: formatLapTime(driver.median_lap) },
                  { label: 'Traffic Score', value: `${driver.traffic_score.toFixed(1)}s` },
                  { label: 'Sample Size', value: `${driver.sample_size} laps` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2">
                    <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mb-0.5">
                      {label}
                    </div>
                    <div className="font-mono text-[13px] text-text-primary tabular-nums">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exclusion log */}
            <div>
              <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-1.5">
                Exclusion Log
              </div>
              <div className="space-y-0.5">
                {driver.exclusion_log.map((log, i) => (
                  <div key={i} className="font-mono text-[9px] text-text-muted">
                    · {log}
                  </div>
                ))}
              </div>
            </div>

            {/* Confidence */}
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
                Data confidence:
              </span>
              <span
                className={`px-2 py-0.5 border rounded-[2px] font-display font-bold text-[9px] uppercase tracking-[0.5px] ${
                  driver.confidence === 'High'
                    ? 'text-signal-green border-signal-green/40 bg-signal-green/10'
                    : driver.confidence === 'Medium'
                    ? 'text-signal-amber border-signal-amber/40 bg-signal-amber/10'
                    : 'text-text-muted border-border-default bg-bg-elevated'
                }`}
              >
                {driver.confidence}
              </span>
            </div>
          </div>

          {/* Right: stints + pits */}
          <div className="p-4 space-y-4">
            {/* Stint map */}
            <div>
              <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-2">
                Stint Map
              </div>
              {stints.length > 0 ? (
                <div className="space-y-1.5">
                  {stints.map((stint, i) => {
                    const color = COMPOUND_COLORS[stint.compound] ?? '#8A94A6'
                    const lapCount = stint.lap_end - stint.lap_start + 1
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-display font-black shrink-0"
                          style={{ backgroundColor: color + '22', border: `1.5px solid ${color}`, color }}
                        >
                          {stint.compound.slice(0, 1)}
                        </div>
                        <div className="flex-1">
                          <div className="h-3 rounded-sm overflow-hidden bg-bg-elevated">
                            <div
                              className="h-full rounded-sm"
                              style={{
                                width: `${Math.min((lapCount / 71) * 100, 100)}%`,
                                backgroundColor: color + '88',
                              }}
                            />
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="font-mono text-[8px] text-text-muted">
                              L{stint.lap_start}–{stint.lap_end}
                            </span>
                            <span className="font-mono text-[8px] text-text-muted">
                              {formatSlope(stint.degradation_slope)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="font-mono text-[10px] text-text-muted">No stint data.</p>
              )}
            </div>

            {/* Pit stops */}
            {pits.length > 0 && (
              <div>
                <div className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted mb-1.5">
                  Pit Stops
                </div>
                <div className="space-y-1">
                  {pits.map((pit, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono text-[10px]">
                      <span className="text-text-muted">L{pit.lap_number}</span>
                      <span className="text-text-secondary">{formatLaneDuration(pit.lane_duration)}</span>
                      {pit.net_position_change != null && (
                        <span
                          className={
                            pit.net_position_change > 0
                              ? 'text-signal-green'
                              : pit.net_position_change < 0
                              ? 'text-signal-red'
                              : 'text-text-muted'
                          }
                        >
                          {pit.net_position_change > 0 ? '+' : ''}{pit.net_position_change} pos
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verdict */}
            <div className="px-3 py-2 bg-bg-elevated border border-border-subtle rounded-[3px]">
              <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mb-1">
                Engineer verdict
              </div>
              <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
                {driver.verdict}
              </p>
            </div>

            {/* Ask engineer button */}
            {onAskEngineer && (
              <button
                onClick={onAskEngineer}
                className="w-full px-3 py-2 bg-transparent border border-dashed border-border-default text-text-muted font-display font-bold text-[10px] uppercase tracking-[1px] rounded-[3px] hover:border-signal-blue hover:text-signal-blue transition-colors"
              >
                Ask engineer about {driver.driver_code} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
