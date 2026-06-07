import type { ChaosIndex } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = { chaos: ChaosIndex }

const LEVEL_COLOR: Record<string, string> = {
  Low: '#23D18B', Medium: '#FFB020', High: '#E8001D', Extreme: '#E8001D',
}

const COMPONENTS: { key: keyof ChaosIndex['components']; label: string; max: number }[] = [
  { key: 'safety_car',          label: 'SC/VSC',     max: 30 },
  { key: 'yellow_flags',        label: 'Yellows',    max: 20 },
  { key: 'investigations',      label: 'Invest.',    max: 20 },
  { key: 'weather',             label: 'Weather',    max: 15 },
  { key: 'position_volatility', label: 'Volatility', max: 20 },
]

export function ChaosProfile({ chaos }: Props) {
  const color = LEVEL_COLOR[chaos.level] ?? '#8A94A6'
  const isLow = chaos.score < 20

  // Check if there are any meaningful events to display
  const hasEvents = Object.values(chaos.components).some((v) => v > 0)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Chaos Profile
        </span>
        <div className="flex items-center gap-2">
          <span
            className="font-display font-bold text-[10px] uppercase tracking-[1px]"
            style={{ color }}
          >
            {chaos.level}
          </span>
          <MethodologyBadge module="chaos" />
        </div>
      </div>

      <div className="p-3">
        {isLow ? (
          // Simplified low-disruption view
          <div className="flex items-start gap-4">
            <div>
              <div
                className="font-display font-black tabular-nums leading-none"
                style={{ fontSize: '44px', color }}
              >
                {chaos.score}
              </div>
              <div
                className="font-display font-bold text-[9px] uppercase tracking-[2px] mt-0.5"
                style={{ color }}
              >
                LOW DISRUPTION RACE
              </div>
              <div className="mt-1">
                <EstimatedLabel />
              </div>
            </div>
            <div className="flex-1 pt-1">
              <p className="font-mono text-[10px] text-text-muted leading-relaxed">
                {chaos.summary || 'Minimal incidents. Race ran without significant SC, VSC, or weather disruption.'}
              </p>
              {chaos.peak_chaos_lap != null && (
                <div className="font-mono text-[9px] text-text-muted mt-2">
                  Peak incident: L{chaos.peak_chaos_lap}
                </div>
              )}
            </div>
          </div>
        ) : (
          // Full chaos view
          <div className="grid grid-cols-2 gap-3">
            {/* Left — score */}
            <div>
              <div
                className="font-display font-black tabular-nums leading-none"
                style={{ fontSize: '44px', color }}
              >
                {chaos.score}
              </div>
              <div
                className="font-display font-bold text-[9px] uppercase tracking-[2px] mt-0.5"
                style={{ color }}
              >
                {chaos.level}
              </div>
              {chaos.peak_chaos_lap != null && (
                <div className="font-mono text-[9px] text-text-muted mt-1">
                  Peak: L{chaos.peak_chaos_lap}
                </div>
              )}
              <div className="mt-1">
                <EstimatedLabel />
              </div>
            </div>

            {/* Right — component bars (only if there are events) */}
            {hasEvents && (
              <div className="space-y-1.5 self-center">
                {COMPONENTS.map(({ key, label, max }) => {
                  const value = chaos.components[key]
                  const pct = max > 0 ? Math.round((value / max) * 100) : 0
                  if (value === 0) return null
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-[2px]">
                        <span className="font-display font-bold text-[8px] uppercase tracking-[0.5px] text-text-muted">
                          {label}
                        </span>
                        <span className="font-mono text-[8px] text-text-secondary tabular-nums">
                          {value}
                        </span>
                      </div>
                      <div className="h-[3px] bg-bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: color + 'AA' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Summary line — always shown */}
        {chaos.summary && !isLow && (
          <p className="font-mono text-[9px] text-text-muted mt-2 pt-2 border-t border-border-subtle leading-relaxed">
            {chaos.summary}
          </p>
        )}
      </div>
    </div>
  )
}
