'use client'

import { useState } from 'react'
import type { FullRaceAnalysis } from '@/types'
import { RaceBrain } from './RaceBrain'
import { TruePaceTable } from './TruePaceTable'
import { TyreDegradationPanel } from './TyreDegradationPanel'
import { PitImpactPanel } from './PitImpactPanel'
import { ChaosIndexCard } from './ChaosIndexCard'
import { EngineerNotes } from './EngineerNotes'
import { DecisionsTimeline } from './DecisionsTimeline'
import { DriverCard } from './DriverCard'
import { RadioOverlay } from '@/components/radio/RadioOverlay'
import { useRaceStore } from '@/stores/raceStore'

type Props = {
  analysis: FullRaceAnalysis
}

export function AnalysisPage({ analysis }: Props) {
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null)
  const { radioOpen, setRadioOpen } = useRaceStore()

  const selectedDriverData = selectedDriver
    ? analysis.true_pace.find((d) => d.driver_number === selectedDriver)
    : null

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-4 space-y-3">
      {/* Race header */}
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="font-display font-black text-[20px] uppercase tracking-[-0.5px] text-text-primary">
              {analysis.race.meeting_name}
            </div>
            <div className="font-mono text-[11px] text-text-secondary mt-0.5">
              {analysis.race.circuit_short_name} · {analysis.race.year} · {analysis.race.session_name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono font-bold text-[18px] text-signal-red">
              {analysis.chaos.score}
            </div>
            <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">
              Chaos
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-[18px] text-text-primary">
              {analysis.true_pace.length}
            </div>
            <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">
              Drivers
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-[18px] text-text-primary">
              {analysis.tyre_degradation.length}
            </div>
            <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">
              Stints
            </div>
          </div>
          <div
            className={`px-3 py-1 rounded-[3px] font-display font-bold text-[10px] uppercase tracking-[1px] ${
              analysis.chaos.level === 'Extreme'
                ? 'bg-signal-red/20 text-signal-red border border-signal-red/30'
                : analysis.chaos.level === 'High'
                ? 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30'
                : 'bg-signal-green/20 text-signal-green border border-signal-green/30'
            }`}
          >
            {analysis.chaos.level} Chaos
          </div>
        </div>
      </div>

      {/* Race Brain — full width */}
      <RaceBrain data={analysis.race_brain} chaosScore={analysis.chaos.score} />

      {/* Row 2: True Pace | Tyre Degradation */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TruePaceTable
          rows={analysis.true_pace}
          onDriverClick={setSelectedDriver}
          selectedDriver={selectedDriver}
        />
        <TyreDegradationPanel rows={analysis.tyre_degradation} />
      </div>

      {/* Row 3: Pit Impact | Chaos Index */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <PitImpactPanel rows={analysis.pit_impact} />
        <ChaosIndexCard chaos={analysis.chaos} />
      </div>

      {/* Row 4: Engineer Notes | Decisions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <EngineerNotes notes={analysis.engineer_notes} />
        <DecisionsTimeline decisions={analysis.decisions} />
      </div>

      {/* Driver card modal */}
      {selectedDriverData && (
        <DriverCard
          driver={selectedDriverData}
          stints={analysis.tyre_degradation.filter(
            (s) => s.driver_number === selectedDriverData.driver_number
          )}
          pits={analysis.pit_impact.filter(
            (p) => p.driver_number === selectedDriverData.driver_number
          )}
          raceName={analysis.race.meeting_name}
          onClose={() => setSelectedDriver(null)}
        />
      )}

      {/* Radio Overlay */}
      {radioOpen && (
        <RadioOverlay
          analysis={analysis}
          onClose={() => setRadioOpen(false)}
        />
      )}
    </div>
  )
}
