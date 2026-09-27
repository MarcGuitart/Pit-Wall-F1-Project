'use client'

import { useEffect, useRef, useState } from 'react'
import { COMPOUND_COLORS } from '@/lib/constants'
import { formatLapTime } from '@/lib/format'
import type { TowerRow } from '@/types/live'

type Props = {
  rows: TowerRow[]
  focusedDriver: string | null
  onFocus: (code: string | null) => void
}

/** OpenF1 sends the leader's interval as 0, and a lapped car as "+1 LAP". */
function gapText(value: number | string | null, isLeader: boolean): string {
  if (isLeader) return 'LEADER'
  if (value == null) return '–'
  if (typeof value === 'string') return value
  return `+${value.toFixed(3)}`
}

export function PositionTower({ rows, focusedDriver, onFocus }: Props) {
  const moved = usePositionChanges(rows)

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Order
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {rows.length} cars · gaps from OpenF1 intervals (~4s resolution)
        </span>
      </div>

      <div className="grid grid-cols-[28px_1fr_66px_58px_74px_54px] gap-2 px-3 py-1.5 border-b border-border-subtle">
        {['Pos', 'Driver', 'Gap', 'Int', 'Last lap', 'Tyre'].map((h, i) => (
          <span
            key={h}
            className={`font-display font-bold text-[8px] uppercase tracking-[1.2px] text-text-muted ${i >= 2 ? 'text-right' : ''}`}
          >
            {h}
          </span>
        ))}
      </div>

      <div className="divide-y divide-border-subtle/60">
        {rows.length === 0 && (
          <div className="px-3 py-8 text-center font-mono text-[11px] text-text-muted">
            No position data yet — waiting for the first v1/position message.
          </div>
        )}

        {rows.map((row) => {
          const focused = focusedDriver === row.code
          const delta = moved[row.driver_number]
          const compoundColor = row.compound ? COMPOUND_COLORS[row.compound] ?? '#8A94A6' : '#4A5568'

          return (
            <button
              key={row.driver_number}
              onClick={() => onFocus(focused ? null : row.code)}
              className={[
                'w-full grid grid-cols-[28px_1fr_66px_58px_74px_54px] gap-2 px-3 py-1.5 items-center text-left',
                'transition-colors',
                focused ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/60',
              ].join(' ')}
            >
              <span className="font-mono font-bold text-[12px] text-text-primary tabular-nums flex items-center gap-1">
                {row.position}
                {delta != null && delta !== 0 && (
                  <span className={delta > 0 ? 'text-signal-green text-[8px]' : 'text-signal-red text-[8px]'}>
                    {delta > 0 ? '▲' : '▼'}
                  </span>
                )}
              </span>

              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="w-[3px] h-[14px] rounded-full shrink-0"
                  style={{ backgroundColor: row.colour ? `#${row.colour}` : '#4A5568' }}
                />
                <span className="font-display font-bold text-[12px] tracking-[0.5px] text-text-primary">
                  {row.code}
                </span>
                {row.stops > 0 && (
                  <span className="font-mono text-[8px] text-text-muted">
                    {row.stops} stop{row.stops === 1 ? '' : 's'}
                  </span>
                )}
                {row.is_pit_out_lap && (
                  <span className="px-1 border border-signal-blue/40 text-signal-blue rounded-[2px] font-display font-bold text-[7px] uppercase tracking-[0.5px]">
                    out
                  </span>
                )}
              </span>

              <span className="font-mono text-[11px] text-text-secondary tabular-nums text-right">
                {gapText(row.gap_to_leader, row.position === 1)}
              </span>

              <span className="font-mono text-[11px] text-text-muted tabular-nums text-right">
                {row.position === 1 ? '–' : gapText(row.interval, false)}
              </span>

              <span className="font-mono text-[11px] text-text-primary tabular-nums text-right">
                {row.last_lap_s ? formatLapTime(row.last_lap_s) : '–'}
              </span>

              <span className="flex items-center justify-end gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: compoundColor }}
                  title={row.compound ?? 'compound unknown'}
                />
                <span className="font-mono text-[11px] text-text-secondary tabular-nums">
                  {row.stint_laps != null ? `${row.stint_laps}L` : '–'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="px-3 py-1.5 border-t border-border-subtle">
        <p className="font-mono text-[9px] text-text-muted leading-relaxed">
          Tyre column is laps on the current stint, not total tyre age — a set fitted used starts
          above zero and the feed reports that separately.
        </p>
      </div>
    </div>
  )
}

/** Remembers the previous order so a gained or lost place can be marked. */
function usePositionChanges(rows: TowerRow[]): Record<number, number> {
  const previous = useRef<Record<number, number>>({})
  const [delta, setDelta] = useState<Record<number, number>>({})

  useEffect(() => {
    const next: Record<number, number> = {}
    const changes: Record<number, number> = {}
    for (const row of rows) {
      next[row.driver_number] = row.position
      const before = previous.current[row.driver_number]
      if (before != null && before !== row.position) changes[row.driver_number] = before - row.position
    }
    previous.current = next
    if (Object.keys(changes).length === 0) return
    setDelta(changes)
    const id = setTimeout(() => setDelta({}), 6000)
    return () => clearTimeout(id)
  }, [rows])

  return delta
}
