'use client'

import type { FullRaceAnalysis } from '@/types'
import { CircuitTelemetryReplay } from '../CircuitTelemetryReplay'

type Props = {
  sessionKey: number
  analysis: FullRaceAnalysis
}

export function TelemetryTab({ sessionKey, analysis }: Props) {
  return (
    <div className="space-y-3">
      {/* Panel header */}
      <div className="bg-bg-panel border border-border-subtle rounded-[4px] px-3 py-2 flex items-center justify-between">
        <div>
          <div className="font-display font-bold text-[10px] uppercase tracking-[1.5px] text-text-secondary">
            Circuit Telemetry
          </div>
          <div className="font-mono text-[9px] text-text-muted mt-0.5">
            Fastest clean lap · FastF1 · SVG replay
          </div>
        </div>
        <div className="font-mono text-[9px] text-text-muted">
          {analysis.race.circuit_short_name ?? analysis.race.meeting_name} · {analysis.race.year}
        </div>
      </div>

      <CircuitTelemetryReplay sessionKey={sessionKey} analysis={analysis} />
    </div>
  )
}
