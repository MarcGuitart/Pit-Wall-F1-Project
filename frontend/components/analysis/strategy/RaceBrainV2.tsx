import type { RaceBrain } from '@/types'

type Props = {
  brain: RaceBrain
  sessionType: string
}

function phaseBadge(chaos: number): string {
  if (chaos >= 80) return 'Extreme chaos race'
  if (chaos >= 60) return 'Weather-affected race'
  if (chaos >= 50) return 'Interrupted race'
  if (chaos >= 25) return 'Strategic pace race'
  return 'Clean strategic race'
}

function tensionBadgeText(brain: RaceBrain): string {
  if (brain.strategic_tension === 'High') return 'Verdict: Strategy over pace'
  if (brain.strategic_tension === 'Medium') return 'Verdict: Balanced strategy'
  return 'Verdict: Pace dominant'
}

const TENSION_COLORS = {
  High:   { text: 'text-signal-red',   bg: 'bg-signal-red/10',   border: 'border-signal-red/25' },
  Medium: { text: 'text-signal-amber', bg: 'bg-signal-amber/10', border: 'border-signal-amber/25' },
  Low:    { text: 'text-signal-green', bg: 'bg-signal-green/10', border: 'border-signal-green/25' },
}

export function RaceBrainV2({ brain, sessionType }: Props) {
  const phase = phaseBadge(brain.chaos_index)
  const tensionStyle = TENSION_COLORS[brain.strategic_tension]

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Race Brain
        </span>
        <span className="font-mono text-[10px] text-text-muted">{sessionType}</span>
      </div>

      <div className="p-4 grid grid-cols-1 xl:grid-cols-[1fr_200px] gap-4">
        {/* Left — question + summary */}
        <div>
          {/* Phase badge */}
          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-signal-purple/10 border border-signal-purple/25 rounded-[3px] mb-3">
            <span className="text-signal-purple text-[11px]">⬡</span>
            <span className="font-display font-bold text-[9px] uppercase tracking-[1px] text-signal-purple">
              {phase}
            </span>
          </div>

          {/* Strategic question */}
          <h3 className="font-display font-bold text-[16px] uppercase tracking-[-0.2px] text-text-primary leading-[1.15] mb-2">
            {brain.main_question}
          </h3>

          {/* Verdict badge */}
          <div className={`inline-flex items-center px-2 py-1 border rounded-[3px] mb-3 ${tensionStyle.bg} ${tensionStyle.border}`}>
            <span className={`font-display font-bold text-[9px] uppercase tracking-[1.2px] ${tensionStyle.text}`}>
              {tensionBadgeText(brain)}
            </span>
          </div>

          {/* Summary */}
          <p className="font-body text-[11px] text-text-secondary leading-[1.55] max-w-[60ch]">
            {brain.summary}
          </p>
        </div>

        {/* Right — metric cards */}
        <div className="flex xl:flex-col gap-2 flex-wrap">
          {/* Chaos score */}
          <div className="flex-1 xl:flex-none bg-bg-elevated border border-border-default rounded-[3px] px-3 py-2 text-center">
            <div
              className="font-display font-black text-[18px] leading-none tabular-nums"
              style={{
                color: brain.chaos_index >= 80 ? '#E8001D' : brain.chaos_index >= 50 ? '#FFB020' : '#23D18B',
              }}
            >
              {brain.chaos_index}
            </div>
            <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mt-0.5">
              Chaos
            </div>
          </div>

          {/* Best tyre */}
          {brain.best_compound && (
            <div className="flex-1 xl:flex-none bg-bg-elevated border border-border-default rounded-[3px] px-3 py-2 text-center">
              <div className="font-display font-black text-[18px] leading-none uppercase tracking-[1px] text-text-primary">
                {brain.best_compound.slice(0, 1)}
              </div>
              <div className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mt-0.5">
                Best tyre
              </div>
            </div>
          )}

          {/* Strategic tension */}
          <div className={`flex-1 xl:flex-none border rounded-[3px] px-3 py-2 text-center ${tensionStyle.bg} ${tensionStyle.border}`}>
            <div className={`font-display font-bold text-[13px] uppercase tracking-[0.5px] leading-none ${tensionStyle.text}`}>
              {brain.strategic_tension}
            </div>
            <div className={`font-display font-bold text-[8px] uppercase tracking-[1.5px] mt-0.5 opacity-70 ${tensionStyle.text}`}>
              Tension
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
