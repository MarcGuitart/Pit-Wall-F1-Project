'use client'

import { ui } from '@/components/ui'
import t from './telemetry.module.css'

export type SelectableDriver = {
  code: string
  colour: string
  rank: number | null
}

type Props = {
  drivers: SelectableDriver[]
  selected: string[]
  onToggle: (code: string) => void
  max?: number
}

const hex = (c: string) => (c.startsWith('#') || c.startsWith('var(') ? c : `#${c}`)

export function DriverSelector({ drivers, selected, onToggle, max = 3 }: Props) {
  return (
    <div className={t.group} role="group" aria-label="Drivers to compare">
      <span className={ui.label}>Driver</span>
      {drivers.map((d) => {
        const active = selected.includes(d.code)
        return (
          <button
            key={d.code}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(d.code)}
            className={`${t.chip} ${active ? t.chipOn : ''}`}
            style={active ? { borderColor: hex(d.colour), background: `color-mix(in srgb, ${hex(d.colour)} 18%, transparent)` } : undefined}
          >
            <span className={t.dot} style={{ background: hex(d.colour) }} aria-hidden="true" />
            <span>{d.code}</span>
            {d.rank != null && <span className={ui.sub}>P{d.rank}</span>}
          </button>
        )
      })}
      <span className={ui.sub}>max {max}</span>
    </div>
  )
}
