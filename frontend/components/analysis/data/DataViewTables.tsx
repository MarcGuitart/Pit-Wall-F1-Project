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

      {/* a. Full pace table */}
      <TruePaceTable
        rows={analysis.true_pace}
        onDriverClick={clickByNumber}
        selectedDriver={focusedRow?.driver_number ?? null}
      />

      {/* b. Exclusion log */}
      <ExclusionLogPanel rows={analysis.true_pace} />

      {/* c. Tyre degradation */}
      <TyreDegradationPanel
        rows={analysis.tyre_degradation}
        onDriverClick={clickByCode}
        focusedDriver={focusedDriver}
      />

      {/* d. Pit impact — Race only */}
      {sessionType === 'Race' && (
        <PitImpactPanel
          rows={analysis.pit_impact}
          onDriverClick={clickByCode}
          focusedDriver={focusedDriver}
        />
      )}

      {/* e. Full engineer notes — unfiltered */}
      <EngineerNotes notes={analysis.engineer_notes} focusedDriver={null} />

      {/* f. ChaosIndexCard */}
      <ChaosIndexCard chaos={analysis.chaos} />

      {/* g. Decisions */}
      <DecisionsTimeline decisions={analysis.decisions} />
    </div>
  )
}
