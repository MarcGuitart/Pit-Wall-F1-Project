import type { FullRaceAnalysis, ModuleState } from '@/types'

/**
 * Card shown in place of a V4 module that has no content.
 * "Not applicable" (muted) and "failed" (red) must never look the same.
 */
export function moduleState(analysis: FullRaceAnalysis, field: string): ModuleState {
  return analysis.modules?.[field]?.status ?? 'not_applicable'
}

type Props = {
  title: string
  analysis: FullRaceAnalysis
  field: string
}

export function ModuleUnavailable({ title, analysis, field }: Props) {
  const status = analysis.modules?.[field]
  const failed = status?.status === 'failed'
  const reason = status?.reason ?? null

  return (
    <div
      className="bg-bg-elevated rounded-[4px] px-4 py-3"
      style={{ border: failed ? '1px dashed rgba(232,0,29,0.45)' : '1px dashed #252D3A' }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-muted">
          {title}
        </span>
        <span
          className={`px-1.5 py-0.5 border border-dashed rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${
            failed ? 'border-signal-red/50 text-signal-red' : 'border-border-default text-text-muted'
          }`}
        >
          {failed ? 'Failed' : 'Not applicable'}
        </span>
      </div>
      <p className="font-mono text-[10px] text-text-muted">
        {failed
          ? `This module could not be computed for this session.${reason ? ` (${reason})` : ''}`
          : reason ?? 'Nothing to show for this race.'}
      </p>
    </div>
  )
}
