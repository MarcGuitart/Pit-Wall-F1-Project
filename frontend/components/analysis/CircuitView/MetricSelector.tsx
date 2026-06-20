'use client'

import type { TelemetryMetric } from '@/types/telemetry'

const METRICS: TelemetryMetric[] = ['SPEED', 'THROTTLE', 'BRAKE', 'GEAR']

type Props = {
  active: TelemetryMetric
  onChange: (metric: TelemetryMetric) => void
  multiDriver: boolean
}

export function MetricSelector({ active, onChange, multiDriver }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-display font-bold text-[8px] uppercase tracking-[1px] text-text-muted mr-1">
        Metric
      </span>
      <div className="flex items-center gap-1">
        {METRICS.map((m) => {
          const isActive = m === active
          return (
            <button
              key={m}
              onClick={() => onChange(m)}
              className={[
                'px-2.5 py-1 rounded-[3px] border font-display font-bold text-[9px] uppercase tracking-[0.5px] transition-all',
                isActive
                  ? 'bg-signal-red border-signal-red text-white'
                  : 'border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary',
              ].join(' ')}
            >
              {m}
            </button>
          )
        })}
      </div>
      {multiDriver && (
        <span className="font-mono text-[8px] text-text-muted">
          Multi-driver: team colours used, metric shown as line weight
        </span>
      )}
    </div>
  )
}
