import type { RaceBrain } from '@/types'
import { chaosLevel, CHAOS_LEVEL_TONE, type ChaosLevel } from '@/lib/chaos'
import { Badge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  brain: RaceBrain
  sessionType: string
}

const PHASE_BADGE: Record<ChaosLevel, string> = {
  Extreme: 'Extreme chaos race',
  High: 'Interrupted race',
  Medium: 'Strategic pace race',
  Low: 'Clean strategic race',
}

function phaseBadge(chaos: number): string {
  return PHASE_BADGE[chaosLevel(chaos)]
}

function tensionBadgeText(brain: RaceBrain): string {
  if (brain.strategic_tension === 'High') return 'Verdict: Strategy over pace'
  if (brain.strategic_tension === 'Medium') return 'Verdict: Balanced strategy'
  return 'Verdict: Pace dominant'
}

const TENSION_TONE: Record<RaceBrain['strategic_tension'], Tone> = { High: 'accent', Medium: 'warn', Low: 'ok' }

export function RaceBrainV2({ brain, sessionType }: Props) {
  const phase = phaseBadge(brain.chaos_index)
  const tension = TENSION_TONE[brain.strategic_tension]

  return (
    <Panel title="Race Brain" aside={sessionType}>
      <div className={a.brain}>
        {/* Left — question + summary */}
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div><Badge tone="purple"><span aria-hidden="true">⬡</span>{phase}</Badge></div>
          <h4 className={a.brainQ}>{brain.main_question}</h4>
          <div><Badge tone={tension} solid={brain.strategic_tension === 'High'}>{tensionBadgeText(brain)}</Badge></div>
          <p className={a.para} style={{ maxWidth: '62ch' }}>{brain.summary}</p>
        </div>

        {/* Right — readings */}
        <div className={a.kv} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', alignSelf: 'start' }}>
          <div>
            <div className={`${ui.mid} ${toneClass(CHAOS_LEVEL_TONE[chaosLevel(brain.chaos_index)])}`}>{brain.chaos_index}</div>
            <div className={ui.label}>Chaos</div>
          </div>
          {brain.best_compound && (
            <div>
              <div className={ui.mid}>{brain.best_compound.slice(0, 1)}</div>
              <div className={ui.label}>Best tyre</div>
            </div>
          )}
          <div>
            <div className={`${ui.mid} ${toneClass(tension)}`}>{brain.strategic_tension}</div>
            <div className={ui.label}>Tension</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}
