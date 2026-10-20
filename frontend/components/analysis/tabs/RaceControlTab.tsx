'use client'

import { useState } from 'react'
import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { ChaosProfile } from '../strategy/ChaosProfile'
import { EngineerSignalSummary } from '../strategy/EngineerSignalSummary'
import { DataViewTables } from '../data/DataViewTables'
import { Cells, buttonClass, ui } from '@/components/ui'
import a from '../analysis.module.css'

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
    <div className={a.stack}>
      <Cells cols={2}>
        <ChaosProfile chaos={analysis.chaos} />
        <EngineerSignalSummary
          notes={visibleNotes}
          onViewAll={() => setShowDataTables(true)}
        />
      </Cells>

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
        <div className={a.toolbar} style={{ borderBottom: 0 }}>
          <div>
            <h3 className={ui.h6}>Full Data Tables</h3>
            <div className={ui.sub}>Lap times, stints, pit stops, exclusion logs</div>
          </div>
          <button type="button" onClick={() => setShowDataTables(true)} className={buttonClass('ink')}>
            Open Tables
          </button>
        </div>
      )}
    </div>
  )
}
