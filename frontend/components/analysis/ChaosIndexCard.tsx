import type { ChaosIndex } from '@/types'

type Props = {
  chaos: ChaosIndex
}

const LEVEL_COLOR = {
  Low:     '#23D18B',
  Medium:  '#FFB020',
  High:    '#E8001D',
  Extreme: '#E8001D',
}

const COMPONENTS: { key: keyof ChaosIndex['components']; label: string; max: number }[] = [
  { key: 'safety_car',         label: 'Safety Car',         max: 30 },
  { key: 'yellow_flags',       label: 'Yellow Flags',       max: 20 },
  { key: 'investigations',     label: 'Investigations',     max: 20 },
  { key: 'penalties',          label: 'Penalties',          max: 15 },
  { key: 'weather',            label: 'Weather Events',     max: 15 },
  { key: 'position_volatility','label': 'Position Volatility', max: 20 },
]

export function ChaosIndexCard({ chaos }: Props) {
  const color = LEVEL_COLOR[chaos.level]

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Chaos Index
        </span>
        <span
          className="font-display font-bold text-[10px] uppercase tracking-[1px]"
          style={{ color }}
        >
          {chaos.level}
        </span>
      </div>

      <div className="p-4">
        {/* Score + level */}
        <div className="flex items-end gap-4 mb-6">
          <div>
            <div
              className="font-display font-black text-[64px] leading-none tabular-nums"
              style={{ color }}
            >
              {chaos.score}
            </div>
            <div className="font-display font-bold text-[9px] uppercase tracking-[2px] text-text-muted">
              / 100
            </div>
          </div>
          <div className="mb-2 flex-1">
            <p className="font-mono text-[11px] text-text-secondary leading-relaxed">
              {chaos.summary}
            </p>
          </div>
        </div>

        {/* Component bars */}
        <div className="space-y-2 mb-4">
          {COMPONENTS.map(({ key, label, max }) => {
            const value = chaos.components[key]
            const pct = Math.round((value / max) * 100)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-text-muted">
                    {label}
                  </span>
                  <span className="font-mono text-[9px] text-text-secondary tabular-nums">
                    {value}/{max}
                  </span>
                </div>
                <div className="h-[3px] bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color + 'AA' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Peak chaos lap */}
        {chaos.peak_chaos_lap != null && (
          <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated border border-border-default rounded-[3px]">
            <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Peak chaos lap
            </span>
            <span
              className="font-mono font-bold text-[14px] tabular-nums"
              style={{ color }}
            >
              L{chaos.peak_chaos_lap}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
