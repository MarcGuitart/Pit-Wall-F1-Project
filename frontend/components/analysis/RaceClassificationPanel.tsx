'use client'

import type { RaceClassificationRow } from '@/types'
import { Cell, DataTable, Panel, Row, toneClass, ui } from '@/components/ui'
import { teamColour } from './TruePaceTable'
import a from './analysis.module.css'

type Props = {
  rows: RaceClassificationRow[]
  onDriverClick: (code: string, name: string) => void
}

function GainedBadge({ gained }: { gained: number | null }) {
  if (gained == null) return <span className={a.muted}>–</span>
  const tone = gained > 0 ? toneClass('ok') : gained < 0 ? toneClass('accent') : a.muted
  const sign = gained > 0 ? '+' : ''
  return <span className={`${a.num} ${tone}`}>{sign}{gained}</span>
}

const COLUMNS = [
  { key: 'pos', label: '#', width: '44px' },
  { key: 'driver', label: 'Driver', width: 'minmax(150px, 1fr)' },
  { key: 'grid', label: 'Grid', width: '64px' },
  { key: 'fin', label: 'Fin', width: '64px' },
  { key: 'gain', label: '+/−', width: '64px', num: true },
]

export function RaceClassificationPanel({ rows, onDriverClick }: Props) {
  if (!rows.length) return null

  return (
    <Panel title="Race Classification" aside="Actual result · not True Pace" padded={false}>
      <DataTable label="Race classification" columns={COLUMNS}>
        {rows.map((row) => (
          <Row key={row.driver_number} onActivate={() => onDriverClick(row.driver_code, row.team_name ?? row.driver_code)}>
            <Cell><span className={`${a.num} ${a.muted}`}>{row.finishing_position ?? '–'}</span></Cell>
            <Cell>
              <span className={a.row}>
                <span className={a.dot} style={{ background: teamColour(row.team_colour) }} aria-hidden="true" />
                <span style={{ minWidth: 0 }}>
                  <span className={a.code} style={{ display: 'block' }}>{row.driver_code}</span>
                  <span className={`${ui.sub} ${a.ellipsis}`}>{row.team_name ?? '–'}</span>
                </span>
              </span>
            </Cell>
            <Cell><span className={a.muted}>P{row.grid_position ?? '–'}</span></Cell>
            <Cell><span className={a.num}>P{row.finishing_position ?? '–'}</span></Cell>
            <Cell num><GainedBadge gained={row.positions_gained} /></Cell>
          </Row>
        ))}
      </DataTable>
    </Panel>
  )
}
