'use client'

import type { TruePaceRow } from '@/types'
import { formatLapTime, formatDelta } from '@/lib/format'

type Props = {
  rows: TruePaceRow[]
  onDriverClick: (driverNumber: number) => void
  selectedDriver: number | null
}

const CONFIDENCE_STYLES = {
  High:   'text-signal-green border-signal-green/40 bg-signal-green/10',
  Medium: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  Low:    'text-text-muted border-border-default bg-bg-elevated',
}

export function TruePaceTable({ rows, onDriverClick, selectedDriver }: Props) {
  const leader = rows[0]?.clean_pace ?? 0

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          True Pace Ranking
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          Clean laps · SC/pit filtered
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[32px_1fr_100px_60px_56px] gap-0 px-3 py-1.5 border-b border-border-subtle">
        {['#', 'Driver', 'Pace', 'Sample', 'Conf.'].map((h) => (
          <span
            key={h}
            className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted"
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => {
          const delta = row.clean_pace - leader
          const isSelected = selectedDriver === row.driver_number

          return (
            <button
              key={row.driver_number}
              onClick={() => onDriverClick(isSelected ? 0 : row.driver_number)}
              className={`w-full grid grid-cols-[32px_1fr_100px_60px_56px] gap-0 px-3 py-2.5 text-left transition-all hover:bg-bg-elevated ${
                isSelected ? 'bg-bg-elevated' : ''
              }`}
            >
              {/* Rank */}
              <div className="flex items-center">
                <span className="font-display font-bold text-[11px] text-text-muted">
                  {row.rank}
                </span>
              </div>

              {/* Driver */}
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: row.team_colour ?? '#8A94A6' }}
                />
                <div className="min-w-0">
                  <div className="font-display font-bold text-[12px] uppercase tracking-[0.5px] text-text-primary">
                    {row.driver_code}
                  </div>
                  <div className="font-mono text-[9px] text-text-muted truncate">
                    {row.team_name}
                  </div>
                </div>
              </div>

              {/* Pace */}
              <div className="flex flex-col justify-center">
                <span className="font-mono text-[12px] text-text-primary tabular-nums">
                  {formatLapTime(row.clean_pace)}
                </span>
                {row.rank > 1 && (
                  <span className="font-mono text-[9px] text-signal-amber tabular-nums">
                    {formatDelta(delta)}
                  </span>
                )}
              </div>

              {/* Sample */}
              <div className="flex items-center">
                <span className="font-mono text-[11px] text-text-secondary tabular-nums">
                  {row.sample_size}
                </span>
              </div>

              {/* Confidence */}
              <div className="flex items-center">
                <span
                  className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${
                    CONFIDENCE_STYLES[row.confidence]
                  }`}
                >
                  {row.confidence.slice(0, 3)}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Exclusion log footnotes */}
      {rows.length > 0 && (
        <div className="px-3 py-2 border-t border-border-subtle bg-bg-secondary">
          <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mb-1.5">
            Exclusion Log (P1)
          </div>
          <div className="space-y-0.5">
            {rows[0].exclusion_log.map((log, i) => (
              <div key={i} className="font-mono text-[9px] text-text-muted">
                · {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
