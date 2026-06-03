import type { RaceBrain as RaceBrainType } from '@/types'

type Props = {
  data: RaceBrainType
  chaosScore: number
}

const TENSION_COLORS = {
  Low:    'text-signal-green border-signal-green/30 bg-signal-green/10',
  Medium: 'text-signal-amber border-signal-amber/30 bg-signal-amber/10',
  High:   'text-signal-red border-signal-red/30 bg-signal-red/10',
}

export function RaceBrain({ data, chaosScore }: Props) {
  const tensionColor = TENSION_COLORS[data.strategic_tension]

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Panel header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Race Brain
        </span>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-signal-purple/20 border border-signal-purple/30 text-signal-purple font-display font-bold text-[9px] uppercase tracking-[1px] rounded-[2px]">
            {data.race_phase}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-6 flex-wrap xl:flex-nowrap">
          {/* Left: question + summary */}
          <div className="flex-1 min-w-[280px]">
            <h3 className="font-display font-bold text-[17px] uppercase tracking-[-0.2px] text-text-primary leading-tight mb-2">
              {data.main_question}
            </h3>
            <p
              className="font-body text-[11px] text-text-secondary leading-[1.55]"
              style={{ maxWidth: '64ch' }}
            >
              {data.summary}
            </p>
          </div>

          {/* Right: metric pills */}
          <div className="flex items-center gap-2 flex-wrap xl:flex-nowrap shrink-0">
            {/* Chaos score */}
            <div className="flex flex-col items-center px-4 py-3 bg-bg-elevated border border-border-default rounded-[3px] min-w-[72px]">
              <span
                className="font-mono font-bold text-[28px] leading-none"
                style={{
                  color:
                    chaosScore >= 80
                      ? '#E8001D'
                      : chaosScore >= 50
                      ? '#FFB020'
                      : '#23D18B',
                }}
              >
                {chaosScore}
              </span>
              <span className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mt-1">
                Chaos
              </span>
            </div>

            {/* Best compound */}
            {data.best_compound && (
              <div className="flex flex-col items-center px-4 py-3 bg-bg-elevated border border-border-default rounded-[3px] min-w-[72px]">
                <span className="font-display font-black text-[16px] uppercase tracking-[1px] text-text-primary">
                  {data.best_compound.slice(0, 1)}
                </span>
                <span className="font-display font-bold text-[8px] uppercase tracking-[1.5px] text-text-muted mt-1">
                  Best tyre
                </span>
              </div>
            )}

            {/* Strategic tension */}
            <div
              className={`flex flex-col items-center px-4 py-3 border rounded-[3px] min-w-[80px] ${tensionColor}`}
            >
              <span className="font-display font-bold text-[13px] uppercase tracking-[0.5px]">
                {data.strategic_tension}
              </span>
              <span className="font-display font-bold text-[8px] uppercase tracking-[1.5px] opacity-70 mt-1">
                Tension
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
