'use client'

import type { TruePaceRow } from '@/types'
import { formatLapTime } from '@/lib/format'
import { Cell, ConfidenceBadge, DataTable, Panel, Row, ui } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  rows: TruePaceRow[]
  onDriverClick: (driverNumber: number) => void
  selectedDriver: number | null
}

export const teamColour = (c: string | null | undefined) => (c ? `#${c.replace('#', '')}` : 'var(--pw-muted)')

const COLUMNS = [
  { key: 'rank', label: '#', width: '44px' },
  { key: 'driver', label: 'Driver', width: 'minmax(150px, 1fr)' },
  { key: 'median', label: 'Median', width: '120px' },
  { key: 'sample', label: 'Sample', width: '76px', num: true },
  { key: 'conf', label: 'Conf.', width: '150px' },
]

export function TruePaceTable({ rows, onDriverClick, selectedDriver }: Props) {
  return (
    <Panel
      title="True Pace Ranking"
      aside="Clean laps · SC/pit filtered"
      padded={false}
      foot={rows.length > 0 ? (
        <>
          <div className={ui.label} style={{ marginBottom: 4 }}>Exclusion Log (P1)</div>
          <ul className={a.footList}>
            {rows[0].exclusion_log.map((log, i) => <li key={i}>· {log}</li>)}
          </ul>
        </>
      ) : undefined}
    >
      <DataTable label="True pace ranking" columns={COLUMNS}>
        {rows.map((row) => {
          const isSelected = selectedDriver === row.driver_number
          return (
            <Row key={row.driver_number} onActivate={() => onDriverClick(isSelected ? 0 : row.driver_number)} selected={isSelected}>
              <Cell><span className={`${a.num} ${a.muted}`}>{row.rank}</span></Cell>
              <Cell>
                <span className={a.row}>
                  <span className={a.dot} style={{ background: teamColour(row.team_colour) }} aria-hidden="true" />
                  <span style={{ minWidth: 0 }}>
                    <span className={a.code} style={{ display: 'block' }}>{row.driver_code}</span>
                    <span className={`${ui.sub} ${a.ellipsis}`}>{row.team_name}</span>
                  </span>
                </span>
              </Cell>
              {/* Median clean-lap pace, with the single fastest clean lap as a secondary reference */}
              <Cell>
                <span className={a.num}>{formatLapTime(row.median_clean_lap)}</span>
                <span className={ui.sub}>Best {formatLapTime(row.fastest_clean_lap)}</span>
              </Cell>
              <Cell num><span className={a.num}>{row.sample_size}</span></Cell>
              <Cell><ConfidenceBadge level={row.confidence} /></Cell>
            </Row>
          )
        })}
      </DataTable>
    </Panel>
  )
}
