'use client'

import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { AnalysisModeToggle } from '../AnalysisModeToggle'
import { RaceBrainV2 } from '../strategy/RaceBrainV2'
import { RaceDNACard } from '../RaceDNACard'
import { ModuleUnavailable } from '../ModuleUnavailable'
import { TruePacePodium } from '../strategy/TruePacePodium'
import { KeyDecisionCards } from '../strategy/KeyDecisionCards'
import { DataViewTables } from '../data/DataViewTables'
import { Cells } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  analysis: FullRaceAnalysis
  sessionType: SessionType
  analysisMode: 'strategy' | 'data'
  focusedDriver: string | null
  visibleNotes: FullRaceAnalysis['engineer_notes']
  onAnalysisModeChange: (mode: 'strategy' | 'data') => void
  onDriverClick: (code: string, name: string) => void
}

function inferTotalLaps(analysis: FullRaceAnalysis): number {
  if (analysis.tyre_degradation.length)
    return Math.max(...analysis.tyre_degradation.map((s) => s.lap_end))
  if (analysis.pit_impact.length)
    return Math.max(...analysis.pit_impact.map((p) => p.lap_number)) + 10
  return 70
}

export function StrategyTab({
  analysis,
  sessionType,
  analysisMode,
  focusedDriver,
  visibleNotes,
  onAnalysisModeChange,
  onDriverClick,
}: Props) {
  const totalLaps = inferTotalLaps(analysis)
  const { race_brain, true_pace, decisions } = analysis

  return (
    <div className={a.stack}>
      <AnalysisModeToggle
        mode={analysisMode}
        sessionType={sessionType}
        lapCount={totalLaps}
        onChange={onAnalysisModeChange}
      />

      {analysisMode === 'strategy' ? (
          <div key="strategy" className={a.stack}>
            <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
            {analysis.race_dna
              ? <RaceDNACard dna={analysis.race_dna} />
              : <ModuleUnavailable title="Race DNA" analysis={analysis} field="race_dna" />
            }
            <Cells cols={2}>
              <TruePacePodium
                rows={true_pace}
                classification={analysis.race_classification}
                onDriverClick={onDriverClick}
                onViewAll={() => onAnalysisModeChange('data')}
                sessionType={sessionType}
              />
              <KeyDecisionCards decisions={decisions} />
            </Cells>
          </div>
        ) : (
          <div key="data">
            <DataViewTables
              analysis={analysis}
              sessionType={sessionType}
              focusedDriver={focusedDriver}
              visibleNotes={visibleNotes}
              onDriverClick={onDriverClick}
              onBackToStrategy={() => onAnalysisModeChange('strategy')}
            />
          </div>
        )}
    </div>
  )
}
