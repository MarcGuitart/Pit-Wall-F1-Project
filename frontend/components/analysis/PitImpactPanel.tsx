import type { PitImpactRow } from '@/types'
import { formatLaneDuration, formatLapNumber } from '@/lib/format'

type Props = {
  rows: PitImpactRow[]
  onDriverClick?: (code: string) => void
  focusedDriver?: string | null
}

function PositionDeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="font-mono text-[11px] text-text-muted">–</span>
  if (delta === 0) return <span className="font-mono font-bold text-[16px] text-text-secondary">±0</span>
  if (delta > 0)  return <span className="font-mono font-bold text-[16px] text-signal-green">+{delta}</span>
  return <span className="font-mono font-bold text-[16px] text-signal-red">{delta}</span>
}

const VERDICT_STYLE = (verdict: string) => {
  const v = verdict.toLowerCase()
  if (v.includes('optimal') || v.includes('clean') || v.includes('gained') || v.includes('sc winner'))
    return 'text-signal-green border-signal-green/30 bg-signal-green/10'
  if (v.includes('slow') || v.includes('costly') || v.includes('lost') || v.includes('failed'))
    return 'text-signal-red border-signal-red/30 bg-signal-red/10'
  return 'text-signal-blue border-signal-blue/30 bg-signal-blue/10'
}

export function PitImpactPanel({ rows, onDriverClick, focusedDriver }: Props) {
  // Show only stops with valid stationary time to avoid red-flag hold spam
  const validRows = rows.filter((r) => r.stop_duration == null || r.stop_duration > 0.5)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Pit Stop Impact
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          lane_duration · position delta
        </span>
      </div>

      <div className="divide-y divide-border-subtle">
        {validRows.map((row, i) => {
          const isFocused = focusedDriver === row.driver_code
          const isDefocused = focusedDriver != null && !isFocused

          return (
            <div
              key={i}
              className={[
                'px-3 py-3 flex items-center gap-4 transition-all',
                onDriverClick ? 'cursor-pointer' : '',
                isFocused ? 'bg-bg-elevated' : '',
                isDefocused ? 'opacity-40' : '',
                onDriverClick && !isDefocused ? 'hover:bg-bg-elevated' : '',
              ].join(' ')}
              onClick={() => onDriverClick?.(row.driver_code)}
            >
              <div className="w-12 shrink-0 text-center">
                <PositionDeltaBadge delta={row.net_position_change} />
                <div className="font-display text-[7px] uppercase tracking-[1px] text-text-muted mt-0.5">
                  Net pos
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-display font-bold text-[11px] uppercase tracking-[0.5px] text-text-primary">
                    {row.driver_code}
                  </span>
                  <span className="font-mono text-[9px] text-text-muted">
                    {formatLapNumber(row.lap_number)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <span className="font-mono text-[10px] text-text-secondary">
                      {formatLaneDuration(row.lane_duration)}
                    </span>
                    <span className="font-display text-[8px] uppercase text-text-muted ml-1">lane</span>
                  </div>
                  {row.position_before != null && row.position_after != null && (
                    <span className="font-mono text-[9px] text-text-muted">
                      P{row.position_before} → P{row.position_after}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                <span
                  className={`px-2 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${VERDICT_STYLE(row.verdict)}`}
                >
                  {row.confidence} conf.
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Verdict footnotes */}
      <div className="px-3 py-2 border-t border-border-subtle bg-bg-secondary space-y-1">
        {validRows.slice(0, 8).map((row, i) => (
          <div key={i} className="font-mono text-[9px] text-text-muted leading-relaxed">
            <span className="text-text-secondary font-bold">{row.driver_code}</span>{' '}
            {row.verdict}
          </div>
        ))}
      </div>
    </div>
  )
}
