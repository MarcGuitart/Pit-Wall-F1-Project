import type { CleanAirValue } from '@/types'
import { MethodologyBadge } from '@/components/ui/MethodologyBadge'
import { EstimatedLabel } from '@/components/ui/EstimatedLabel'

type Props = {
  data: CleanAirValue | null
}

const CONFIDENCE_CLS: Record<string, string> = {
  High:   'text-signal-green border-signal-green/30 bg-signal-green/10',
  Medium: 'text-signal-amber border-signal-amber/30 bg-signal-amber/10',
  Low:    'text-text-muted border-border-subtle bg-transparent',
}

export function CleanAirValueCard({ data }: Props) {
  const isActive =
    data !== null &&
    data.estimated_gain !== null &&
    data.confidence !== 'Low'

  // ── Greyed-out state ──────────────────────────────────────────────────────
  if (!isActive) {
    return (
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
        <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
          <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-muted">
            Clean Air Value
          </span>
          <MethodologyBadge module="drs" />
        </div>
        <div className="p-3 flex flex-col items-center justify-center gap-2 min-h-[80px]">
          <p className="font-mono text-[10px] text-text-muted text-center">
            Insufficient comparison data for this session
          </p>
          <p className="font-mono text-[9px] text-text-muted text-center opacity-60">
            Requires clean laps before and after escaping traffic
          </p>
        </div>
      </div>
    )
  }

  // ── Active state ──────────────────────────────────────────────────────────
  const gains = data!.drivers.map((d) => d.gain)
  const minGain = Math.min(...gains)
  const maxGain = Math.max(...gains)

  const rangeLabel =
    gains.length >= 2
      ? `+${minGain.toFixed(2)}–${maxGain.toFixed(2)} s/lap`
      : `+${(data!.estimated_gain ?? 0).toFixed(2)} s/lap`

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Clean Air Value
        </span>
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.5px] ${CONFIDENCE_CLS[data!.confidence] ?? ''}`}>
            {data!.confidence} confidence
          </span>
          <MethodologyBadge module="drs" />
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Main value */}
        <div className="flex items-end gap-3">
          <span className="font-display font-black text-[24px] leading-none text-signal-blue tabular-nums">
            {rangeLabel}
          </span>
        </div>

        {/* Strategic implication */}
        <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
          {data!.strategic_implication}
        </p>

        {/* Per-driver breakdown */}
        {data!.drivers.length > 0 && (
          <div className="space-y-1.5">
            <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted">
              Driver comparison
            </div>
            {data!.drivers.slice(0, 3).map((est) => (
              <div key={est.driver_code} className="flex items-center justify-between gap-2 bg-bg-elevated border border-border-subtle rounded-[2px] px-2 py-1.5">
                <span className="px-1.5 py-0.5 bg-signal-blue/10 border border-signal-blue/30 rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] text-signal-blue shrink-0">
                  {est.driver_code}
                </span>
                <span className="font-mono font-bold text-[11px] text-signal-blue tabular-nums shrink-0">
                  +{est.gain.toFixed(3)}s
                </span>
                <span className="font-mono text-[8px] text-text-muted truncate flex-1 min-w-0 text-right">
                  {est.context}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <div className="pt-1 border-t border-border-subtle">
          <EstimatedLabel />
          <span className="font-mono text-[8px] text-text-muted ml-1.5">
            estimated from pace comparison — small sample
          </span>
        </div>
      </div>
    </div>
  )
}
