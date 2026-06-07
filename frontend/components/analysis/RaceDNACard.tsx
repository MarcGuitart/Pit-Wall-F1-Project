import type { RaceDNA } from '@/types'

type Props = {
  dna: RaceDNA
}

type Cell = {
  label: string
  value: string
  color?: string
}

function colorFor(field: keyof RaceDNA, value: string): string {
  if (field === 'overtaking_difficulty') {
    if (value === 'High') return '#E8001D'
    if (value === 'Medium') return '#FFB020'
  }
  if (field === 'pit_timing_sensitivity') {
    if (value === 'Extreme') return '#E8001D'
    if (value === 'High') return '#FFB020'
  }
  if (field === 'chaos_level') {
    if (value === 'Extreme') return '#E8001D'
    if (value === 'High') return '#FFB020'
  }
  if (field === 'strategy_type') return '#A66CFF'
  return '#F0F2F5'
}

export function RaceDNACard({ dna }: Props) {
  const row1: Cell[] = [
    { label: 'Primary factor',    value: dna.primary_factor,         color: colorFor('primary_factor', dna.primary_factor) },
    { label: 'Secondary factor',  value: dna.secondary_factor,       color: colorFor('secondary_factor', dna.secondary_factor) },
    { label: 'Strategy type',     value: dna.strategy_type,          color: colorFor('strategy_type', dna.strategy_type) },
    { label: 'Chaos level',       value: dna.chaos_level,            color: colorFor('chaos_level', dna.chaos_level) },
  ]
  const row2: Cell[] = [
    { label: 'Overtaking',        value: dna.overtaking_difficulty,  color: colorFor('overtaking_difficulty', dna.overtaking_difficulty) },
    { label: 'Pit sensitivity',   value: dna.pit_timing_sensitivity, color: colorFor('pit_timing_sensitivity', dna.pit_timing_sensitivity) },
    { label: 'Tyre impact',       value: dna.tyre_degradation_impact, color: colorFor('tyre_degradation_impact', dna.tyre_degradation_impact) },
    { label: '',                  value: '' },
  ]

  const CellItem = ({ cell }: { cell: Cell }) => (
    <div className="flex flex-col justify-center px-3 py-2 border-r border-border-subtle last:border-r-0">
      {cell.label ? (
        <>
          <div className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mb-1">
            {cell.label}
          </div>
          <div
            className="font-display font-bold text-[13px] leading-tight truncate"
            style={{ color: cell.color ?? '#F0F2F5' }}
          >
            {cell.value}
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      {/* Row 1 */}
      <div className="grid grid-cols-4 border-b border-border-subtle">
        {row1.map((cell) => (
          <CellItem key={cell.label} cell={cell} />
        ))}
      </div>
      {/* Row 2 */}
      <div className="grid grid-cols-4">
        {row2.map((cell, i) => (
          <CellItem key={i} cell={cell} />
        ))}
      </div>
    </div>
  )
}
