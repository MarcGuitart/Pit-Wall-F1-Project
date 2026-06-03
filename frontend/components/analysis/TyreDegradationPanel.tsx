import type { TyreDegradationRow } from '@/types'
import { formatSlope } from '@/lib/format'
import { COMPOUND_COLORS } from '@/lib/constants'

type Props = {
  rows: TyreDegradationRow[]
  onDriverClick?: (code: string) => void
  focusedDriver?: string | null
}

const CLIFF_STYLES = {
  High:   { bar: 'bg-signal-red',   text: 'text-signal-red border-signal-red/30 bg-signal-red/10' },
  Medium: { bar: 'bg-signal-amber', text: 'text-signal-amber border-signal-amber/30 bg-signal-amber/10' },
  Low:    { bar: 'bg-signal-green', text: 'text-signal-green border-signal-green/30 bg-signal-green/10' },
}

const CONF_TEXT = {
  High:   'text-signal-green',
  Medium: 'text-signal-amber',
  Low:    'text-text-muted',
}

const MAX_SLOPE = 0.10

export function TyreDegradationPanel({ rows, onDriverClick, focusedDriver }: Props) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Tyre Degradation
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          s/lap slope · polyfit deg-1
        </span>
      </div>

      <div className="divide-y divide-border-subtle">
        {rows.map((row, i) => {
          const cliffStyle = CLIFF_STYLES[row.cliff_risk]
          const barWidth = Math.min((row.degradation_slope / MAX_SLOPE) * 100, 100)
          const compoundColor = COMPOUND_COLORS[row.compound] ?? '#8A94A6'
          const lapCount = row.lap_end - row.lap_start + 1
          const isFocused = focusedDriver === row.driver_code
          const isDefocused = focusedDriver != null && !isFocused

          return (
            <div
              key={i}
              className={[
                'px-3 py-2.5 transition-all',
                onDriverClick ? 'cursor-pointer' : '',
                isFocused ? 'bg-bg-elevated' : '',
                isDefocused ? 'opacity-40' : '',
                onDriverClick && !isDefocused ? 'hover:bg-bg-elevated' : '',
              ].join(' ')}
              onClick={() => onDriverClick?.(row.driver_code)}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-display font-black"
                  style={{
                    backgroundColor: compoundColor + '22',
                    border: `1.5px solid ${compoundColor}`,
                    color: compoundColor,
                  }}
                >
                  {row.compound.slice(0, 1)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-[11px] uppercase tracking-[0.5px] text-text-primary">
                      {row.driver_code}
                    </span>
                    <span className="font-mono text-[9px] text-text-muted">
                      Stint {row.stint_number}
                    </span>
                  </div>
                </div>

                <span className="font-mono font-bold text-[12px] tabular-nums text-text-primary">
                  {formatSlope(row.degradation_slope)}
                </span>

                <span
                  className={`px-2 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${cliffStyle.text}`}
                >
                  {row.cliff_risk}
                </span>
              </div>

              <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full rounded-full transition-all ${cliffStyle.bar}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-[9px] text-text-muted">
                  L{row.lap_start}–{row.lap_end} ({lapCount} laps)
                </span>
                {row.tyre_age_start != null && (
                  <span className="font-mono text-[9px] text-text-muted">
                    Age +{row.tyre_age_start}
                  </span>
                )}
                <span className={`font-mono text-[9px] ml-auto ${CONF_TEXT[row.confidence]}`}>
                  {row.confidence} conf.
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
