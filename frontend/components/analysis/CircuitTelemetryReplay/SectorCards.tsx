'use client'

import { useMemo } from 'react'
import type { DriverTelemetry } from '@/types/telemetry'

type Props = {
  drivers: DriverTelemetry[]
}

type SectorKey = 'sector_1_time' | 'sector_2_time' | 'sector_3_time'

const SECTORS: { key: SectorKey; label: string }[] = [
  { key: 'sector_1_time', label: 'S1' },
  { key: 'sector_2_time', label: 'S2' },
  { key: 'sector_3_time', label: 'S3' },
]

export function SectorCards({ drivers }: Props) {
  const cards = useMemo(() => {
    return SECTORS.map((s) => {
      const times = drivers
        .map((d) => ({ code: d.driver_code, colour: d.team_colour, time: d[s.key] }))
        .filter((x): x is { code: string; colour: string; time: number } => x.time != null)
        .sort((a, b) => a.time - b.time)

      const best = times[0] ?? null
      const second = times[1] ?? null
      const delta = best && second ? second.time - best.time : null

      return { ...s, best, delta }
    })
  }, [drivers])

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-bg-elevated border border-border-subtle rounded-[3px] p-2"
          style={c.best ? { borderTopWidth: 2, borderTopColor: '#23D18B' } : undefined}
        >
          <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mb-1">
            {c.label}
          </div>
          {c.best ? (
            <>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.best.colour }} />
                <span className="font-display font-bold text-[9px] uppercase text-text-secondary">
                  {c.best.code}
                </span>
              </div>
              <div className="font-mono font-bold text-[12px] text-signal-green tabular-nums">
                {c.best.time.toFixed(3)}s
              </div>
              {c.delta != null && (
                <div className="font-mono text-[9px] text-signal-amber tabular-nums mt-0.5">
                  +{c.delta.toFixed(3)}
                </div>
              )}
            </>
          ) : (
            <span className="font-mono text-[9px] text-text-muted">—</span>
          )}
        </div>
      ))}
    </div>
  )
}
