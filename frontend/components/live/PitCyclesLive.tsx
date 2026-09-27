import type { PitCycleLive } from '@/types/live'

type Props = {
  cycles: PitCycleLive[]
  settleLaps: number
  currentLap: number
}

/**
 * A pit cycle is the causal unit for a position change: a driver's place moves
 * because the group around him stops over a window of laps. It is read
 * `settleLaps` laps after its last stop, once the out-laps have settled.
 *
 * Live, that matters. Before the close lap the deltas exist but are wrong —
 * cars are still on out-laps and still passing each other — so an open cycle
 * shows who stopped and when, and nothing about who gained. The number the
 * page would have shown early is not a rougher version of the right answer; it
 * is a different answer, and it would change under the reader.
 */
export function PitCyclesLive({ cycles, settleLaps, currentLap }: Props) {
  const recent = [...cycles].reverse().slice(0, 4)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Pit cycles
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          read {settleLaps} laps after the last stop
        </span>
      </div>

      {recent.length === 0 ? (
        <p className="px-3 py-6 text-center font-mono text-[11px] text-text-muted">
          No stops yet.
        </p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {recent.map((cycle) => {
            const open = cycle.status === 'in progress'
            return (
              <div key={cycle.cycle_id} className="px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono font-bold text-[11px] text-text-primary tabular-nums">
                    L{cycle.lap_start}–{cycle.lap_end}
                  </span>
                  <span
                    className={[
                      'px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px]',
                      open
                        ? 'text-signal-blue border-signal-blue/40 bg-signal-blue/10'
                        : 'text-text-secondary border-border-default bg-bg-elevated',
                    ].join(' ')}
                  >
                    {open ? `settles on L${cycle.closes_on_lap}` : 'read'}
                  </span>
                  {cycle.neutralised && (
                    <span className="px-1.5 py-0.5 border border-signal-amber/40 bg-signal-amber/10 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-signal-amber">
                      under SC/VSC
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-text-muted ml-auto">
                    {cycle.stops} stop{cycle.stops === 1 ? '' : 's'}
                  </span>
                </div>

                <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
                  {cycle.summary}
                </p>

                {open ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {cycle.participants.map((p) => (
                      <span
                        key={p.driver_number}
                        className="px-1.5 py-0.5 bg-bg-elevated border border-border-subtle rounded-[2px] font-mono text-[9px] text-text-secondary"
                      >
                        {p.driver_code} L{p.stop_laps.join(', L')}
                      </span>
                    ))}
                  </div>
                ) : (
                  cycle.undercuts.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {cycle.undercuts.map((u, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 border border-signal-purple/40 bg-signal-purple/10 rounded-[2px] font-mono text-[9px] text-signal-purple"
                        >
                          {u.attacker} undercut {u.target}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-border-subtle">
        <p className="font-mono text-[9px] text-text-muted leading-relaxed">
          Currently on lap {currentLap}. An open cycle shows its stops but no gains or losses —
          positions are still moving and any delta published now would change.
        </p>
      </div>
    </div>
  )
}
