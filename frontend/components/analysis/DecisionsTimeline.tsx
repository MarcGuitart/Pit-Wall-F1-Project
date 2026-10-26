import type { RaceDecision } from '@/types'
import { ConfidenceBadge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  decisions: RaceDecision[]
}

const IMPACT_TONE = (impact: string): Tone => {
  const i = impact.toLowerCase()
  if (i.includes('+') || i.includes('gained') || i.includes('saved')) return 'ok'
  if (i.includes('-') || i.includes('lost') || i.includes('surrendered') || i.includes('backfired')) return 'accent'
  return 'warn'
}

export function DecisionsTimeline({ decisions }: Props) {
  return (
    <Panel title="5 Key Decisions" aside="Ranked by impact" padded={false}>
      <ol className={a.list} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {decisions.map((decision) => (
          <li key={decision.rank} className={a.item} style={{ display: 'flex', gap: 14 }}>
            <span className={a.rank} style={{ color: 'var(--pw-muted)' }} aria-hidden="true">{decision.rank}</span>
            <div className={a.grow}>
              <div className={`${a.between} ${a.wrap}`} style={{ alignItems: 'flex-start' }}>
                <span className={a.itemTitle}>{decision.title}</span>
                <span className={a.row}>
                  {decision.lap_number != null && <span className={ui.sub}>L{decision.lap_number}</span>}
                  <ConfidenceBadge level={decision.confidence} />
                </span>
              </div>
              <div className={`${a.impact} ${toneClass(IMPACT_TONE(decision.impact))}`}>{decision.impact}</div>
              <p className={a.para}>{decision.explanation}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
