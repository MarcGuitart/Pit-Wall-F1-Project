'use client'

import { useState } from 'react'
import { CHAOS_COMPONENTS, CHAOS_FULL_SCALE, chaosLevel, chaosPoints, chaosScore, type ChaosComponentKey, type ChaosRaw } from '@/lib/chaos'
import { Slider } from './Slider'
import q from './questions.module.css'

const PRESETS: { label: string; raw: ChaosRaw }[] = [
  { label: 'Dry race', raw: { safety_car: 0, yellow_flags: 0.02, stewarding: 0.05, weather: 0, position_volatility: 0.04 } },
  { label: 'Safety car and rain', raw: { safety_car: 0.2, yellow_flags: 0.1, stewarding: 0.3, weather: 0.6, position_volatility: 0.1 } },
]
const CONTROL: Record<ChaosComponentKey, { label: string; max: number; step: number; text: (v: number) => string }> = {
  safety_car: { label: 'Laps neutralised', max: 0.5, step: 0.01, text: (v) => `${Math.round(v * 100)} % of laps` },
  yellow_flags: { label: 'Laps with a local yellow', max: 0.3, step: 0.01, text: (v) => `${Math.round(v * 100)} % of laps` },
  stewarding: { label: 'Incidents per lap', max: 1, step: 0.01, text: (v) => `${v.toFixed(2)} per lap` },
  weather: { label: 'Wet laps', max: 1, step: 0.01, text: (v) => `${Math.round(v * 100)} % of laps` },
  position_volatility: { label: 'Place changes per driver lap', max: 0.3, step: 0.01, text: (v) => v.toFixed(2) },
}

/** Q4: the method 2.0 formula from chaos_service.py (lib/chaos.ts), with inputs you set. */
export function Q4Chaos() {
  const [raw, setRaw] = useState<ChaosRaw>(PRESETS[0].raw)
  const points = chaosPoints(raw)
  const score = chaosScore(raw)
  return (
    <div className={q.demo}>
      <div className={q.presets} role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className={q.chip} aria-pressed={JSON.stringify(p.raw) === JSON.stringify(raw)} onClick={() => setRaw(p.raw)}>{p.label}</button>
        ))}
      </div>
      <p className={q.readout} aria-live="polite"><span className={q.score}>{score}</span> <b>{chaosLevel(score)}</b></p>
      {CHAOS_COMPONENTS.map((c) => (
        <div key={c.key} className={q.compRow}>
          <Slider
            label={CONTROL[c.key].label}
            min={0}
            max={CONTROL[c.key].max}
            step={CONTROL[c.key].step}
            value={raw[c.key]}
            onChange={(v) => setRaw((r) => ({ ...r, [c.key]: v }))}
            valueText={CONTROL[c.key].text}
          />
          <span className={q.compTrack} aria-hidden="true">
            <span className={q.compBar} style={{ display: 'block', transform: `scaleX(${points[c.key] / c.weight})` }} />
          </span>
          <span className={q.tag}>{points[c.key]} of {c.weight} points (full at {CONTROL[c.key].text(CHAOS_FULL_SCALE[c.key])})</span>
        </div>
      ))}
    </div>
  )
}
