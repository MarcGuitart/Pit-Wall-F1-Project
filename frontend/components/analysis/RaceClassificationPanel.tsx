'use client'

import type { RaceClassificationRow } from '@/types'

type Props = {
  rows: RaceClassificationRow[]
  onDriverClick: (code: string, name: string) => void
}

export function RaceClassificationPanel({ rows, onDriverClick }: Props) {
  if (!rows.length) return null

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Race Classification
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          Actual result · not True Pace
        </span>
      </div>

      <div className="p-3 flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <button
            key={row.driver_number}
            onClick={() => onDriverClick(row.driver_code, row.team_name ?? row.driver_code)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[2px] border border-border-default bg-bg-elevated hover:bg-border-default transition-colors"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: row.team_colour ?? '#8A94A6' }}
            />
            <span className="font-mono text-[10px] text-text-muted tabular-nums">
              P{row.finishing_position ?? '–'}
            </span>
            <span className="font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-primary">
              {row.driver_code}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
