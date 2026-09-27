import { CHAOS_LEVEL_COLOR } from '@/lib/chaos'
import type { LiveChaos } from '@/types/live'

type Props = { chaos: LiveChaos | null }

const COMPONENT_LABEL: Record<string, string> = {
  safety_car: 'SC / VSC',
  yellow_flags: 'Yellow flags',
  stewarding: 'Incidents & penalties',
  weather: 'Wet laps',
  position_volatility: 'Position volatility',
}

/**
 * Live, this is a density, not an index.
 *
 * Every chaos component is `affected laps / total laps`, and live the
 * denominator is the laps run so far — so the same two-lap safety car reads 50
 * on lap 4 and 4 on lap 50. The level bands (Low/Medium/High/Extreme) were
 * calibrated on finished races, so no level is shown until the chequered flag.
 * The bar is drawn in neutral blue while provisional and takes the level colour
 * only when the number is final.
 */
export function ChaosDensityMeter({ chaos }: Props) {
  if (!chaos || chaos.score == null) {
    return (
      <Panel title="Chaos density">
        <p className="px-3 py-6 text-center font-mono text-[11px] text-text-muted leading-relaxed">
          {chaos?.caveat ??
            'Not computable yet — the timeline needs at least one completed lap.'}
        </p>
      </Panel>
    )
  }

  const color = chaos.final && chaos.level ? CHAOS_LEVEL_COLOR[chaos.level] : '#4DA3FF'

  return (
    <Panel
      title={chaos.final ? 'Chaos Index' : 'Chaos density'}
      right={
        chaos.final && chaos.level ? (
          <span className="font-display font-bold text-[10px] uppercase tracking-[1px]" style={{ color }}>
            {chaos.level}
          </span>
        ) : (
          <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-text-muted">
            provisional
          </span>
        )
      }
    >
      <div className="p-4">
        <div className="flex items-end gap-4 mb-4">
          <div>
            <div className="font-display font-black text-[56px] leading-none tabular-nums" style={{ color }}>
              {chaos.score}
            </div>
            <div className="font-display font-bold text-[9px] uppercase tracking-[2px] text-text-muted">
              / 100
            </div>
          </div>
          <div className="mb-1.5 flex-1">
            {!chaos.final && (
              <div className="inline-flex items-center px-1.5 py-0.5 mb-1.5 border border-signal-blue/40 bg-signal-blue/10 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-signal-blue">
                No level until the flag
              </div>
            )}
            <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
              Over {chaos.denominator_laps} lap{chaos.denominator_laps === 1 ? '' : 's'} run so far.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {chaos.breakdown.map((row) => {
            const pct = row.weight > 0 ? Math.round((row.points / row.weight) * 100) : 0
            return (
              <div key={row.component} title={row.note ?? undefined}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-text-muted">
                    {COMPONENT_LABEL[row.component] ?? row.component}
                  </span>
                  <span className="font-mono text-[9px] text-text-secondary tabular-nums">
                    {row.points}/{row.weight}
                  </span>
                </div>
                <div className="h-[3px] bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color + 'AA' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {chaos.peak_chaos_lap != null && (
          <div className="flex items-center justify-between px-3 py-2 mb-3 bg-bg-elevated border border-border-default rounded-[3px]">
            <span className="font-display font-bold text-[9px] uppercase tracking-[1.5px] text-text-muted">
              Busiest lap so far
            </span>
            <span className="font-mono font-bold text-[14px] tabular-nums" style={{ color }}>
              L{chaos.peak_chaos_lap}
            </span>
          </div>
        )}

        <p className="font-mono text-[9px] text-text-muted leading-relaxed">
          {chaos.caveat} Method {chaos.method_version}.
        </p>
      </div>
    </Panel>
  )
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          {title}
        </span>
        {right}
      </div>
      {children}
    </div>
  )
}
