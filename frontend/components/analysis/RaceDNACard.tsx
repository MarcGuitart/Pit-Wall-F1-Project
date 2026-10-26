import type { RaceDNA } from '@/types'
import { toneClass, ui, type Tone } from '@/components/ui'
import a from './analysis.module.css'

type Props = {
  dna: RaceDNA
}

type Cell = {
  label: string
  value: string
  tone?: Tone
}

function toneFor(field: keyof RaceDNA, value: string): Tone | undefined {
  if (field === 'overtaking_difficulty') {
    if (value === 'High') return 'accent'
    if (value === 'Medium') return 'warn'
  }
  if (field === 'pit_timing_sensitivity' || field === 'chaos_level') {
    if (value === 'Extreme') return 'accent'
    if (value === 'High') return 'warn'
  }
  if (field === 'strategy_type') return 'purple'
  return undefined
}

/** The race's character in seven readings, one cell each. */
export function RaceDNACard({ dna }: Props) {
  const cells: Cell[] = [
    { label: 'Primary factor',   value: dna.primary_factor,          tone: toneFor('primary_factor', dna.primary_factor) },
    { label: 'Secondary factor', value: dna.secondary_factor,        tone: toneFor('secondary_factor', dna.secondary_factor) },
    { label: 'Strategy type',    value: dna.strategy_type,           tone: toneFor('strategy_type', dna.strategy_type) },
    { label: 'Chaos level',      value: dna.chaos_level,             tone: toneFor('chaos_level', dna.chaos_level) },
    { label: 'Overtaking',       value: dna.overtaking_difficulty,   tone: toneFor('overtaking_difficulty', dna.overtaking_difficulty) },
    { label: 'Pit sensitivity',  value: dna.pit_timing_sensitivity,  tone: toneFor('pit_timing_sensitivity', dna.pit_timing_sensitivity) },
    { label: 'Tyre impact',      value: dna.tyre_degradation_impact, tone: toneFor('tyre_degradation_impact', dna.tyre_degradation_impact) },
  ]

  return (
    <section aria-label="Race DNA" className={a.kv} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))' }}>
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className={ui.label}>{cell.label}</div>
          <div className={`${a.dnaValue} ${cell.tone ? toneClass(cell.tone) : ''}`}>{cell.value}</div>
        </div>
      ))}
    </section>
  )
}
