import type { FullRaceAnalysis } from '@/types'
import { RaceBrainV2 } from './strategy/RaceBrainV2'
import { TruePacePodium } from './strategy/TruePacePodium'
import { TyreCliffMap } from './strategy/TyreCliffMap'
import { PitSequenceSummary } from './strategy/PitSequenceSummary'
import { ChaosProfile } from './strategy/ChaosProfile'
import { EngineerSignalSummary } from './strategy/EngineerSignalSummary'
import { KeyDecisionCards } from './strategy/KeyDecisionCards'

type SessionType = 'Race' | 'Qualifying' | 'Practice'

type Props = {
  analysis: FullRaceAnalysis
  sessionType: SessionType
  focusedDriver: string | null
  onDriverClick: (code: string, name: string) => void
  onSwitchToData: () => void
}

function SessionPlaceholder({ label }: { label: string }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-4 py-6 text-center">
      <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-muted">
        {label}
      </div>
      <p className="font-mono text-[10px] text-text-secondary mt-1">
        Coming in Sprint 4 — session-aware modules
      </p>
    </div>
  )
}

export function StrategyViewGrid({
  analysis,
  sessionType,
  focusedDriver,
  onDriverClick,
  onSwitchToData,
}: Props) {
  const { race_brain, true_pace, tyre_degradation, pit_impact, chaos, engineer_notes, decisions } = analysis

  const visibleNotes = focusedDriver
    ? engineer_notes.filter((n) => n.title.includes(focusedDriver) || n.message.includes(focusedDriver))
    : engineer_notes

  if (sessionType === 'Qualifying') {
    return (
      <div className="space-y-3">
        <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
        <SessionPlaceholder label="TruePacePodium — Q3 best lap" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SessionPlaceholder label="SectorStrengthMap — qualifying sectors" />
          <SessionPlaceholder label="TrackEvolutionPanel — session track evolution" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SessionPlaceholder label="RunTimingPanel — run sequences" />
          <ChaosProfile chaos={chaos} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <EngineerSignalSummary notes={visibleNotes} onViewAll={onSwitchToData} />
          <KeyDecisionCards decisions={decisions} />
        </div>
      </div>
    )
  }

  if (sessionType === 'Practice') {
    return (
      <div className="space-y-3">
        <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
        <SessionPlaceholder label="TruePacePodium — representative pace" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SessionPlaceholder label="TrackEvolutionPanel" />
          <SessionPlaceholder label="LongRunComparisonPanel" />
        </div>
        <EngineerSignalSummary notes={visibleNotes} onViewAll={onSwitchToData} />
      </div>
    )
  }

  // ── Race mode ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Row 1: Brain — full width */}
      <RaceBrainV2 brain={race_brain} sessionType={sessionType} />

      {/* Row 2: True Pace Podium | Tyre Cliff Map */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TruePacePodium
          rows={true_pace}
          onDriverClick={onDriverClick}
          onViewAll={onSwitchToData}
          sessionType={sessionType}
        />
        <TyreCliffMap
          degradationRows={tyre_degradation}
          onDriverClick={(code) => {
            const d = true_pace.find((r) => r.driver_code === code)
            onDriverClick(code, d?.team_name ?? code)
          }}
        />
      </div>

      {/* Row 3: Pit Sequence | Chaos Profile */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <PitSequenceSummary
          pitImpactRows={pit_impact}
          onDriverClick={(code) => {
            const d = true_pace.find((r) => r.driver_code === code)
            onDriverClick(code, d?.team_name ?? code)
          }}
          onViewAll={onSwitchToData}
          sessionType={sessionType}
        />
        <ChaosProfile chaos={chaos} />
      </div>

      {/* Row 4: Engineer Signals | Key Decisions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <EngineerSignalSummary notes={visibleNotes} onViewAll={onSwitchToData} />
        <KeyDecisionCards decisions={decisions} />
      </div>
    </div>
  )
}
