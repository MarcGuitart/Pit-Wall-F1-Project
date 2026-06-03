import type { TyreDegradationRow, EngineerNote } from '@/types'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'

type Props = {
  degradationRows: TyreDegradationRow[]
  notes: EngineerNote[]
  sessionType: string
}

export function TrackEvolutionPanel({ degradationRows, notes, sessionType }: Props) {
  // Rough track evolution estimate: compare early vs late stint slopes
  const sorted = [...degradationRows].sort((a, b) => a.lap_start - b.lap_start)
  const mid = Math.floor(sorted.length / 2)
  const early = sorted.slice(0, mid)
  const late = sorted.slice(mid)

  const avgSlope = (rows: typeof sorted) =>
    rows.length ? rows.reduce((s, r) => s + r.degradation_slope, 0) / rows.length : null

  const earlyAvg = avgSlope(early)
  const lateAvg = avgSlope(late)
  const improvement =
    earlyAvg != null && lateAvg != null ? earlyAvg - lateAvg : null

  const bestWindow =
    lateAvg != null && earlyAvg != null && lateAvg < earlyAvg
      ? 'Late session (improved surface grip)'
      : 'Early session (fresher rubber advantage)'

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Track Evolution
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-muted">{sessionType}</span>
          <MethodologyBadge module="degradation" />
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Track gain estimate */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-bg-elevated border border-border-default rounded-[3px] px-3 py-2">
            <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mb-0.5">
              Track improvement
            </div>
            <div className="font-mono font-bold text-[14px] text-text-primary">
              {improvement != null
                ? `~${(improvement * 1000).toFixed(0)}ms / stint`
                : '–'}
            </div>
            <div className="mt-0.5">
              <EstimatedLabel />
            </div>
          </div>
          <div className="flex-1 bg-bg-elevated border border-border-default rounded-[3px] px-3 py-2">
            <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mb-0.5">
              Best time window
            </div>
            <div className="font-mono text-[11px] text-text-primary leading-tight">
              {bestWindow}
            </div>
          </div>
        </div>

        {/* Benefited / Compromised placeholders */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-bg-elevated border border-border-subtle rounded-[3px] px-2 py-1.5">
            <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-signal-green mb-1">
              Benefited
            </div>
            <p className="font-mono text-[9px] text-text-muted">
              Drivers who improved late in session
            </p>
            <p className="font-mono text-[9px] text-text-muted italic mt-0.5">
              Full analysis in next update
            </p>
          </div>
          <div className="bg-bg-elevated border border-border-subtle rounded-[3px] px-2 py-1.5">
            <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-signal-amber mb-1">
              Compromised
            </div>
            <p className="font-mono text-[9px] text-text-muted">
              Traffic or early-run penalty
            </p>
            <p className="font-mono text-[9px] text-text-muted italic mt-0.5">
              Full analysis in next update
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
