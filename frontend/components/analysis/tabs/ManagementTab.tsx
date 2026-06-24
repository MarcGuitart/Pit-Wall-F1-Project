'use client'

import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { TyreCliffMap } from '../strategy/TyreCliffMap'
import { PitSequenceSummary } from '../strategy/PitSequenceSummary'
import { DRSTrainDetector } from '../strategy/DRSTrainDetector'
import { CleanAirValueCard } from '../CleanAirValueCard'
import { DRSTrainDetector as DRSStub } from '../stubs/DRSTrainDetector'

type Props = {
  analysis: FullRaceAnalysis
  sessionType: SessionType
  focusedDriver: string | null
  onDriverClick: (code: string, name: string) => void
  onSwitchToData: () => void
}

export function ManagementTab({
  analysis,
  sessionType,
  focusedDriver: _focusedDriver,
  onDriverClick,
  onSwitchToData,
}: Props) {
  const click = (code: string) => {
    const d = analysis.true_pace.find((r) => r.driver_code === code)
    onDriverClick(code, d?.team_name ?? code)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <TyreCliffMap
          degradationRows={analysis.tyre_degradation}
          onDriverClick={click}
          sessionType={sessionType}
        />
        <PitSequenceSummary
          pitImpactRows={analysis.pit_impact}
          onDriverClick={click}
          onViewAll={onSwitchToData}
          sessionType={sessionType}
        />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {analysis.drs_trains
          ? <DRSTrainDetector drs={analysis.drs_trains} />
          : <DRSStub />
        }
        <CleanAirValueCard data={analysis.clean_air_value ?? null} />
      </div>
    </div>
  )
}
