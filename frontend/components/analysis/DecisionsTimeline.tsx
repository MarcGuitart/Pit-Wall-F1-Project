import type { RaceDecision } from '@/types'

type Props = {
  decisions: RaceDecision[]
}

const IMPACT_COLOR = (impact: string) => {
  const i = impact.toLowerCase()
  if (i.includes('+') || i.includes('gained') || i.includes('saved'))
    return 'text-signal-green'
  if (i.includes('-') || i.includes('lost') || i.includes('surrendered') || i.includes('backfired'))
    return 'text-signal-red'
  return 'text-signal-amber'
}

const CONFIDENCE_STYLE = {
  High:   'text-signal-green border-signal-green/40 bg-signal-green/10',
  Medium: 'text-signal-amber border-signal-amber/40 bg-signal-amber/10',
  Low:    'text-text-muted border-border-default bg-bg-elevated',
}

export function DecisionsTimeline({ decisions }: Props) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          5 Key Decisions
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          Ranked by impact
        </span>
      </div>

      <div className="divide-y divide-border-subtle">
        {decisions.map((decision) => (
          <div key={decision.rank} className="px-3 py-3 flex gap-3">
            {/* Rank watermark */}
            <div className="w-8 shrink-0 pt-1">
              <span className="font-display font-black text-[28px] leading-none text-bg-elevated select-none tabular-nums"
                style={{ WebkitTextStroke: '1px #252D3A' }}
              >
                {decision.rank}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-0.5 flex-wrap">
                <span className="font-display font-bold text-[12px] uppercase tracking-[0.3px] text-text-primary leading-tight">
                  {decision.title}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {decision.lap_number != null && (
                    <span className="font-mono text-[9px] text-text-muted">
                      L{decision.lap_number}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 border rounded-[2px] font-display font-bold text-[8px] uppercase tracking-[0.5px] ${
                      CONFIDENCE_STYLE[decision.confidence]
                    }`}
                  >
                    {decision.confidence.slice(0, 3)}
                  </span>
                </div>
              </div>

              {/* Impact */}
              <div
                className={`font-display font-bold text-[11px] uppercase tracking-[0.5px] mb-1 ${IMPACT_COLOR(decision.impact)}`}
              >
                {decision.impact}
              </div>

              {/* Explanation */}
              <p className="font-mono text-[10px] text-text-secondary leading-relaxed">
                {decision.explanation}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
