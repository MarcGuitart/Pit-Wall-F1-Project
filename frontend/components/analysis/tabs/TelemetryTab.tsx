'use client'

import type { FullRaceAnalysis } from '@/types'
import { CircuitTelemetryReplay } from '../CircuitTelemetryReplay'
import { ui } from '@/components/ui'
import a from '../analysis.module.css'

type Props = {
  sessionKey: number
  analysis: FullRaceAnalysis
}

export function TelemetryTab({ sessionKey, analysis }: Props) {
  return (
    <div className={a.stack}>
      {/* Panel header */}
      <div className={a.toolbar} style={{ borderBottom: 0 }}>
        <div>
          <h3 className={ui.h6}>Circuit Telemetry</h3>
          <div className={ui.sub}>Fastest clean lap · FastF1 · SVG replay</div>
        </div>
        <div className={ui.sub}>
          {analysis.race.circuit_short_name ?? analysis.race.meeting_name} · {analysis.race.year}
        </div>
      </div>

      <CircuitTelemetryReplay sessionKey={sessionKey} analysis={analysis} />
    </div>
  )
}
