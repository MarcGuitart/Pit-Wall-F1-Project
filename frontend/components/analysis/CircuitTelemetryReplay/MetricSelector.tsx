'use client'

import { Segmented, ui } from '@/components/ui'
import t from './telemetry.module.css'

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
    <div className={t.group}>
      <span className={ui.label}>Metric</span>
      <Segmented small label="Metric" value={active} onChange={onChange} options={METRICS.map((m) => ({ value: m.id, label: m.label }))} />
      {multiDriver && <span className={ui.sub}>Multi-driver: team colours, speed as line weight</span>}
    </div>
  )
}
