import type { PitImpactRow } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  pitImpactRows: PitImpactRow[]
  onDriverClick: (code: string) => void
  onViewAll: () => void
  sessionType: string
}

function NetDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="font-display font-bold text-[13px] text-text-muted">–</span>
  if (delta > 0)  return <span className="font-display font-bold text-[13px] text-signal-green">+{delta}</span>
  if (delta < 0)  return <span className="font-display font-bold text-[13px] text-signal-red">{delta}</span>
  return <span className="font-display font-bold text-[13px] text-text-muted">±0</span>
}

export function PitSequenceSummary({ pitImpactRows, onDriverClick, onViewAll, sessionType }: Props) {
  if (sessionType !== 'Race') return null

  const valid = pitImpactRows.filter((r) => r.stop_duration == null || r.stop_duration > 0.5)
  const noData = valid.length === 0
  const allMissingLane = valid.every((r) => r.lane_duration == null)

  const winners = valid.filter((r) => (r.net_position_change ?? 0) > 0)
    .sort((a, b) => (b.net_position_change ?? 0) - (a.net_position_change ?? 0)).slice(0, 3)
  const losers = valid.filter((r) => (r.net_position_change ?? 0) < 0)
    .sort((a, b) => (a.net_position_change ?? 0) - (b.net_position_change ?? 0)).slice(0, 3)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Pit Sequence
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">winners · losers</span>
          <MethodologyBadge module="pit" />
        </div>
      </div>

      {noData ? (
        <div className="p-4">
          <div className="bg-bg-elevated border border-border-default rounded-[3px] p-3 text-center">
            <div className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary mb-1">
              No pit stop data available
            </div>
            <p className="font-mono text-[10px] text-text-muted">OpenF1 returned no pit records for this session.</p>
          </div>
        </div>
      ) : allMissingLane ? (
        <div className="p-4">
          <div className="bg-bg-elevated border border-border-default rounded-[3px] p-3 text-center">
            <div className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-secondary mb-1">
              Pit lane timing unavailable
            </div>
            <p className="font-mono text-[10px] text-text-muted">Showing position change only — no lane duration data from OpenF1.</p>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            {/* Winners */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-signal-green">Gained</span>
              </div>
              <div className="space-y-1">
                {winners.length === 0
                  ? <p className="font-mono text-[9px] text-text-muted">No net gainers</p>
                  : winners.map((row, i) => (
                    <div key={i} onClick={() => onDriverClick(row.driver_code)}
                      className="flex items-center gap-2 cursor-pointer hover:bg-bg-elevated px-1 py-0.5 rounded-[2px] transition-colors">
                      <div className="flex-1">
                        <span className="font-display font-bold text-[10px] uppercase text-text-primary">{row.driver_code}</span>
                        <div className="font-mono text-[8px] text-text-muted">L{row.lap_number}</div>
                      </div>
                      <NetDelta delta={row.net_position_change} />
                    </div>
                  ))}
              </div>
            </div>
            {/* Losers */}
            <div>
              <div className="flex items-center gap-1 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-signal-red" />
                <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-signal-red">Lost</span>
              </div>
              <div className="space-y-1">
                {losers.length === 0
                  ? <p className="font-mono text-[9px] text-text-muted">No net losers</p>
                  : losers.map((row, i) => (
                    <div key={i} onClick={() => onDriverClick(row.driver_code)}
                      className="flex items-center gap-2 cursor-pointer hover:bg-bg-elevated px-1 py-0.5 rounded-[2px] transition-colors">
                      <div className="flex-1">
                        <span className="font-display font-bold text-[10px] uppercase text-text-primary">{row.driver_code}</span>
                        <div className="font-mono text-[8px] text-text-muted">L{row.lap_number}</div>
                      </div>
                      <NetDelta delta={row.net_position_change} />
                    </div>
                  ))}
              </div>
            </div>
          </div>
          <button onClick={onViewAll}
            className="w-full text-center font-mono text-[9px] text-text-muted hover:text-signal-blue transition-colors py-1 border-t border-border-subtle">
            Full pit data ({valid.length} stops) →
          </button>
        </div>
      )}
    </div>
  )
}
