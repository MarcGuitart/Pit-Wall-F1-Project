'use client'

import { useMemo } from 'react'
import type { DriverTelemetry } from '@/types/telemetry'

type Props = {
  drivers: DriverTelemetry[]
  onHoverSector: (range: { start: number; end: number } | null) => void
  sectorBoundaries: { sector_1_end: number; sector_2_end: number }
  totalDistance: number
}

type SectorKey = 'sector_1_time' | 'sector_2_time' | 'sector_3_time'

const SECTORS: { key: SectorKey; label: string; num: number }[] = [
  { key: 'sector_1_time', label: 'S1', num: 1 },
  { key: 'sector_2_time', label: 'S2', num: 2 },
  { key: 'sector_3_time', label: 'S3', num: 3 },
]

function fmt(t: number): string {
  return `${t.toFixed(3)}s`
}

export function SectorInfo({ drivers, onHoverSector, sectorBoundaries, totalDistance }: Props) {
  const cards = useMemo(() => {
    return SECTORS.map((s) => {
      const times = drivers
        .map((d) => ({ code: d.driver_code, colour: d.team_colour, time: d[s.key] }))
        .filter((x): x is { code: string; colour: string; time: number } => x.time != null)
        .sort((a, b) => a.time - b.time)

      const best = times[0] ?? null
      const second = times[1] ?? null
      const delta = best && second ? second.time - best.time : null

      // distance range for this sector (for hover highlight)
      let range: { start: number; end: number }
      if (s.num === 1) range = { start: 0, end: sectorBoundaries.sector_1_end }
      else if (s.num === 2) range = { start: sectorBoundaries.sector_1_end, end: sectorBoundaries.sector_2_end }
      else range = { start: sectorBoundaries.sector_2_end, end: totalDistance }

      return { ...s, best, delta, range }
    })
  }, [drivers, sectorBoundaries, totalDistance])

  return (
    <div className="space-y-2">
      {cards.map((c) => (
        <div
          key={c.label}
          onMouseEnter={() => onHoverSector(c.range)}
          onMouseLeave={() => onHoverSector(null)}
          className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2.5"
          style={c.best ? { borderLeft: `3px solid ${c.best.colour}` } : undefined}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-display font-black text-[16px] leading-none text-text-primary">
              {c.label}
            </span>
            {c.best && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.best.colour }} />
                <span className="font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-primary">
                  {c.best.code}
                </span>
              </div>
            )}
          </div>
          {c.best ? (
            <div className="flex items-baseline justify-between">
              <span className="font-mono font-bold text-[13px] text-signal-green tabular-nums">
                {fmt(c.best.time)}
              </span>
              {c.delta != null && (
                <span className="font-mono text-[9px] text-text-muted">
                  +{c.delta.toFixed(3)}s
                </span>
              )}
            </div>
          ) : (
            <span className="font-mono text-[9px] text-text-muted">No sector data</span>
          )}
        </div>
      ))}
    </div>
  )
}
