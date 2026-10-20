import type { TruePaceRow } from '@/types'
import { Panel, toneClass, ui } from '@/components/ui'
import a from '../analysis.module.css'

type Props = { rows: TruePaceRow[] }

export function ExclusionLogPanel({ rows }: Props) {
  return (
    <Panel title="Exclusion Log" sub="Why clean pace differs from broadcast timing" padded={false}>
      <div className={a.list}>
        {rows.map((row) => (
          <div key={row.driver_number} className={a.item} style={{ boxShadow: 'inset 4px 0 0 var(--pw-divider)' }}>
            <div className={a.row} style={{ gap: 12, marginBottom: 4 }}>
              <span className={a.code}>{row.driver_code}</span>
              <span className={ui.sub} style={{ color: 'var(--pw-text)' }}>{row.sample_size} clean laps</span>
              <span className={ui.sub}>{row.team_name ?? ''}</span>
            </div>
            {row.exclusion_log.length === 0 ? (
              <span className={`${ui.sub} ${toneClass('ok')}`}>No exclusions · all laps valid</span>
            ) : (
              <ul className={`${a.footList} ${ui.sub}`}>
                {row.exclusion_log.map((log, i) => <li key={i}>· {log}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}
