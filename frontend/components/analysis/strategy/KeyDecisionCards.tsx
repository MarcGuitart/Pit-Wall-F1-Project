'use client'

import { useState } from 'react'
import type { RaceDecision } from '@/types'
import { ConfidenceBadge, Panel, toneClass, ui, type Tone } from '@/components/ui'
import a from '../analysis.module.css'

type Props = { decisions: RaceDecision[] }

function impactTone(impact: string): Tone {
  const i = impact.toLowerCase()
  if (i.includes('+') || i.includes('gained') || i.includes('saved')) return 'ok'
  if (i.includes('-') || i.includes('lost') || i.includes('surrender')) return 'accent'
  return 'warn'
}

export function KeyDecisionCards({ decisions }: Props) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? decisions : decisions.slice(0, 3)

  return (
    <Panel title="Key Decisions" aside="ranked by impact" padded={false}
      foot={decisions.length > 3 ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className={a.linkBtn} aria-expanded={expanded}>
          {expanded ? 'Collapse' : `See all ${decisions.length} →`}
        </button>
      ) : undefined}
    >
      <ol className={a.list} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {visible.map((dec) => (
          <li key={dec.rank} className={a.item} style={{ display: 'flex', gap: 14 }}>
            <span className={a.rank} aria-hidden="true">{dec.rank}</span>
            <div className={a.grow}>
              <div className={`${a.between} ${a.wrap}`} style={{ alignItems: 'flex-start' }}>
                <span className={a.itemTitle}>{dec.title}</span>
                <span className={a.row}>
                  {dec.lap_number != null && <span className={ui.sub}>L{dec.lap_number}</span>}
                  <ConfidenceBadge level={dec.confidence} />
                </span>
              </div>
              <div className={`${a.impact} ${toneClass(impactTone(dec.impact))}`}>{dec.impact}</div>
              <p className={`${a.para} ${a.clamp2}`}>{dec.explanation}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
