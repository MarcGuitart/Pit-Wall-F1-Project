import type { PitImpactRow } from '@/types'

type Props = {
  pitImpactRows: PitImpactRow[]
  onDriverClick: (code: string) => void
  onViewAll: () => void
  sessionType: string
}

function NetDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="font-display font-bold text-[14px] text-text-muted">–</span>
  if (delta > 0) return <span className="font-display font-bold text-[14px] text-signal-green">+{delta}</span>
  if (delta < 0) return <span className="font-display font-bold text-[14px] text-signal-red">{delta}</span>
  return <span className="font-display font-bold text-[14px] text-text-muted">±0</span>
}

const VERDICT_PILL = (verdict: string) => {
  const v = verdict.toLowerCase()
  if (v.includes('excellent') || v.includes('gained') || v.includes('good'))
    return 'text-signal-green border-signal-green/30 bg-signal-green/10'
  if (v.includes('slow') || v.includes('lost') || v.includes('costly'))
    return 'text-signal-red border-signal-red/30 bg-signal-red/10'
  return 'text-signal-blue border-signal-blue/30 bg-signal-blue/10'
}

export function PitSequenceSummary({ pitImpactRows, onDriverClick, onViewAll, sessionType }: Props) {
  if (sessionType !== 'Race') return null

  // Exclude red-flag holds (stop_duration == 0 or very low)
  const validRows = pitImpactRows.filter(
    (r) => r.stop_duration == null || r.stop_duration > 0.5
  )

  // Missing lane timing
  const allMissingLane = validRows.every((r) => r.lane_duration == null)

  const winners = validRows
    .filter((r) => (r.net_position_change ?? 0) > 0)
    .sort((a, b) => (b.net_position_change ?? 0) - (a.net_position_change ?? 0))
    .slice(0, 3)

  const losers = validRows
    .filter((r) => (r.net_position_change ?? 0) < 0)
    .sort((a, b) => (a.net_position_change ?? 0) - (b.net_position_change ?? 0))
    .slice(0, 3)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Pit Sequence
        </span>
        <span className="font-mono text-[10px] text-text-muted">winners · losers</span>
      </div>

      {allMissingLane ? (
        <div className="p-4">
          <div className="bg-bg-elevated border border-border-default rounded-[3px] p-3 text-center">
            <div className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary mb-1">
              Pit lane timing unavailable
            </div>
            <p className="font-mono text-[10px] text-text-muted">
              Showing position change only — no lane duration data from OpenF1 for this session.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Winners */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-signal-green">
                  Gained
                </span>
              </div>
              <div className="space-y-1.5">
                {winners.length === 0 ? (
                  <p className="font-mono text-[9px] text-text-muted">No net gainers</p>
                ) : (
                  winners.map((row, i) => (
                    <div
                      key={i}
                      onClick={() => onDriverClick(row.driver_code)}
                      className="flex items-center gap-2 cursor-pointer hover:bg-bg-elevated px-1.5 py-1 rounded-[2px] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-display font-bold text-[11px] uppercase text-text-primary">
                          {row.driver_code}
                        </span>
                        <div className="font-mono text-[8px] text-text-muted">L{row.lap_number}</div>
                      </div>
                      <NetDelta delta={row.net_position_change} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Losers */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-signal-red" />
                <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-signal-red">
                  Lost
                </span>
              </div>
              <div className="space-y-1.5">
                {losers.length === 0 ? (
                  <p className="font-mono text-[9px] text-text-muted">No net losers</p>
                ) : (
                  losers.map((row, i) => (
                    <div
                      key={i}
                      onClick={() => onDriverClick(row.driver_code)}
                      className="flex items-center gap-2 cursor-pointer hover:bg-bg-elevated px-1.5 py-1 rounded-[2px] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-display font-bold text-[11px] uppercase text-text-primary">
                          {row.driver_code}
                        </span>
                        <div className="font-mono text-[8px] text-text-muted">L{row.lap_number}</div>
                      </div>
                      <NetDelta delta={row.net_position_change} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onViewAll}
            className="w-full text-center font-mono text-[10px] text-text-muted hover:text-signal-blue transition-colors py-1 border-t border-border-subtle"
          >
            View full pit stop data ({validRows.length} stops) →
          </button>
        </div>
      )}
    </div>
  )
}
