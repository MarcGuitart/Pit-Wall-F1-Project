'use client'

import type { FullRaceAnalysis } from '@/types'
import type { SessionType } from '@/lib/utils'
import { TyreCliffMap } from '../strategy/TyreCliffMap'
import { PitSequenceSummary } from '../strategy/PitSequenceSummary'
import { DRSTrainDetector } from '../strategy/DRSTrainDetector'
import { CleanAirValueCard } from '../CleanAirValueCard'
import { ModuleUnavailable } from '../ModuleUnavailable'
import { Cells } from '@/components/ui'
import a from '../analysis.module.css'

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
    <div className={a.stack}>
      <Cells cols={2}>
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
      </Cells>
      <Cells cols={2}>
        {analysis.drs_trains && analysis.drs_trains.meaningful_trains.length > 0
          ? <DRSTrainDetector drs={analysis.drs_trains} />
          : <ModuleUnavailable title="DRS Train Detector" analysis={analysis} field="drs_trains" />
        }
        {analysis.modules?.clean_air_value?.status === 'failed'
          ? <ModuleUnavailable title="Clean Air Value" analysis={analysis} field="clean_air_value" />
          : <CleanAirValueCard data={analysis.clean_air_value ?? null} />
        }
      </Cells>
    </div>
  )
}
