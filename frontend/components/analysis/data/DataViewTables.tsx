import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { TruePaceTable } from '../TruePaceTable'
import { TyreDegradationPanel } from '../TyreDegradationPanel'
import { PitImpactPanel } from '../PitImpactPanel'
import { ChaosIndexCard } from '../ChaosIndexCard'
import { EngineerNotes } from '../EngineerNotes'
import { DecisionsTimeline } from '../DecisionsTimeline'
import { ExclusionLogPanel } from './ExclusionLogPanel'

type Props = {
  analysis: FullRaceAnalysis
  sessionType: SessionType
  focusedDriver: string | null
  visibleNotes: FullRaceAnalysis['engineer_notes']
  onDriverClick: (code: string, name: string) => void
  onBackToStrategy: () => void
}

const NAV_SECTIONS = [
  { id: 'pace',       label: 'Pace' },
  { id: 'exclusions', label: 'Exclusions' },
  { id: 'tyres',      label: 'Tyres' },
  { id: 'pit',        label: 'Pit' },
  { id: 'signals',    label: 'Signals' },
  { id: 'decisions',  label: 'Decisions' },
]

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export function DataViewTables({
  analysis, sessionType, focusedDriver, visibleNotes, onDriverClick, onBackToStrategy,
}: Props) {
  const focusedRow = focusedDriver
    ? analysis.true_pace.find((r) => r.driver_code === focusedDriver)
    : null

  const clickByNumber = (driverNumber: number) => {
    const d = analysis.true_pace.find((r) => r.driver_number === driverNumber)
    if (d) onDriverClick(d.driver_code, d.team_name ?? d.driver_code)
  }
  const clickByCode = (code: string) => {
    const d = analysis.true_pace.find((r) => r.driver_code === code)
    onDriverClick(code, d?.team_name ?? code)
  }

  return (
    <div className="space-y-3">
      {/* Back */}
      <button
        onClick={onBackToStrategy}
        className="font-display font-bold text-[10px] uppercase tracking-[1px] text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal-blue rounded-[2px]"
      >
        ← Back to Strategy View
      </button>

      {/* Sticky section nav */}
      <div
        className="sticky top-0 z-[5] bg-bg-secondary border-b border-border-subtle flex items-center gap-1 px-2 py-1.5 -mx-2"
      >
        {NAV_SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => scrollToSection(id)}
            className="px-3 py-1 font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-muted hover:text-text-primary transition-colors rounded-[2px] hover:bg-bg-elevated"
          >
            {label}
          </button>
        ))}
      </div>

      {/* a. Full pace table */}
      <div id="pace">
        <TruePaceTable
          rows={analysis.true_pace}
          onDriverClick={clickByNumber}
          selectedDriver={focusedRow?.driver_number ?? null}
        />
      </div>

      {/* b. Exclusion log */}
      <div id="exclusions">
        <ExclusionLogPanel rows={analysis.true_pace} />
      </div>

      {/* c. Tyre degradation */}
      <div id="tyres">
        <TyreDegradationPanel
          rows={analysis.tyre_degradation}
          onDriverClick={clickByCode}
          focusedDriver={focusedDriver}
        />
      </div>

      {/* d. Pit impact — Race only */}
      <div id="pit">
        {sessionType === 'Race' && (
          <PitImpactPanel
            rows={analysis.pit_impact}
            onDriverClick={clickByCode}
            focusedDriver={focusedDriver}
          />
        )}
      </div>

      {/* e. Full engineer notes */}
      <div id="signals">
        <EngineerNotes notes={analysis.engineer_notes} focusedDriver={null} />
      </div>

      {/* f. ChaosIndexCard */}
      <ChaosIndexCard chaos={analysis.chaos} />

      {/* g. Decisions */}
      <div id="decisions">
        <DecisionsTimeline decisions={analysis.decisions} />
      </div>
    </div>
  )
}
