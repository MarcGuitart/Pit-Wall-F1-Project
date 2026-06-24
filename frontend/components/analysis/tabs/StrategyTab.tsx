'use client'

import { AnimatePresence, motion } from 'framer-motion'
import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { AnalysisModeToggle } from '../AnalysisModeToggle'
import { RaceBrainV2 } from '../strategy/RaceBrainV2'
import { RaceDNACard } from '../RaceDNACard'
import { TruePacePodium } from '../strategy/TruePacePodium'
import { KeyDecisionCards } from '../strategy/KeyDecisionCards'
import { DataViewTables } from '../data/DataViewTables'

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
    <div className="space-y-3">
      <AnalysisModeToggle
        mode={analysisMode}
        sessionType={sessionType}
        lapCount={totalLaps}
        onChange={onAnalysisModeChange}
      />

      <AnimatePresence mode="wait">
        {analysisMode === 'strategy' ? (
          <motion.div
            key="strategy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            <RaceBrainV2 brain={race_brain} sessionType={sessionType} />
            {analysis.race_dna && <RaceDNACard dna={analysis.race_dna} />}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <TruePacePodium
                rows={true_pace}
                onDriverClick={onDriverClick}
                onViewAll={() => onAnalysisModeChange('data')}
                sessionType={sessionType}
              />
              <KeyDecisionCards decisions={decisions} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="data"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <DataViewTables
              analysis={analysis}
              sessionType={sessionType}
              focusedDriver={focusedDriver}
              visibleNotes={visibleNotes}
              onDriverClick={onDriverClick}
              onBackToStrategy={() => onAnalysisModeChange('strategy')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
