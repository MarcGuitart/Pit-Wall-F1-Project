import type { FullRaceAnalysis } from '@/types'
import { TruePaceTable } from '../TruePaceTable'
import { TyreDegradationPanel } from '../TyreDegradationPanel'
import { PitImpactPanel } from '../PitImpactPanel'
import { ChaosIndexCard } from '../ChaosIndexCard'
import { EngineerNotes } from '../EngineerNotes'
import { DecisionsTimeline } from '../DecisionsTimeline'

type Props = {
  analysis: FullRaceAnalysis
  focusedDriver: string | null
  visibleNotes: FullRaceAnalysis['engineer_notes']
  onDriverClick: (code: string, name: string) => void
  onBackToStrategy: () => void
}

function ExclusionLogPanel({ rows }: { rows: FullRaceAnalysis['true_pace'] }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] overflow-hidden">
      <div className="px-3 py-2 border-b border-border-subtle">
        <span className="font-display text-[10px] font-bold tracking-[1.5px] uppercase text-text-secondary">
          Exclusion Log
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div key={row.driver_number} className="px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-display font-bold text-[10px] uppercase tracking-[0.5px] text-text-primary">
                {row.driver_code}
              </span>
              <span className="font-mono text-[9px] text-text-muted">
                {row.sample_size} clean laps
              </span>
            </div>
            <div className="space-y-0.5">
              {row.exclusion_log.map((log, i) => (
                <div key={i} className="font-mono text-[9px] text-text-muted">
                  · {log}
                </div>
              ))}
              {row.exclusion_log.length === 0 && (
                <span className="font-mono text-[9px] text-signal-green">No exclusions</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DataViewTables({
  analysis,
  focusedDriver,
  visibleNotes,
  onDriverClick,
  onBackToStrategy,
}: Props) {
  const focusedDriverRow = focusedDriver
    ? analysis.true_pace.find((r) => r.driver_code === focusedDriver)
    : null

  return (
    <div className="space-y-3">
      {/* Back button */}
      <div className="flex items-center">
        <button
          onClick={onBackToStrategy}
          className="flex items-center gap-1.5 font-display font-bold text-[10px] uppercase tracking-[1px] text-text-muted hover:text-text-primary transition-colors"
        >
          ← Back to Strategy View
        </button>
      </div>

      {/* Full pace table */}
      <TruePaceTable
        rows={analysis.true_pace}
        onDriverClick={(driverNumber) => {
          const d = analysis.true_pace.find((r) => r.driver_number === driverNumber)
          if (d) onDriverClick(d.driver_code, d.team_name ?? d.driver_code)
        }}
        selectedDriver={focusedDriverRow?.driver_number ?? null}
      />

      {/* Exclusion log */}
      <ExclusionLogPanel rows={analysis.true_pace} />

      {/* Tyre degradation */}
      <TyreDegradationPanel
        rows={analysis.tyre_degradation}
        onDriverClick={(code) => {
          const d = analysis.true_pace.find((r) => r.driver_code === code)
          onDriverClick(code, d?.team_name ?? code)
        }}
        focusedDriver={focusedDriver}
      />

      {/* Pit impact */}
      <PitImpactPanel
        rows={analysis.pit_impact}
        onDriverClick={(code) => {
          const d = analysis.true_pace.find((r) => r.driver_code === code)
          onDriverClick(code, d?.team_name ?? code)
        }}
        focusedDriver={focusedDriver}
      />

      {/* Chaos + notes side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ChaosIndexCard chaos={analysis.chaos} />
        <EngineerNotes notes={visibleNotes} focusedDriver={focusedDriver} />
      </div>

      {/* Decisions */}
      <DecisionsTimeline decisions={analysis.decisions} />
    </div>
  )
}
