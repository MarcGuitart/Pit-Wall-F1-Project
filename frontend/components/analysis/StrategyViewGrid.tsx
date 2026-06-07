import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'

import { RaceBrainV2 } from './strategy/RaceBrainV2'
import { RaceDNACard } from './RaceDNACard'
import { TruePacePodium } from './strategy/TruePacePodium'
import { TyreCliffMap } from './strategy/TyreCliffMap'
import { PitSequenceSummary } from './strategy/PitSequenceSummary'
import { ChaosProfile } from './strategy/ChaosProfile'
import { EngineerSignalSummary } from './strategy/EngineerSignalSummary'
import { KeyDecisionCards } from './strategy/KeyDecisionCards'
import { TrackEvolutionPanel } from './strategy/TrackEvolutionPanel'
import { SectorStrengthMap } from './strategy/SectorStrengthMap'
import { RunTimingPanel } from './strategy/RunTimingPanel'
import { TrafficAndPrepPanel } from './strategy/TrafficAndPrepPanel'
import { WeatherOverlay } from './strategy/WeatherOverlay'
import { DRSTrainDetector } from './strategy/DRSTrainDetector'
import { CleanAirValueCard } from './CleanAirValueCard'

// Stub fallbacks when data is unavailable
import { WeatherOverlay as WeatherStub } from './stubs/WeatherOverlay'
import { DRSTrainDetector as DRSStub } from './stubs/DRSTrainDetector'

type Props = {
  analysis: FullRaceAnalysis
  sessionType: SessionType
  focusedDriver: string | null
  onDriverClick: (code: string, name: string) => void
  onSwitchToData: () => void
}

function inferTotalLaps(analysis: FullRaceAnalysis): number {
  if (analysis.tyre_degradation.length)
    return Math.max(...analysis.tyre_degradation.map((s) => s.lap_end))
  if (analysis.pit_impact.length)
    return Math.max(...analysis.pit_impact.map((p) => p.lap_number)) + 10
  return 70
}

export function StrategyViewGrid({ analysis, sessionType, focusedDriver, onDriverClick, onSwitchToData }: Props) {
  const { race_brain, true_pace, tyre_degradation, pit_impact, chaos, engineer_notes, decisions } = analysis

  const visibleNotes = focusedDriver
    ? engineer_notes.filter((n) => n.title.includes(focusedDriver) || n.message.includes(focusedDriver))
    : engineer_notes

  const click = (code: string) => {
    const d = true_pace.find((r) => r.driver_code === code)
    onDriverClick(code, d?.team_name ?? code)
  }

  const totalLaps = inferTotalLaps(analysis)

  // ── Qualifying ─────────────────────────────────────────────────────────────
  if (sessionType === 'Qualifying') {
    return (
      <div className="space-y-3">
        <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <TruePacePodium rows={true_pace} onDriverClick={onDriverClick} onViewAll={onSwitchToData} sessionType={sessionType} />
          <TrackEvolutionPanel degradationRows={tyre_degradation} notes={visibleNotes} sessionType={sessionType} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SectorStrengthMap />
          <RunTimingPanel />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <TrafficAndPrepPanel />
          <ChaosProfile chaos={chaos} />
        </div>
        <EngineerSignalSummary notes={visibleNotes} onViewAll={onSwitchToData} />
      </div>
    )
  }

  // ── Practice ───────────────────────────────────────────────────────────────
  if (sessionType === 'Practice') {
    return (
      <div className="space-y-3">
        <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <TruePacePodium rows={true_pace} onDriverClick={onDriverClick} onViewAll={onSwitchToData} sessionType={sessionType} />
          <TrackEvolutionPanel degradationRows={tyre_degradation} notes={visibleNotes} sessionType={sessionType} />
        </div>
        <EngineerSignalSummary notes={visibleNotes} onViewAll={onSwitchToData} />
      </div>
    )
  }

  // ── Race ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Row 1: Brain */}
      <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
      {analysis.race_dna && <RaceDNACard dna={analysis.race_dna} />}

      {/* Row 2: Pace | Cliff */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TruePacePodium rows={true_pace} onDriverClick={onDriverClick} onViewAll={onSwitchToData} sessionType={sessionType} />
        <TyreCliffMap degradationRows={tyre_degradation} onDriverClick={click} sessionType={sessionType} />
      </div>

      {/* Row 3: Pit | Chaos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <PitSequenceSummary pitImpactRows={pit_impact} onDriverClick={click} onViewAll={onSwitchToData} sessionType={sessionType} />
        <ChaosProfile chaos={chaos} />
      </div>

      {/* Row 4: Weather (full-width — may contain crossover + winners panels) */}
      {analysis.weather_analysis
        ? (
          <WeatherOverlay
            weather={analysis.weather_analysis}
            totalLaps={totalLaps}
            crossoverWindows={analysis.crossover_windows}
            weatherWinners={analysis.weather_winners_losers}
            sessionType={sessionType}
          />
        )
        : <WeatherStub />
      }

      {/* Row 5: DRS Trains | Clean Air Value */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {analysis.drs_trains
          ? <DRSTrainDetector drs={analysis.drs_trains} />
          : <DRSStub />
        }
        <CleanAirValueCard data={analysis.clean_air_value ?? null} />
      </div>

      {/* Row 6: Signals | Decisions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <EngineerSignalSummary notes={visibleNotes} onViewAll={onSwitchToData} />
        <KeyDecisionCards decisions={decisions} />
      </div>
    </div>
  )
}
