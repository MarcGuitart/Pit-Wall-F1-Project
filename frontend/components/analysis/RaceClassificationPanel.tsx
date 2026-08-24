'use client'

import type { RaceClassificationRow } from '@/types'

type Props = {
  rows: RaceClassificationRow[]
  onDriverClick: (code: string, name: string) => void
}

function GainedBadge({ gained }: { gained: number | null }) {
  if (gained == null) {
    return <span className="font-mono text-[10px] text-text-muted">–</span>
  }
  const style =
    gained > 0
      ? 'text-signal-green'
      : gained < 0
        ? 'text-signal-red'
        : 'text-text-muted'
  const sign = gained > 0 ? '+' : ''
  return (
    <span className={`font-mono font-bold text-[11px] tabular-nums ${style}`}>
      {sign}{gained}
    </span>
  )
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

      <div className="grid grid-cols-[36px_1fr_44px_44px_48px] gap-0 px-3 py-1.5 border-b border-border-subtle">
        {['Fin', 'Driver', 'Grid', 'Fin', '+/−'].map((h, i) => (
          <span
            key={i}
            className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted"
          >
            {i === 0 ? '#' : h}
          </span>
        ))}
      </div>

      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <button
            key={row.driver_number}
            onClick={() => onDriverClick(row.driver_code, row.team_name ?? row.driver_code)}
            className="w-full grid grid-cols-[36px_1fr_44px_44px_48px] gap-0 px-3 py-2 text-left items-center hover:bg-bg-elevated transition-colors"
          >
            <span className="font-display font-bold text-[11px] text-text-muted tabular-nums">
              {row.finishing_position ?? '–'}
            </span>

            <span className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: row.team_colour ?? '#8A94A6' }}
              />
              <span className="min-w-0">
                <span className="block font-display font-bold text-[11px] uppercase tracking-[0.5px] text-text-primary">
                  {row.driver_code}
                </span>
                <span className="block font-mono text-[9px] text-text-muted truncate">
                  {row.team_name ?? '–'}
                </span>
              </span>
            </span>

            <span className="font-mono text-[11px] text-text-secondary tabular-nums">
              P{row.grid_position ?? '–'}
            </span>
            <span className="font-mono text-[11px] text-text-primary tabular-nums">
              P{row.finishing_position ?? '–'}
            </span>
            <GainedBadge gained={row.positions_gained} />
          </button>
        ))}
      </div>
    </div>
  )
}
