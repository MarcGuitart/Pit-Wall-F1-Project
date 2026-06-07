'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FullRaceAnalysis } from '@/types'
import { useRaceStore } from '@/stores/raceStore'
import { getSessionType } from '@/lib/utils'

import { AnalysisModeToggle } from './AnalysisModeToggle'
import { SessionTimelineBar } from './SessionTimelineBar'
import { RacePhaseTimeline } from './RacePhaseTimeline'
import { DriverFocusStrip } from './DriverFocusStrip'
import { DriverCard } from './DriverCard'
import { StrategyViewGrid } from './StrategyViewGrid'
import { DataViewTables } from './data/DataViewTables'
import { RadioOverlay } from '@/components/radio/RadioOverlay'

type Props = { analysis: FullRaceAnalysis }

function inferTotalLaps(analysis: FullRaceAnalysis): number {
  if (analysis.tyre_degradation.length)
    return Math.max(...analysis.tyre_degradation.map((s) => s.lap_end))
  if (analysis.pit_impact.length)
    return Math.max(...analysis.pit_impact.map((p) => p.lap_number)) + 10
  return 70
}

export function AnalysisPage({ analysis }: Props) {
  const {
    radioOpen, setRadioOpen,
    analysisMode, setAnalysisMode,
    focusedDriver, setFocusedDriver, clearFocusedDriver,
  } = useRaceStore()

  // Separate state controls whether the DriverCard modal is visible.
  // focusedDriver stays set when user clicks "Ask engineer" (radio needs it).
  const [driverCardOpen, setDriverCardOpen] = useState(false)

  const totalLaps = inferTotalLaps(analysis)
  const sessionType = getSessionType(analysis.race.session_name)

  const focusedDriverRow = focusedDriver
    ? analysis.true_pace.find((d) => d.driver_code === focusedDriver.code)
    : null

  const handleDriverFocus = (code: string, name: string) => {
    setFocusedDriver(code, name)
    setDriverCardOpen(true)
  }

  const handleCloseDriverCard = () => {
    clearFocusedDriver()
    setDriverCardOpen(false)
  }

  const handleAskEngineerAboutDriver = () => {
    // Keep focusedDriver in store so RadioOverlay shows the focused-driver context
    setDriverCardOpen(false)
    setRadioOpen(true)
  }

  const visibleNotes = focusedDriver
    ? analysis.engineer_notes.filter(
        (n) => n.title.includes(focusedDriver.code) || n.message.includes(focusedDriver.code)
      )
    : analysis.engineer_notes

  return (
    <div className="max-w-[1440px] mx-auto px-4 py-4 space-y-3">
      {/* Race header */}
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-display font-black text-[20px] uppercase tracking-[-0.5px] text-text-primary">
            {analysis.race.meeting_name}
          </div>
          <div className="font-mono text-[11px] text-text-secondary mt-0.5">
            {analysis.race.circuit_short_name} · {analysis.race.year} · {analysis.race.session_name}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-mono font-bold text-[18px] text-signal-red">{analysis.chaos.score}</div>
            <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">Chaos</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-[18px] text-text-primary">{analysis.true_pace.length}</div>
            <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">Drivers</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-bold text-[18px] text-text-primary">{analysis.tyre_degradation.length}</div>
            <div className="font-display text-[8px] uppercase tracking-[1px] text-text-muted">Stints</div>
          </div>
          <div className={`px-3 py-1 rounded-[3px] font-display font-bold text-[10px] uppercase tracking-[1px] ${
            analysis.chaos.level === 'Extreme' ? 'bg-signal-red/20 text-signal-red border border-signal-red/30'
              : analysis.chaos.level === 'High' ? 'bg-signal-amber/20 text-signal-amber border border-signal-amber/30'
              : 'bg-signal-green/20 text-signal-green border border-signal-green/30'
          }`}>
            {analysis.chaos.level} Chaos
          </div>
        </div>
      </div>

      {/* Always-visible timeline — Race gets phase timeline, others get classic */}
      {sessionType === 'Race' && (analysis.race_phases ?? []).length > 0
        ? (
          <RacePhaseTimeline
            phases={analysis.race_phases}
            totalLaps={totalLaps}
          />
        ) : (
          <SessionTimelineBar
            totalLaps={totalLaps}
            sessionType={sessionType}
            engineerNotes={analysis.engineer_notes}
            pitEvents={analysis.pit_impact}
            chaosIndex={analysis.chaos}
          />
        )
      }
      <AnalysisModeToggle
        mode={analysisMode}
        sessionType={sessionType}
        lapCount={totalLaps}
        onChange={setAnalysisMode}
      />
      <DriverFocusStrip
        driverCode={focusedDriver?.code ?? null}
        driverName={focusedDriver?.name ?? null}
        onClear={handleCloseDriverCard}
      />

      {/* Animated view switch */}
      <AnimatePresence mode="wait">
        {analysisMode === 'strategy' ? (
          <motion.div
            key="strategy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <StrategyViewGrid
              analysis={analysis}
              sessionType={sessionType}
              focusedDriver={focusedDriver?.code ?? null}
              onDriverClick={handleDriverFocus}
              onSwitchToData={() => setAnalysisMode('data')}
            />
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
              focusedDriver={focusedDriver?.code ?? null}
              visibleNotes={visibleNotes}
              onDriverClick={handleDriverFocus}
              onBackToStrategy={() => setAnalysisMode('strategy')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Driver card modal — shown only when driverCardOpen AND we have a row */}
      {focusedDriverRow && driverCardOpen && (
        <DriverCard
          driver={focusedDriverRow}
          stints={analysis.tyre_degradation.filter((s) => s.driver_number === focusedDriverRow.driver_number)}
          pits={analysis.pit_impact.filter((p) => p.driver_number === focusedDriverRow.driver_number)}
          raceName={analysis.race.meeting_name}
          onClose={handleCloseDriverCard}
          onAskEngineer={handleAskEngineerAboutDriver}
        />
      )}

      {radioOpen && <RadioOverlay analysis={analysis} onClose={() => setRadioOpen(false)} />}
    </div>
  )
}
