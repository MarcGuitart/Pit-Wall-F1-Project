import type { FullRaceAnalysis, ModuleState } from '@/types'
import { StatusBadge, ui } from '@/components/ui'
import a from './analysis.module.css'

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
    <section className={`${a.unavailable} ${failed ? a.unavailableFailed : a.unavailableNa}`} aria-label={`${title}: ${failed ? 'failed' : 'not applicable'}`}>
      <div className={a.between}>
        <h3 className={ui.h6}>{title}</h3>
        <StatusBadge state={failed ? 'failed' : 'not_applicable'} />
      </div>
      <p className={a.para}>
        {failed
          ? `This module could not be computed for this session.${reason ? ` (${reason})` : ''}`
          : reason ?? 'Nothing to show for this race.'}
      </p>
    </section>
  )
}
