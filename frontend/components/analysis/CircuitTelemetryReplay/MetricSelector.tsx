'use client'

export type ActiveMetric = 'speed' | 'throttle' | 'brake' | 'gear'

const METRICS: { id: ActiveMetric; label: string }[] = [
  { id: 'speed',    label: 'Speed' },
  { id: 'throttle', label: 'Throttle' },
  { id: 'brake',    label: 'Brake' },
  { id: 'gear',     label: 'Gear' },
]

type Props = {
  active: ActiveMetric
  onChange: (metric: ActiveMetric) => void
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
          const isActive = m.id === active
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              className={[
                'px-2.5 py-1 rounded-[3px] border font-display font-bold text-[9px] uppercase tracking-[0.5px] transition-all',
                isActive
                  ? 'bg-signal-red border-signal-red text-white'
                  : 'border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary',
              ].join(' ')}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      {multiDriver && (
        <span className="font-mono text-[8px] text-text-muted">
          Multi-driver: team colours, speed as line weight
        </span>
      )}
    </div>
  )
}
