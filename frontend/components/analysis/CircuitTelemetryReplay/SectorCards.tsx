'use client'

import { useMemo } from 'react'
import type { DriverTelemetry } from '@/types/telemetry'
import { toneClass, ui } from '@/components/ui'
import t from './telemetry.module.css'

type Props = {
  drivers: DriverTelemetry[]
}

type SectorKey = 'sector_1_time' | 'sector_2_time' | 'sector_3_time'

const SECTORS: { key: SectorKey; label: string }[] = [
  { key: 'sector_1_time', label: 'S1' },
  { key: 'sector_2_time', label: 'S2' },
  { key: 'sector_3_time', label: 'S3' },
]

const hex = (c: string) => (c.startsWith('#') ? c : `#${c}`)

export function SectorCards({ drivers }: Props) {
  const cards = useMemo(() => {
    return SECTORS.map((s) => {
      const times = drivers
        .map((d) => ({ code: d.driver_code, colour: d.team_colour, time: d[s.key] }))
        .filter((x): x is { code: string; colour: string; time: number } => x.time != null)
        .sort((x, y) => x.time - y.time)

      const best = times[0] ?? null
      const second = times[1] ?? null
      const delta = best && second ? second.time - best.time : null

      return { ...s, best, delta }
    })
  }, [drivers])

  return (
    <div className={t.sectors}>
      {cards.map((c) => (
        <div key={c.label} className={`${t.sector} ${c.best ? t.sectorBest : ''}`}>
          <div className={ui.label}>{c.label}</div>
          {c.best ? (
            <>
              <div className={t.group} style={{ gap: 4 }}>
                <span className={t.dot} style={{ background: hex(c.best.colour) }} aria-hidden="true" />
                <span style={{ fontSize: 12, fontWeight: 800 }}>{c.best.code}</span>
              </div>
              <div className={toneClass('ok')} style={{ fontSize: 15, fontWeight: 800 }}>{c.best.time.toFixed(3)}s</div>
              {c.delta != null && <div className={toneClass('warn')} style={{ fontSize: 12, fontWeight: 700 }}>+{c.delta.toFixed(3)}</div>}
            </>
          ) : (
            <span className={ui.sub}>n/a</span>
          )}
        </div>
      ))}
    </div>
  )
}
