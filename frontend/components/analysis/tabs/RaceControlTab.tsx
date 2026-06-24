'use client'

import { useState } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { ChaosProfile } from '../strategy/ChaosProfile'
import { EngineerSignalSummary } from '../strategy/EngineerSignalSummary'
import { DataViewTables } from '../data/DataViewTables'

type Props = {
  analysis: FullRaceAnalysis
  sessionType: SessionType
  focusedDriver: string | null
  visibleNotes: FullRaceAnalysis['engineer_notes']
  onDriverClick: (code: string, name: string) => void
}

export function RaceControlTab({
  analysis,
  sessionType,
  focusedDriver,
  visibleNotes,
  onDriverClick,
}: Props) {
  const [showDataTables, setShowDataTables] = useState(false)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ChaosProfile chaos={analysis.chaos} />
        <EngineerSignalSummary
          notes={visibleNotes}
          onViewAll={() => setShowDataTables(true)}
        />
      </div>

      {/* Data tables expand */}
      {showDataTables ? (
        <DataViewTables
          analysis={analysis}
          sessionType={sessionType}
          focusedDriver={focusedDriver}
          visibleNotes={visibleNotes}
          onDriverClick={onDriverClick}
          onBackToStrategy={() => setShowDataTables(false)}
        />
      ) : (
        <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-secondary">
              Full Data Tables
            </div>
            <div className="font-mono text-[9px] text-text-muted mt-0.5">
              Lap times, stints, pit stops, exclusion logs
            </div>
          </div>
          <button
            onClick={() => setShowDataTables(true)}
            className="px-3 py-1.5 rounded-[3px] border border-border-default text-text-secondary hover:border-signal-blue hover:text-signal-blue font-display font-bold text-[10px] uppercase tracking-[1px] transition-all"
          >
            Open Tables
          </button>
        </div>
      )}
    </div>
  )
}
